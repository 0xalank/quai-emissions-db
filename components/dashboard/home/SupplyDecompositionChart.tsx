"use client";
import { useMemo, useState } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { useSupply } from "@/lib/hooks";
import {
  formatCompact,
  formatPeriodDate,
  weiToFloat,
} from "@/lib/format";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ProtocolEventLines } from "@/components/dashboard/shared/ProtocolEventLines";
import { InfoPopover } from "@/components/ui/InfoPopover";
import { ChartTooltip } from "@/components/ui/ChartTooltip";
import { ChartLegend } from "@/components/ui/ChartLegend";
import { ChartSkeleton } from "@/components/ui/ChartSkeleton";
import { cn } from "@/lib/utils";
import { cumulativeUnlockedPostSingularity } from "@/lib/quai/genesis-schedule";

const DECOMPOSITION_LEGEND = [
  { label: "Total Supply", color: "#e20101" },
  { label: "Circulating Mined Supply", color: "#06b6d4", dasharray: "4 3" },
];
const TOTAL_SUPPLY_LEGEND = [{ label: "Total Supply", color: "#e20101" }];

// Projection assumptions:
//   • Mining: 800 000 QUAI / day, flat. Reasonable steady-state estimate;
//     in reality block reward decays log(diff) but the multi-year story
//     dominates over second-order curvature.
//   • Genesis: replays the actual go-quai unlock schedule with Singularity
//     forfeiture applied (lib/quai/genesis-schedule.ts). Anchors on today's
//     real on-chain genesis value and adds scheduled deltas forward.
//   • SOAP burn: fixed at 90% of gross mining (720 K/day burn, net 80 K/day).
const PROJECTION_YEARS = 6;
const MINING_PER_DAY_WEI = 800_000n * 10n ** 18n;
const BURN_PER_DAY_WEI = (MINING_PER_DAY_WEI * 90n) / 100n;
// Vesting plateau: m48 (2029-01-08) is the last on-chain unlock under
// per-account forfeiture (post-Singularity). Cumulative reaches exactly
// 1,332,840,016 QUAI here; m49–m72 are entirely forfeit accounts.
const VESTING_END_DATE = "2029-01-08";

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const ms =
    new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime();
  return Math.round(ms / 86_400_000);
}

function capAtSupply(value: bigint, supply: bigint): bigint {
  return value > supply ? supply : value;
}

