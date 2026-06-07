"use client";
import { useMemo, useState } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { useRollups } from "@/lib/hooks";
import {
  formatCompact,
  formatPeriodDate,
  weiToFloat,
} from "@/lib/format";
import { nz } from "@/lib/quai/types";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ProtocolEventLines } from "@/components/dashboard/shared/ProtocolEventLines";
import { SamplingFootnote } from "@/components/dashboard/shared/SamplingFootnote";
import { InfoPopover } from "@/components/ui/InfoPopover";
import { ChartTooltip } from "@/components/ui/ChartTooltip";
import { ChartLegend, type ChartLegendItem } from "@/components/ui/ChartLegend";
import { ChartSkeleton } from "@/components/ui/ChartSkeleton";
import {
  TimeframeToggle,
  type Timeframe,
} from "@/components/dashboard/shared/TimeframeToggle";
import {
  SOAP_ACTIVATION_DATE,
  applyLockupMultiplier,
  lockupDays,
} from "@/lib/quai/protocol-constants";
import { cn } from "@/lib/utils";

// Lockup-byte simulation modes. "real" = today's math (no multiplier, no
// unlock shift). "byte0..3" = "what if every miner picked byte N from
// genesis" — applies the multiplier to per-block reward and shifts the
// cumulative curve right by the byte's lockup duration to draw the
// unlocked-supply line.
type LockupMode = "mined" | 0 | 1 | 2 | 3;

const SOAP_WINDOW_OPTIONS: Timeframe[] = ["7d", "30d", "90d", "1y", "all"];

const LOCKUP_LABELS: Record<Exclude<LockupMode, "mined">, string> = {
  0: "14 days",
  1: "90 days",
  2: "180 days",
  3: "365 days",
};

// Year-1 reward bonus per byte, used in the explainer copy. Y1 anchor
// in % over 1.0×, sourced from LOCKUP_MULTIPLIER_ANCHORS.
const LOCKUP_BONUS_PCT: Record<Exclude<LockupMode, "mined">, string> = {
  0: "0%",
  1: "+3.5%",
  2: "+10%",
  3: "+25%",
};

function timeframeFromToIso(timeframe: Timeframe, to: string): string {
  if (timeframe === "all") return SOAP_ACTIVATION_DATE;
  const days = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 }[timeframe];
  const d = new Date(to + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  const from = d.toISOString().slice(0, 10);
  return from > SOAP_ACTIVATION_DATE ? from : SOAP_ACTIVATION_DATE;
}

// SoapMiningChart — cumulative QUAI mined and cumulative SOAP burn over the
// visible window, zero-anchored at the first row so the gap between the two
// lines is "net mining contribution to circulating in this window."
//
// Why this needs its own chart: the supply-story chart on top uses
// quai_total_end (RPC's quaiSupplyTotal), which mixes mining issuance with
// conversions and genesis unlocks. This chart isolates mining-only
// emissions to QUAI-winner blocks alongside the SOAP-burn rebased to the
// same start date.
//
// Per-period math (rollup columns):
//
//   workshare_total   = ws_kawpow_sum + ws_progpow_sum + ws_sha_sum + ws_scrypt_sum
//   rewardable_shares = block_count + workshare_total
//   total_mining_wei  = rewardable_shares × workshare_reward_avg
//   quai_paid_wei     = total_mining_wei × (winner_quai_count / block_count)
//   burn_in_window   = burn_close[t] − burn_close[first row]
//   net              = cumulative_mined − burn_in_window
//
// Notes:
//   • Pre-SOAP rows are filtered out for mining (NULL columns).
//   • Post-SOAP, go-quai splits the block reward across the winning block share
//     plus included workshares. `base_block_reward_sum` is the reward pool, not
//     an additional full payout to the block producer.
//   • Qi-winner blocks pay miners in Qi, not QUAI — so they don't add to
//     the mined curve.
//   • Burn anchor is the first row's burn_close in the response. Subsequent
//     rows subtract that anchor to give cumulative burn over the visible
//     window.
//   • Uncled workshares get redistributed within a block, not removed from
//     the per-share reward pool, so rewardable_shares × workshare_reward_avg
//     remains the right network-level estimate when uncled sums are zero.

