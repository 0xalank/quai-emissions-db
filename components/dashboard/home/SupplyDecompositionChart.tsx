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
  { label: "Eaten by SOAP burn", color: "#f0a16d", dasharray: "4 3" },
  { label: "Genesis (unlocked)", color: "#a855f7" },
  { label: "Mined (gross)", color: "#06b6d4" },
];

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

  const chartData = useMemo(() => {
    if (!data) return [];

    // Stack bottom→top: genesis (purple) + mined gross (cyan); burn (orange,
    // hatched) is a separate stack overlaid at the floor. Stack top =
    // genesis + gross-mined = gross-ever-issued. Realized circulating =
    // stack top minus burn overlay.
    const historical = data.map((r) => {
      const burn = r.burnClose ?? 0n;
      const grossMined = r.cumulativeMinedQuai ?? 0n;
      const minedNet = grossMined > burn ? grossMined - burn : 0n;
      const genesisRaw =
        r.quaiTotalEnd > minedNet ? r.quaiTotalEnd - minedNet : 0n;
      return {
        date: r.periodStart,
        genesis: weiToFloat(genesisRaw, 0),
        burn: weiToFloat(burn, 0),
        mined: weiToFloat(grossMined, 0),
      };
    });

    if (!forecast || !lastRow) return historical;

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

      projection.push({
        date,
        genesis: weiToFloat(genesisWei, 0),
        burn: weiToFloat(burnWei, 0),
        mined: weiToFloat(grossMinedWei, 0),
      });
    }

    return [...historical, ...projection];
  }, [data, forecast, lastRow]);

  const projectionRange = useMemo(() => {
    if (!forecast || !lastRow) return null;
    return {
      from: lastRow.periodStart,
      to: addDays(lastRow.periodStart, PROJECTION_YEARS * 365),
    };
  }, [forecast, lastRow]);

  // Single pass over chartData (~2,700 rows when forecast is on) computes
  // three independent things — collapsed from three separate useMemos:
  //   1. crossoverDate: first row where the cyan layer (gross mined) tops
  //      the visible genesis − burn — i.e. cyan area exceeds (purple −
  //      hatched bite at the floor).
  //   2. vestingMarkerDate: snap to the first projection sample at or
  //      after VESTING_END_DATE. Required because the XAxis is
  //      category-based and ReferenceLine x must match an exact data point.
  //   3. xAxisTicks: every Jan 1 / Jul 1 row, for evenly-spaced ticks on
  //      the category-based axis.
  const { crossoverDate, vestingMarkerDate, xAxisTicks } = useMemo(() => {
    let cross: string | null = null;
    let vest: string | null = null;
    const ticks: string[] = [];
    const seen = new Set<string>();
    for (const r of chartData) {
      if (cross == null && r.mined > r.genesis - r.burn) cross = r.date;
      if (forecast && vest == null && r.date >= VESTING_END_DATE) vest = r.date;
      const md = r.date.slice(5);
      if ((md === "01-01" || md === "07-01") && !seen.has(r.date)) {
        seen.add(r.date);
        ticks.push(r.date);
      }
    }
    return { crossoverDate: cross, vestingMarkerDate: vest, xAxisTicks: ticks };
  }, [chartData, forecast]);

  const visibleTo = forecast && projectionRange ? projectionRange.to : to;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <CardTitle>QUAI supply decomposition</CardTitle>
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
            <p className="font-medium">Same silhouette, three layers</p>
            <p className="mt-1 text-slate-900/70 dark:text-white/70">
              Decomposes <code>quaiSupplyTotal</code> (which already includes
              both mining issuance and vesting unlocks) into its two sources.
            </p>
            <ul className="mt-2 list-disc pl-4 text-slate-900/70 dark:text-white/70">
              <li>
                <span className="font-medium text-purple-600 dark:text-purple-300">
                  Genesis
                </span>{" "}
                (bottom): <code>quaiTotalEnd − minedNet</code>. True
                genesis-unlocked premine — captures vesting-cliff unlocks (TGE
                baseline ~478 M, staggered tail unlocks ~+30 M/mo at months
                6–11, 1-year cliff +~181 M at month 12 ≈ 2026-01-24). After
                Singularity (m14, 2026-03-25) ~73% of each monthly unlock is
                forfeited; the line plateaus at ~1.333 B at m48 (
                <strong>{VESTING_END_DATE}</strong>).
              </li>
              <li>
                <span className="font-medium text-cyan-600 dark:text-cyan-300">
                  Mined (gross)
                </span>{" "}
                (top): <code>cumulativeMinedQuai</code>. Total mining issuance
                ever, stacked directly on genesis. Top of stack = genesis +
                gross-mined = gross-ever-issued. Realized circulating = stack
                top minus burn overlay.
              </li>
              <li>
                <span className="font-medium text-amber-600 dark:text-amber-300">
                  Eaten by burn
                </span>{" "}
                (overlay): <code>burnClose</code>. Drawn as a separate hatched
                area at the floor, overlapping the bottom of genesis. Visually
                marks "this slice has been retired" without pushing the supply
                layers up.
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
                {" "}(burn 720 K/day, net 80 K/day → cyan grows slowly).
              </li>
            </ul>
            <p className="mt-2 text-slate-900/55 dark:text-white/55">
              The genesis curve is exact to ~152 µQUAI rounding (sub-cent at
              any plausible token price); mining and burn projections remain
              first-order — block rewards decay log(difficulty), and burn
              velocity tracks parent-chain hashrate.
            </p>
          </InfoPopover>
        </div>
      </div>

      <ChartLegend items={DECOMPOSITION_LEGEND} className="mt-3" />

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
              <defs>
                <pattern
                  id="soap-burn-stripes-decomp"
                  patternUnits="userSpaceOnUse"
                  width="6"
                  height="6"
                  patternTransform="rotate(45)"
                >
                  <rect width="6" height="6" fill="#f0a16d" fillOpacity={0.18} />
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="6"
                    stroke="#f0a16d"
                    strokeWidth="2.5"
                    strokeOpacity={0.85}
                  />
                </pattern>
              </defs>
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
                  stroke="#a855f7"
                  strokeDasharray="3 3"
                  label={{
                    value: "Vesting Complete",
                    position: "insideTop",
                    fill: "#a855f7",
                    fontSize: 11,
                    textAnchor: "start",
                    dx: 4,
                  }}
                />
              )}
              {crossoverDate && (
                <ReferenceLine
                  x={crossoverDate}
                  stroke="#06b6d4"
                  strokeDasharray="3 3"
                  label={{
                    value: "Mining > Unlocks − Burn",
                    position: "insideTop",
                    fill: "#06b6d4",
                    fontSize: 11,
                    textAnchor: "end",
                    dx: -4,
                  }}
                />
              )}
              <Area
                type="monotone"
                dataKey="genesis"
                name="Genesis (unlocked)"
                stackId="supply"
                stroke="#a855f7"
                fill="#a855f7"
                fillOpacity={0.45}
                isAnimationActive
                animationDuration={500}
                animationEasing="ease-out"
              />
              <Area
                type="monotone"
                dataKey="mined"
                name="Mined (gross)"
                stackId="supply"
                stroke="#06b6d4"
                fill="#06b6d4"
                fillOpacity={0.55}
                isAnimationActive
                animationDuration={500}
                animationEasing="ease-out"
              />
              <Area
                type="monotone"
                dataKey="burn"
                name="Eaten by SOAP burn"
                stackId="burn"
                stroke="#f0a16d"
                strokeWidth={1.4}
                strokeDasharray="4 3"
                fill="url(#soap-burn-stripes-decomp)"
                isAnimationActive
                animationDuration={500}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {lastRow && (() => {
        const grossMined = lastRow.cumulativeMinedQuai ?? 0n;
        const burnLast = lastRow.burnClose ?? 0n;
        const minedNet = grossMined > burnLast ? grossMined - burnLast : 0n;
        // Genesis must be derived from minedNet (matching the chart series at
        // line ~92); using grossMined here was short by burnClose.
        const genesisLast = lastRow.quaiTotalEnd > minedNet
          ? lastRow.quaiTotalEnd - minedNet
          : 0n;
        const netRateWei = MINING_PER_DAY_WEI - BURN_PER_DAY_WEI;
        return (
          <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-slate-900/50 dark:text-white/50">
            <span>
              Latest {formatPeriodDate(lastRow.periodStart)}: mined{" "}
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
            <span>
              genesis{" "}
              <span className="font-mono text-slate-900/80 dark:text-white/80">
                {formatCompact(weiToFloat(genesisLast, 0))} QUAI
              </span>
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