export function SupplyDecompositionChart({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  const [forecast, setForecast] = useState(false);

  const { data, isLoading, error } = useSupply({
    period: "day",
    from,
    to,
    include: ["burn", "mined"],
  });

  const lastRow = data?.[data.length - 1];
  const minedPending =
    !!data &&
    data.length > 0 &&
    data.some(
      (r) => r.minedExact !== true || r.cumulativeMinedQuai == null,
    );

  const chartData = useMemo(() => {
    if (!data) return [];

    const historical = data.map((r) => {
      const grossMined = r.cumulativeMinedQuai ?? 0n;
      const mined = capAtSupply(grossMined, r.quaiTotalEnd);
      return {
        date: r.periodStart,
        totalSupply: weiToFloat(r.quaiTotalEnd, 0),
        mined: minedPending ? undefined : weiToFloat(mined, 0),
      };
    });

    if (!forecast || !lastRow || minedPending) return historical;

    const anchorDate = lastRow.periodStart;
    const anchorMined = lastRow.cumulativeMinedQuai ?? 0n;
    const anchorBurn = lastRow.burnClose ?? 0n;
    const anchorMinedNet =
      anchorMined > anchorBurn ? anchorMined - anchorBurn : 0n;
    const anchorGenesis =
      lastRow.quaiTotalEnd > anchorMinedNet
        ? lastRow.quaiTotalEnd - anchorMinedNet
        : 0n;

    // Project anchorGenesis + (scheduled[future] − scheduled[anchor]) so
    // any small skew between the on-chain real number and the schedule
    // gets absorbed at t=0. The schedule is a step function keyed by
    // date string — cache the lookup so we don't re-parse dates and walk
    // the schedule table 2 190 times per recompute.
    const scheduleCache = new Map<string, bigint>();
    const sched = (iso: string): bigint => {
      const hit = scheduleCache.get(iso);
      if (hit !== undefined) return hit;
      const v = cumulativeUnlockedPostSingularity(iso);
      scheduleCache.set(iso, v);
      return v;
    };
    const scheduledAtAnchor = sched(anchorDate);

    const horizonDate = addDays(anchorDate, PROJECTION_YEARS * 365);
    const projection: typeof historical = [];
    const totalDays = daysBetween(anchorDate, horizonDate);
    // Daily granularity to match the historical series — sparser sampling
    // makes recharts' line interpolation look kinked at the anchor and
    // visually flattens the projection slope.
    for (let dayOffset = 1; dayOffset <= totalDays; dayOffset += 1) {
      const date = addDays(anchorDate, dayOffset);
      const offsetBig = BigInt(dayOffset);

      const grossMinedWei = anchorMined + MINING_PER_DAY_WEI * offsetBig;
      const burnWei = anchorBurn + BURN_PER_DAY_WEI * offsetBig;

      const scheduledAtDate = sched(date);
      const scheduledDelta =
        scheduledAtDate > scheduledAtAnchor
          ? scheduledAtDate - scheduledAtAnchor
          : 0n;
      const genesisWei = anchorGenesis + scheduledDelta;
      const totalSupplyWei = genesisWei + grossMinedWei - burnWei;
      const minedWei = capAtSupply(grossMinedWei, totalSupplyWei);

      projection.push({
        date,
        totalSupply: weiToFloat(totalSupplyWei, 0),
        mined: weiToFloat(minedWei, 0),
      });
    }

    return [...historical, ...projection];
  }, [data, forecast, lastRow, minedPending]);

  const projectionRange = useMemo(() => {
    if (!forecast || !lastRow || minedPending) return null;
    return {
      from: lastRow.periodStart,
      to: addDays(lastRow.periodStart, PROJECTION_YEARS * 365),
    };
  }, [forecast, lastRow, minedPending]);

  // Single pass over chartData (~2,700 rows when forecast is on) computes
  // two independent things:
  //   1. vestingMarkerDate: snap to the first projection sample at or
  //      after VESTING_END_DATE. Required because the XAxis is
  //      category-based and ReferenceLine x must match an exact data point.
  //   2. xAxisTicks: every Jan 1 / Jul 1 row, for evenly-spaced ticks on
  //      the category-based axis.
  const { vestingMarkerDate, xAxisTicks } = useMemo(() => {
    let vest: string | null = null;
    const ticks: string[] = [];
    const seen = new Set<string>();
    for (const r of chartData) {
      if (forecast && vest == null && r.date >= VESTING_END_DATE) vest = r.date;
      const md = r.date.slice(5);
      if ((md === "01-01" || md === "07-01") && !seen.has(r.date)) {
        seen.add(r.date);
        ticks.push(r.date);
      }
    }
    return { vestingMarkerDate: vest, xAxisTicks: ticks };
  }, [chartData, forecast]);

  const visibleTo = forecast && projectionRange ? projectionRange.to : to;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <CardTitle>QUAI Supply</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setForecast((v) => !v)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition",
              forecast
                ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-700 dark:border-cyan-400/60 dark:bg-cyan-400/10 dark:text-cyan-200"
                : "border-slate-300/70 text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-white/70 dark:hover:bg-white/5",
            )}
            aria-pressed={forecast}
          >
            {forecast ? "Hide forecast" : "Project 6 yr"}
          </button>
          <InfoPopover label="About the supply decomposition">
            <p className="font-medium">Supply and mined issuance</p>
            <p className="mt-1 text-slate-900/70 dark:text-white/70">
              Shows <code>quaiSupplyTotal</code> alongside cumulative mined
              issuance.
            </p>
            <ul className="mt-2 list-disc pl-4 text-slate-900/70 dark:text-white/70">
              <li>
                <span className="font-medium text-quai-600 dark:text-quai-400">
                  Total Supply
                </span>{" "}
                : <code>quaiTotalEnd</code>, the realized QUAI supply at each
                period close.
              </li>
              <li>
                <span className="font-medium text-cyan-600 dark:text-cyan-300">
                  Circulating Mined Supply
                </span>{" "}
                : <code>cumulativeMinedQuai</code>, capped to the current total
                supply for display.
              </li>
            </ul>
            <p className="mt-2 font-medium">Forecast assumptions</p>
            <ul className="mt-1 list-disc pl-4 text-slate-900/70 dark:text-white/70">
              <li>
                Gross mining: <strong>800 K QUAI/day</strong> flat for 6 yr.
              </li>
              <li>
                Genesis: replays the actual{" "}
                <strong>go-quai vesting schedule</strong> from{" "}
                <code>params/genesis_alloc.json</code> with Singularity
                forfeiture applied per <code>core/state/gen_allocs.go</code>.
                Cumulative tops out at exactly 1,332,840,016 QUAI at m48 (
                <strong>{VESTING_END_DATE}</strong>) — the schedule-1 tail
                (m49–m72) is entirely forfeit accounts, so the line stays
                flat thereafter.
              </li>
              <li>
                SOAP burn: fixed at <strong>90% of gross mining</strong>
                {" "}(burn 720 K/day, net 80 K/day).
              </li>
            </ul>
            <p className="mt-2 text-slate-900/55 dark:text-white/55">
              The vesting schedule is exact to ~152 µQUAI rounding (sub-cent at
              any plausible token price); mining and burn projections remain
              first-order — block rewards decay log(difficulty), and burn
              velocity tracks parent-chain hashrate.
            </p>
          </InfoPopover>
        </div>
      </div>

      <ChartLegend
        items={minedPending ? TOTAL_SUPPLY_LEGEND : DECOMPOSITION_LEGEND}
        className="mt-3"
      />

      <div className="mt-3 h-72 sm:h-80">
        {isLoading || !data ? (
          <ChartSkeleton />
        ) : error ? (
          <div className="text-sm text-quai-600 dark:text-quai-400">{String(error)}</div>
        ) : data.length === 0 ? (
          <div className="text-sm text-slate-900/50 dark:text-white/50">
            No supply data in this range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} syncId="home" margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
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
                ticks={xAxisTicks}
                interval={0}
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
              {projectionRange && (
                <ReferenceArea
                  x1={projectionRange.from}
                  x2={projectionRange.to}
                  fill="var(--chart-grid-soft)"
                  fillOpacity={0.35}
                  stroke="none"
                  ifOverflow="extendDomain"
                />
              )}
              <ProtocolEventLines visibleFrom={from} visibleTo={visibleTo} />
              {vestingMarkerDate && (
                <ReferenceLine
                  x={vestingMarkerDate}
                  stroke="#e20101"
                  strokeDasharray="3 3"
                  label={{
                    value: "Vesting Complete",
                    position: "insideTop",
                    fill: "#e20101",
                    fontSize: 11,
                    textAnchor: "start",
                    dx: 4,
                  }}
                />
              )}
              <Area
                type="monotone"
                dataKey="totalSupply"
                name="Total Supply"
                stroke="#e20101"
                fill="#e20101"
                fillOpacity={0.45}
                isAnimationActive
                animationDuration={500}
                animationEasing="ease-out"
              />
              {!minedPending && (
                <Area
                  type="monotone"
                  dataKey="mined"
                  name="Circulating Mined Supply"
                  stroke="#06b6d4"
                  strokeWidth={1.4}
                  strokeDasharray="4 3"
                  fill="#06b6d4"
                  fillOpacity={0.18}
                  isAnimationActive
                  animationDuration={500}
                  animationEasing="ease-out"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {lastRow && minedPending && (
        <div className="mt-2 text-xs text-slate-900/50 dark:text-white/50">
          Exact mined rewards are still indexing for older history; total
          supply is live, and the mined overlay will appear when the full
          cumulative reward path is indexed.
        </div>
      )}

      {lastRow && !minedPending && (() => {
        const grossMined = lastRow.cumulativeMinedQuai ?? 0n;
        const burnLast = lastRow.burnClose ?? 0n;
        const minedNet = grossMined > burnLast ? grossMined - burnLast : 0n;
        const netRateWei = MINING_PER_DAY_WEI - BURN_PER_DAY_WEI;
        return (
          <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-slate-900/50 dark:text-white/50">
            <span>
              Latest {formatPeriodDate(lastRow.periodStart)}: total supply{" "}
              <span className="font-mono text-slate-900/80 dark:text-white/80">
                {formatCompact(weiToFloat(lastRow.quaiTotalEnd, 0))} QUAI
              </span>
            </span>
            <span>
              mined{" "}
              <span className="font-mono text-slate-900/80 dark:text-white/80">
                {formatCompact(weiToFloat(grossMined, 0))}
              </span>{" "}
              − burn{" "}
              <span className="font-mono text-slate-900/80 dark:text-white/80">
                {formatCompact(weiToFloat(burnLast, 0))}
              </span>{" "}
              ={" "}
              <span className="font-mono text-cyan-700 dark:text-cyan-300">
                {formatCompact(weiToFloat(minedNet, 0))} QUAI
              </span>{" "}
              net
            </span>
            {forecast && (
              <span className="text-cyan-700 dark:text-cyan-300">
                Forecast: 800 K gross mined/day · burn ≈{" "}
                {formatCompact(weiToFloat(BURN_PER_DAY_WEI * 7n, 0))} QUAI/wk
                {" "}
                <span className="text-slate-900/55 dark:text-white/55">
                  (90% of gross) · net{" "}
                  {formatCompact(weiToFloat(netRateWei, 0))}/day
                </span>
              </span>
            )}
          </div>
        );
      })()}
    </Card>
  );
}
