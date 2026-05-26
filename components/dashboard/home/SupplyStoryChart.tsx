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
import {
  QUAI_CAP_DATE,
  quaiProjectedSupplyAt,
} from "@/lib/comparisons/quai-projection";

const SUPPLY_STORY_LEGEND = [
  { label: "Circulating", color: "#e20101" },
  { label: "Forecast", color: "#14b8a6", dasharray: "5 4" },
];

// SupplyStoryChart — the home-page flagship.
//   • circulating (blue) — quai_total_end, what's actually circulating
//                          (already net of SOAP burn at the RPC layer)
//   • forecast (teal)    — linear projection from latest circulating to the
//                          published 1.4B QUAI cap target by Feb 2029
//
// The circulating line already has SOAP burn factored in at the RPC layer,
// so this chart does not draw a separate burn overlay.

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
    const history = data.map((r) => ({
      date: r.periodStart,
      realized: weiToFloat(r.realizedCirculatingQuai, 0),
      forecast: null as number | null,
    }));
    const last = data[data.length - 1];
    if (!last) return history;

    const anchor = {
      date: new Date(last.periodStart + "T00:00:00Z"),
      supply: last.realizedCirculatingQuai,
    };
    const forecast = [];
    for (
      let d = new Date(anchor.date);
      d <= QUAI_CAP_DATE;
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    ) {
      const iso = d.toISOString().slice(0, 10);
      forecast.push({
        date: iso,
        realized: null as number | null,
        forecast: weiToFloat(quaiProjectedSupplyAt(d, anchor), 0),
      });
    }
    if (forecast[0]?.date === last.periodStart) {
      forecast[0] = {
        date: last.periodStart,
        realized: weiToFloat(last.realizedCirculatingQuai, 0),
        forecast: weiToFloat(last.realizedCirculatingQuai, 0),
      };
      return [...history.slice(0, -1), ...forecast];
    }
    return [
      ...history,
      {
        date: last.periodStart,
        realized: weiToFloat(last.realizedCirculatingQuai, 0),
        forecast: weiToFloat(last.realizedCirculatingQuai, 0),
      },
      ...forecast,
    ];
  }, [data]);

  const last = data?.[data.length - 1];

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
              : a dashed projection from the latest circulating close to the
              1.4B QUAI cap target on {QUAI_CAP_DATE.toISOString().slice(0, 10)}.
            </li>
          </ul>
          <p className="mt-2">
            <span className="font-medium">Singularity Fork (2026-03-19)</span>:
            shown as an annotation only. The fork eliminated ~1.67 B QUAI of
            future genesis unlocks; those allocations were never minted into
            this curve, so there's nothing to subtract here. The effect lands
            on eventual maximum supply, not on what's circulating today.
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
              <ProtocolEventLines visibleFrom={from} visibleTo={to} />
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
                type="monotone"
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