export function SoapMiningChart({ to }: { to: string }) {
  const [timeframe, setTimeframe] = useState<Timeframe>("30d");
  const [mode, setMode] = useState<LockupMode>("mined");
  const from = useMemo(
    () => timeframeFromToIso(timeframe, to),
    [timeframe, to],
  );
  const { data, isLoading, error } = useRollups({ period: "day", from, to });

  const chartData = useMemo(() => {
    if (!data) return [];
    // Track BOTH the actual (no-multiplier) cumulative and the simulation
    // cumulative in parallel. Actual is the reference line always shown so
    // users can see issued > actual when sim multiplier > 1.
    let cumActual = 0n;
    let cumSim = 0n;
    let burnAnchor: bigint | null = null;
    type Row = {
      date: string;
      cumActual: bigint;
      cumSim: bigint;
      burned: bigint;
    };
    const rows: Row[] = [
      { date: from, cumActual: 0n, cumSim: 0n, burned: 0n },
    ];
    for (const r of data) {
      // Capture the burn anchor on the very first row regardless of mining
      // data. burn_close is dense across all rollup rows.
      if (burnAnchor === null) burnAnchor = r.burnClose;

      // Skip rows where the SOAP-era reward columns aren't populated. This
      // catches both pre-SOAP rows and any tail-mode rows where the rollup
      // hasn't yet picked up mining_info samples for the period.
      if (r.workshareRewardAvg == null || r.blockCount === 0) {
        continue;
      }
      const wsReward = nz(r.workshareRewardAvg);
      const wsTotal =
        nz(r.wsKawpowSum) + nz(r.wsProgpowSum) + nz(r.wsShaSum) + nz(r.wsScryptSum);
      const shareTotal = BigInt(r.blockCount) + wsTotal;
      const baseTotalWei = wsReward * shareTotal;

      // Sim total: apply multiplier when not in "mined" or byte-0 mode.
      // The multiplier depends on the zone block number; use the period's
      // last_block as the representative (sub-percent error within a Y1-
      // anchor day, small even mid-decay).
      let simTotalWei = baseTotalWei;
      if (mode !== "mined" && mode !== 0) {
        simTotalWei = applyLockupMultiplier(baseTotalWei, mode, BigInt(r.lastBlock));
      }

      const winnerQuai = BigInt(r.winnerQuaiCount);
      const blocks = BigInt(r.blockCount);
      const actualEmit =
        blocks > 0n ? (baseTotalWei * winnerQuai) / blocks : 0n;
      const simEmit =
        blocks > 0n ? (simTotalWei * winnerQuai) / blocks : 0n;
      cumActual += actualEmit;
      cumSim += simEmit;

      const burnSinceSoap = r.burnClose - (burnAnchor ?? 0n);
      rows.push({
        date: r.periodStart,
        cumActual,
        cumSim,
        burned: burnSinceSoap,
      });
    }

    // Build the unlocked series by shifting the simulated-issued curve
    // right by the byte's lockup duration in days. Daily granularity makes
    // this a simple index lookup (off by ≤1 day vs exact block-count math).
    const shiftDays = mode === "mined" ? 0 : lockupDays(mode);
    return rows.map((row, i) => {
      const unlockedSrcIdx = i - shiftDays;
      const cumUnlocked =
        unlockedSrcIdx >= 0 ? rows[unlockedSrcIdx].cumSim : 0n;
      const netWei = row.cumActual - row.burned;
      return {
        date: row.date,
        // In Mined mode, the headline blue line IS the actual mined value.
        // In sim mode, the headline blue line is the multiplier-scaled
        // issued, and `actual` becomes the faint reference line.
        mined: weiToFloat(row.cumSim, 0),
        actual: weiToFloat(row.cumActual, 0),
        unlocked: weiToFloat(cumUnlocked, 0),
        burned: weiToFloat(row.burned, 0),
        net: weiToFloat(netWei, 0),
      };
    });
  }, [data, from, mode]);

  const last = chartData[chartData.length - 1];
  const showSimSeries = mode !== "mined";

  const legendItems: ChartLegendItem[] = showSimSeries
    ? [
        {
          label: "Cumulative QUAI mined (actual)",
          color: "#10b981",
          dasharray: "4 3",
        },
        { label: "Cumulative issued (sim)", color: "#e20101" },
        { label: "Cumulative unlocked (sim)", color: "#a855f7" },
        { label: "Cumulative SOAP burn", color: "#f0a16d" },
      ]
    : [
        { label: "Cumulative QUAI mined", color: "#e20101" },
        { label: "Cumulative SOAP burn", color: "#f0a16d" },
        { label: "Net (mined − burned)", color: "#10b981", dasharray: "3 3" },
      ];

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <CardTitle>QUAI mining vs SOAP burn since SOAP</CardTitle>
        <div className="flex items-center gap-1">
          <SamplingFootnote kind="averaged" />
          <InfoPopover label="About SOAP mining vs burn">
            <p>
              <span className="font-medium">Mined per period</span>:{" "}
              <code>
                (block_count + ws_*_sum) × workshare_reward_avg
              </code>
              , because the block share and each included workshare receive a
              per-share reward. The result is gated to QUAI payout via{" "}
              <code>winner_quai_count / block_count</code>.
            </p>
            <p className="mt-2">
              <span className="font-medium">Burned in window</span>:{" "}
              <code>burn_close[t] − burn_close[first row]</code>. The
              anchor is the first visible rollup row, so the orange line
              starts at zero and accumulates only burns in the selected window.
            </p>
            <p className="mt-2">
              <span className="font-medium">Lockup simulation</span>: the
              byte toggle re-runs the chart as if every miner had elected
              that lockup byte from cyprus1 genesis. Multiplier comes from
              go-quai's <code>CalculateLockupByteRewardsMultiple</code> at
              the period's last block (Y1 anchor through code year 0,
              linearly decaying to a Y5 floor over years 1–4). The
              "unlocked" line shifts the cumulative-issued curve right by
              the byte's lockup duration; the gap is the lockup overhang.
            </p>
            <p className="mt-2 text-slate-900/55 dark:text-white/55">
              Real chain has heterogeneous miner byte choices and matures
              into <code>quaiSupplyTotal</code> at unlock time. The supply
              story chart above is the actual matured side.
            </p>
          </InfoPopover>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[0.7rem] uppercase tracking-wider text-slate-900/55 dark:text-white/55">
          Window
        </span>
        <TimeframeToggle
          value={timeframe}
          onChange={setTimeframe}
          options={SOAP_WINDOW_OPTIONS}
        />
        <span className="text-[0.7rem] uppercase tracking-wider text-slate-900/55 dark:text-white/55">
          Lockup scenario
        </span>
        <div
          role="tablist"
          aria-label="Lockup scenario"
          className="inline-flex items-center gap-0.5 rounded-md border border-slate-900/10 p-0.5 dark:border-white/10"
        >
          {(["mined", 0, 1, 2, 3] as const).map((opt) => {
            const active = opt === mode;
            const label =
              opt === "mined"
                ? "Mined"
                : `${LOCKUP_LABELS[opt]} (${LOCKUP_BONUS_PCT[opt]})`;
            return (
              <button
                key={String(opt)}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMode(opt)}
                className={cn(
                  "rounded px-2 py-0.5 text-xs transition",
                  active
                    ? "bg-slate-900/10 text-slate-900 dark:bg-white/15 dark:text-white"
                    : "text-slate-700 hover:text-slate-900 dark:text-white/60 dark:hover:text-white/90",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <ChartLegend items={legendItems} className="mt-3" />

      <div className="mt-3 h-72 sm:h-80">
        {isLoading || !data ? (
          <ChartSkeleton />
        ) : error ? (
          <div className="text-sm text-quai-600 dark:text-quai-400">
            {String(error)}
          </div>
        ) : chartData.length <= 1 ? (
          <div className="text-sm text-slate-900/50 dark:text-white/50">
            No SOAP-era rollups in this range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              syncId="home"
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                stroke="var(--chart-grid-soft)"
                strokeDasharray="2 4"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                tickFormatter={formatPeriodDate}
                tickLine={false}
                axisLine={false}
                minTickGap={48}
              />
              <YAxis
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                tickFormatter={formatCompact}
                tickLine={false}
                axisLine={false}
                width={64}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    labelFormatter={(v) => formatPeriodDate(String(v))}
                    formatter={(v, name) => [
                      `${Number(v).toLocaleString()} QUAI`,
                      name,
                    ]}
                  />
                }
              />
              <ProtocolEventLines visibleFrom={from} visibleTo={to} />
              {showSimSeries && (
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="Cumulative QUAI mined (actual)"
                  stroke="#10b981"
                  strokeWidth={1.4}
                  strokeDasharray="4 3"
                  dot={false}
                  isAnimationActive
                  animationDuration={500}
                  animationEasing="ease-out"
                />
              )}
              <Line
                type="monotone"
                dataKey="mined"
                name={
                  showSimSeries
                    ? "Cumulative issued (sim)"
                    : "Cumulative QUAI mined"
                }
                stroke="#e20101"
                strokeWidth={1.6}
                dot={false}
                isAnimationActive
                animationDuration={500}
                animationEasing="ease-out"
              />
              {showSimSeries && (
                <Line
                  type="monotone"
                  dataKey="unlocked"
                  name="Cumulative unlocked (sim)"
                  stroke="#a855f7"
                  strokeWidth={1.6}
                  dot={false}
                  isAnimationActive
                  animationDuration={500}
                  animationEasing="ease-out"
                />
              )}
              <Line
                type="monotone"
                dataKey="burned"
                name="Cumulative SOAP burn"
                stroke="#f0a16d"
                strokeWidth={1.6}
                dot={false}
                isAnimationActive
                animationDuration={500}
                animationEasing="ease-out"
              />
              {!showSimSeries && (
                <Line
                  type="monotone"
                  dataKey="net"
                  name="Net (mined − burned)"
                  stroke="#10b981"
                  strokeWidth={1.2}
                  strokeDasharray="3 3"
                  dot={false}
                  isAnimationActive
                  animationDuration={500}
                  animationEasing="ease-out"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {last && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-slate-900/50 dark:text-white/50">
          <span>Latest {formatPeriodDate(last.date)}:</span>
          <span>
            {showSimSeries ? "issued" : "mined"}{" "}
            <span className="font-mono text-quai-600 dark:text-quai-400">
              {formatCompact(last.mined)} QUAI
            </span>
          </span>
          {showSimSeries && (
            <span>
              unlocked{" "}
              <span className="font-mono text-purple-600 dark:text-purple-300">
                {formatCompact(last.unlocked)} QUAI
              </span>
            </span>
          )}
          <span>
            burned{" "}
            <span className="font-mono text-amber-600 dark:text-amber-300">
              {formatCompact(last.burned)} QUAI
            </span>
          </span>
          {showSimSeries ? (
            <span>
              overhang{" "}
              <span className="font-mono text-slate-700 dark:text-white/70">
                {formatCompact(last.mined - last.unlocked)} QUAI
              </span>
            </span>
          ) : (
            <span>
              net{" "}
              <span className="font-mono text-emerald-600 dark:text-emerald-300">
                {last.net >= 0 ? "+" : ""}
                {formatCompact(last.net)} QUAI
              </span>
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
