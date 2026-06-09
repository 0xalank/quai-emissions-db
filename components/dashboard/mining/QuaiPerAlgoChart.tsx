"use client";
import { useMemo } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { useCompactViewport, useRollups } from "@/lib/hooks";
import { formatCompact, formatPeriodDate, weiToFloat } from "@/lib/format";
import { nz } from "@/lib/quai/types";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ProtocolEventLines } from "@/components/dashboard/shared/ProtocolEventLines";
import { SamplingFootnote } from "@/components/dashboard/shared/SamplingFootnote";
import { InfoPopover } from "@/components/ui/InfoPopover";
import { ChartTooltip } from "@/components/ui/ChartTooltip";
import { ChartLegend } from "@/components/ui/ChartLegend";
import { ChartSkeleton } from "@/components/ui/ChartSkeleton";

const QUAI_PER_ALGO_LEGEND = [
  { label: "KawPoW (block + workshare)", color: "#e20101" },
  { label: "SHA (workshare)", color: "#f0a16d" },
  { label: "Scrypt (workshare)", color: "#10b981" },
];

// QuaiPerAlgoChart — daily QUAI emission attributed to each SOAP algorithm.
//
// Per period (post-SOAP rows only — pre-SOAP has NULL workshare_reward_avg):
//   block_share_quai = workshare_reward_avg × winner_quai_count
//   workshare_quai   = workshare_reward_avg × ws_<algo>_sum
//                      × (winner_quai_count / block_count)
//
//   KawPoW = block_share_quai + workshare_quai(kawpow)
//   SHA    = workshare_quai(sha)
//   Scrypt = workshare_quai(scrypt)
//
// Post-SOAP, go-quai splits the reward pool into per-share rewards: one share
// for the sealed block plus one for each included workshare. We attribute the
// block share to KawPoW (it seals every block) and workshare rewards by
// ws_<algo>_sum. The (winner_quai_count / block_count) factor strips Qi-winner
// blocks (those pay miners in Qi, not QUAI).
//
// Caveat surfaced in InfoPopover: SHA/Scrypt uncled workshares get their
// reward redistributed to internal-coinbase shares (which can be any algo).
// So this chart shows QUAI emitted via each algo's *workshare slots* —
// honest at the network level, but the QUAI that reaches a miner running
// algo X depends on whether their coinbase resolved.

export function QuaiPerAlgoChart({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  const { data, isLoading, error } = useRollups({ period: "day", from, to });
  const compact = useCompactViewport();

  const chartData = useMemo(() => {
    if (!data) return [];
    // Keep every row in the user's range so the X-axis matches the other
    // mining charts. Pre-SOAP rows naturally produce zeros (NULL ws_reward
    // coerces to 0n via nz), so the stacked
    // area sits flat until SOAP activation and ramps up — visually
    // telegraphing the cutover instead of clipping the timeline.
    return data.map((r) => {
      const blocks = BigInt(r.blockCount);
      if (blocks === 0n) {
        return { date: r.periodStart, kawpow: 0, sha: 0, scrypt: 0 };
      }
      const wsReward = nz(r.workshareRewardAvg);
      const winnerQuai = BigInt(r.winnerQuaiCount);

      const wsKawpowQuai =
        (wsReward * nz(r.wsKawpowSum) * winnerQuai) / blocks;
      const wsShaQuai = (wsReward * nz(r.wsShaSum) * winnerQuai) / blocks;
      const wsScryptQuai =
        (wsReward * nz(r.wsScryptSum) * winnerQuai) / blocks;
      const blockShareQuai = wsReward * winnerQuai;

      return {
        date: r.periodStart,
        kawpow: weiToFloat(blockShareQuai + wsKawpowQuai, 0),
        sha: weiToFloat(wsShaQuai, 0),
        scrypt: weiToFloat(wsScryptQuai, 0),
      };
    });
  }, [data]);

  return (
    <Card>
      <div className="chart-card-header">
        <CardTitle>QUAI rewarded per algorithm</CardTitle>
        <div className="chart-card-actions">
          <SamplingFootnote kind="extrapolated" />
          <InfoPopover label="About QUAI per algorithm">
            <p>
              <span className="font-medium">Per period</span>:
            </p>
            <ul className="mt-1 list-disc pl-4 text-slate-900/70 dark:text-white/70">
              <li>
                <span className="font-medium text-quai-600 dark:text-quai-400">
                  KawPoW
                </span>{" "}
                = <code>workshare_reward_avg</code> × (
                <code>winner_quai_count</code> +{" "}
                <code>
                  ws_kawpow_sum × winner_quai_count / block_count
                </code>
                )
              </li>
              <li>
                <span className="font-medium text-amber-600 dark:text-amber-300">
                  SHA / Scrypt
                </span>{" "}
                = <code>workshare_reward_avg × ws_&lt;algo&gt;_sum</code> ×{" "}
                <code>winner_quai_count / block_count</code>
              </li>
            </ul>
            <p className="mt-2">
              The <code>winner_quai_count / block_count</code> factor strips
              Qi-winner blocks (which pay miners in Qi, not QUAI).
            </p>
            <p className="mt-2 text-slate-900/55 dark:text-white/55">
              Caveat: when a SHA or Scrypt workshare's coinbase is foreign
              (uncled), its reward is redistributed to internal-coinbase
              shares — which can land on any algo. So this chart is an
              honest network-level "QUAI emitted via algo X workshare slots,"
              but the QUAI that reaches a specific miner running algo X
              depends on coinbase resolution and redistribution.
            </p>
          </InfoPopover>
        </div>
      </div>

      <ChartLegend items={QUAI_PER_ALGO_LEGEND} className="mt-3" />

      <div className="chart-shell">
        {isLoading || !data ? (
          <ChartSkeleton />
        ) : error ? (
          <div className="text-sm text-quai-600 dark:text-quai-400">{String(error)}</div>
        ) : data.length === 0 ? (
          <div className="text-sm text-slate-900/50 dark:text-white/50">
            No rollup data in this range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                minTickGap={compact ? 72 : 48}
              />
              <YAxis
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                tickFormatter={formatCompact}
                tickLine={false}
                axisLine={false}
                width={compact ? 48 : 64}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    labelFormatter={(v) => formatPeriodDate(String(v))}
                    formatter={(v, name) => [
                      `${formatCompact(Number(v))} QUAI`,
                      name,
                    ]}
                  />
                }
              />
              <ProtocolEventLines visibleFrom={from} visibleTo={to} />
              <Area
                type="monotone"
                dataKey="kawpow"
                name="KawPoW (block + workshare)"
                stackId="quai"
                stroke="#e20101"
                fill="#e20101"
                fillOpacity={0.7}
                isAnimationActive
                animationDuration={500}
                animationEasing="ease-out"
              />
              <Area
                type="monotone"
                dataKey="sha"
                name="SHA (workshare)"
                stackId="quai"
                stroke="#f0a16d"
                fill="#f0a16d"
                fillOpacity={0.7}
                isAnimationActive
                animationDuration={500}
                animationEasing="ease-out"
              />
              <Area
                type="monotone"
                dataKey="scrypt"
                name="Scrypt (workshare)"
                stackId="quai"
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.7}
                isAnimationActive
                animationDuration={500}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
