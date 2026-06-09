"use client";
import { useMemo } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { useCompactViewport, useRollups } from "@/lib/hooks";
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
import { SamplingFootnote } from "@/components/dashboard/shared/SamplingFootnote";
import { ProtocolEventLines } from "@/components/dashboard/shared/ProtocolEventLines";
import { ChartTooltip } from "@/components/ui/ChartTooltip";
import { ChartLegend } from "@/components/ui/ChartLegend";
import { ChartSkeleton } from "@/components/ui/ChartSkeleton";

const BLOCK_REWARD_LEGEND = [
  { label: "Base block reward", color: "#e20101" },
  { label: "Per-workshare reward", color: "#a855f7", dasharray: "3 3" },
];

// BlockRewardChart — daily averages of base block reward and per-share
// workshare reward. Two lines on a shared axis; both are QUAI wei.

export function BlockRewardChart({ from, to }: { from: string; to: string }) {
  const { data, isLoading, error } = useRollups({ period: "day", from, to });
  const compact = useCompactViewport();

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((r) => ({
      date: r.periodStart,
      base: weiToFloat(nz(r.baseBlockRewardAvg), 4),
      workshare: weiToFloat(nz(r.workshareRewardAvg), 4),
    }));
  }, [data]);

  return (
    <Card>
      <div className="chart-card-header">
        <CardTitle>Block reward</CardTitle>
        <SamplingFootnote kind="averaged" />
      </div>

      <ChartLegend items={BLOCK_REWARD_LEGEND} className="mt-2" />

      <div className="chart-shell-short">
        {isLoading || !data ? (
          <ChartSkeleton />
        ) : error ? (
          <div className="text-sm text-quai-600 dark:text-quai-400">{String(error)}</div>
        ) : data.length === 0 ? (
          <div className="text-sm text-slate-900/50 dark:text-white/50">No rollup data.</div>
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
                      `${Number(v).toLocaleString()} QUAI`,
                      name,
                    ]}
                  />
                }
              />
              <ProtocolEventLines visibleFrom={from} visibleTo={to} />
              <Line type="monotone" dataKey="base" name="Base block reward" stroke="#e20101" strokeWidth={1.6} dot={false} isAnimationActive animationDuration={500} animationEasing="ease-out" />
              <Line type="monotone" dataKey="workshare" name="Per-workshare reward" stroke="#a855f7" strokeWidth={1.4} dot={false} strokeDasharray="3 3" isAnimationActive animationDuration={500} animationEasing="ease-out" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
