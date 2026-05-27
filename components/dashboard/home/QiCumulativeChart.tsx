"use client";
import { useMemo } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { useSupply } from "@/lib/hooks";
import {
  formatCompact,
  formatPeriodDate,
  qitsToFloat,
} from "@/lib/format";
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
import { ChartTooltip } from "@/components/ui/ChartTooltip";
import { ChartLegend } from "@/components/ui/ChartLegend";
import { ChartSkeleton } from "@/components/ui/ChartSkeleton";

const QI_CUMULATIVE_LEGEND = [
  { label: "Qi supply", color: "#10b981" },
];

// QiCumulativeChart — single-line cumulative Qi supply since Qi mining began.
// Qi has no sinks (no burn, no Singularity skip), so the line is monotonically
// non-decreasing. It avoids stacked wedges, which would be misleading for Qi.

export function QiCumulativeChart({
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
    return data.map((r) => ({
      date: r.periodStart,
      qi: qitsToFloat(r.qiTotalEnd ?? 0n, 0),
    }));
  }, [data]);

  const last = data?.[data.length - 1];

  return (
    <Card>
      <CardTitle>Qi supply</CardTitle>
      <ChartLegend items={QI_CUMULATIVE_LEGEND} className="mt-3" />

      <div className="mt-3 h-56">
        {isLoading || !data ? (
          <ChartSkeleton />
        ) : error ? (
          <div className="text-sm text-quai-600 dark:text-quai-400">{String(error)}</div>
        ) : data.length === 0 ? (
          <div className="text-sm text-slate-900/50 dark:text-white/50">
            No Qi supply data in this range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} syncId="home" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                    formatter={(v) => [
                      `${Number(v).toLocaleString()} QI`,
                      "Qi supply",
                    ]}
                  />
                }
              />
              <ProtocolEventLines visibleFrom={from} visibleTo={to} />
              <Line
                type="monotone"
                dataKey="qi"
                name="Qi supply"
                stroke="#10b981"
                strokeWidth={1.6}
                dot={false}
                isAnimationActive
                animationDuration={500}
                animationEasing="ease-out"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {last && (
        <div className="mt-2 text-xs text-slate-900/50 dark:text-white/50">
          Latest {formatPeriodDate(last.periodStart)}:{" "}
          <span className="font-mono text-slate-900/80 dark:text-white/80">
            {formatCompact(qitsToFloat(last.qiTotalEnd ?? 0n, 0))} QI
          </span>
        </div>
      )}
    </Card>
  );
}
