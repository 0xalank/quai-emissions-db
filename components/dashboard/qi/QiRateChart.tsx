"use client";
import { useMemo } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { ChartLegend } from "@/components/ui/ChartLegend";
import { ChartSkeleton } from "@/components/ui/ChartSkeleton";
import { ChartTooltip } from "@/components/ui/ChartTooltip";
import { InfoPopover } from "@/components/ui/InfoPopover";
import { useCompactViewport, useQiMarket } from "@/lib/hooks";
import { formatPeriodDate } from "@/lib/format";
import {
  formatQuaiPerQi,
  isQiPriceLiveDate,
  QI_QUOTE_COLOR,
  qiToQuai,
} from "./qi-format";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const LEGEND = [{ label: "QUAI per Qi", color: QI_QUOTE_COLOR }];

export function QiRateChart({ from, to }: { from: string; to: string }) {
  const compact = useCompactViewport();
  const { data, isLoading, error } = useQiMarket({ from, to });

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((r) => ({
      date: r.periodStart,
      quote: isQiPriceLiveDate(r.periodStart) ? qiToQuai(r) : null,
    }));
  }, [data]);

  const hasQuotes = chartData.some((r) => r.quote != null);

  return (
    <Card>
      <div className="chart-card-header">
        <CardTitle>Qi to QUAI quote</CardTitle>
        <InfoPopover label="About the Qi quote">
          <p>
            This line is stored from the chain RPC method
            {" "}
            <span className="font-mono">quai_qiToQuai</span>, called for 1 Qi
            at each daily close block.
          </p>
          <p className="mt-2">
            Missing days mean the daily quote backfill has not stored that
            close-block response yet.
          </p>
          <p className="mt-2">
            Qi price/rate history is shown from April 16, 2025 onward.
          </p>
        </InfoPopover>
      </div>

      <ChartLegend items={LEGEND} className="mt-3" />

      <div className="chart-shell">
        {isLoading || !data ? (
          <ChartSkeleton />
        ) : error ? (
          <div className="text-sm text-quai-600 dark:text-quai-400">
            {String(error)}
          </div>
        ) : data.length === 0 || !hasQuotes ? (
          <div className="text-sm text-slate-900/50 dark:text-white/50">
            No Qi quote rows in this range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                minTickGap={compact ? 64 : 32}
              />
              <YAxis
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                tickFormatter={(v) => formatQuaiPerQi(Number(v)).replace(" QUAI", "")}
                tickLine={false}
                axisLine={false}
                width={compact ? 48 : 68}
                domain={["auto", "auto"]}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    labelFormatter={(v) => formatPeriodDate(String(v))}
                    formatter={(v, name) => [
                      v == null ? "-" : formatQuaiPerQi(Number(v)),
                      name,
                    ]}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="quote"
                name="QUAI per Qi"
                stroke={QI_QUOTE_COLOR}
                strokeWidth={1.8}
                dot={false}
                connectNulls={false}
                isAnimationActive
                animationDuration={500}
                animationEasing="ease-out"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
