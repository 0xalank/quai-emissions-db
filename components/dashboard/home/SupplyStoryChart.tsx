"use client";
import { useMemo } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { useSupply } from "@/lib/hooks";
import {
  formatCompact,
  formatPeriodDate,
  weiToFloat,
} from "@/lib/format";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
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
import { cumulativeUnlockedPostSingularity } from "@/lib/quai/genesis-schedule";

const SUPPLY_STORY_LEGEND = [
  { label: "Circulating", color: "#e20101" },
  { label: "Forecast", color: "#14b8a6", dasharray: "5 4" },
];

type SupplyStoryPoint = {
  date: string;
  realized: number | null;
  forecast: number | null;
};

// SupplyStoryChart — the home-page flagship.
//   • circulating (blue) — quai_total_end, what's actually circulating
//                          (already net of SOAP burn at the RPC layer)
//   • forecast (teal)    — daily projection from latest circulating, adding
//                          future post-Singularity genesis unlocks only.
//
// The circulating line already has SOAP burn factored in at the RPC layer,
// so this chart does not draw a separate burn overlay.

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

export function SupplyStoryChart({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  const { data, isLoading, error } = useSupply({
    period: "day",
    from,
    to,
    include: ["qi"],
  });

  const chartData = useMemo(() => {
    if (!data) return [];
    const history: SupplyStoryPoint[] = data.map((r) => ({
      date: r.periodStart,
      realized: weiToFloat(r.realizedCirculatingQuai, 0),
      forecast: null as number | null,
    }));
    const last = data[data.length - 1];
    if (!last) return history;

    const anchorDate = last.periodStart;
    const scheduledAtAnchor = cumulativeUnlockedPostSingularity(anchorDate);
    const horizonDate = VESTING_END_DATE;
    const totalDays = Math.max(0, daysBetween(anchorDate, horizonDate));

    const forecast: SupplyStoryPoint[] = [
      {
        date: anchorDate,
        realized: weiToFloat(last.realizedCirculatingQuai, 0),
        forecast: weiToFloat(last.realizedCirculatingQuai, 0),
      },
    ];
    for (let dayOffset = 1; dayOffset <= totalDays; dayOffset += 1) {
      const iso = addDays(anchorDate, dayOffset);
      const scheduledAtDate = cumulativeUnlockedPostSingularity(iso);
      const scheduledDelta =
        scheduledAtDate > scheduledAtAnchor
          ? scheduledAtDate - scheduledAtAnchor
          : 0n;
      const projected =
        last.realizedCirculatingQuai + scheduledDelta;
      forecast.push({
        date: iso,
        realized: null as number | null,
        forecast: weiToFloat(projected, 0),
      });
    }
    return [...history.slice(0, -1), ...forecast];
  }, [data]);

  const last = data?.[data.length - 1];
  const visibleTo =
    last && last.periodStart < VESTING_END_DATE ? VESTING_END_DATE : to;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <CardTitle>Circulating QUAI Supply</CardTitle>
        <InfoPopover label="About the supply story">
          <p className="font-medium">Circulating supply plus forecast</p>
          <ul className="mt-1 list-disc pl-4 text-slate-900/70 dark:text-white/70">
            <li>
              <span className="font-medium text-quai-600 dark:text-quai-400">
                Circulating
              </span>
              : <code>quaiSupplyTotal</code> from the RPC. Already net of SOAP
              burn server-side — no client-side subtraction. Top of the blue
              area is what's actually circulating today.
            </li>
            <li>
              <span className="font-medium text-teal-600 dark:text-teal-300">
                Forecast
              </span>
              : a dashed daily projection from the latest circulating close,
              adding only the remaining post-Singularity genesis unlock
              schedule.
            </li>
          </ul>
          <p className="mt-2">
            <span className="font-medium">Singularity Fork (2026-03-19)</span>:
            shown as an annotation only. The fork eliminated ~1.67 B QUAI of
            future genesis unlocks; those allocations were never minted into
            this curve, so there's nothing to subtract here. The effect lands
            on eventual maximum supply, not on what's circulating today. The
            forecast carries the remaining allowed unlocks forward through
            {` ${VESTING_END_DATE}`}.
          </p>
        </InfoPopover>
      </div>

      <ChartLegend items={SUPPLY_STORY_LEGEND} className="mt-3" />

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
            <ComposedChart data={chartData} syncId="home" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
              <ProtocolEventLines visibleFrom={from} visibleTo={visibleTo} />
              {last && VESTING_END_DATE <= visibleTo && (
                <ReferenceLine
                  x={VESTING_END_DATE}
                  stroke="#a855f7"
                  strokeDasharray="3 3"
                  strokeOpacity={0.55}
                  label={{
                    value: "Genesis unlocks end",
                    position: "insideTopRight",
                    fill: "#a855f7",
                    fontSize: 10,
                  }}
                />
              )}
              <Area
                type="monotone"
                dataKey="realized"
                name="Circulating"
                stackId="supply"
                stroke="#e20101"
                fill="#e20101"
                fillOpacity={0.5}
                connectNulls={false}
                isAnimationActive
                animationDuration={500}
                animationEasing="ease-out"
              />
              <Line
                type="linear"
                dataKey="forecast"
                name="Forecast"
                stroke="#14b8a6"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                connectNulls={false}
                isAnimationActive
                animationDuration={500}
                animationEasing="ease-out"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {last && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-slate-900/50 dark:text-white/50">
          <span>
            Latest {formatPeriodDate(last.periodStart)}: circulating{" "}
            <span className="font-mono text-slate-900/80 dark:text-white/80">
              {formatCompact(weiToFloat(last.realizedCirculatingQuai, 0))} QUAI
            </span>
          </span>
        </div>
      )}
    </Card>
  );
}
