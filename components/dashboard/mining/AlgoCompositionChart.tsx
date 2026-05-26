"use client";
import { useMemo } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { useRollups } from "@/lib/hooks";
import { formatPeriodDate } from "@/lib/format";
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
import { ChartTooltip } from "@/components/ui/ChartTooltip";
import { ChartLegend } from "@/components/ui/ChartLegend";
import { ChartSkeleton } from "@/components/ui/ChartSkeleton";

const ALGO_COMPOSITION_LEGEND = [
  { label: "KawPoW", color: "#e20101" },
  { label: "SHA", color: "#f0a16d" },
  { label: "Scrypt", color: "#10b981" },
  { label: "ProgPoW (legacy)", color: "#94a3b8" },
];

// AlgoCompositionChart — flagship for /dashboard/mining.
// 100%-normalized stacked area showing the relative share of workshares
// from each SOAP algorithm. Pre-SOAP periods (all NULL columns) appear as
// gaps.

export function AlgoCompositionChart({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  const { data, isLoading, error } = useRollups({ period: "day", from, to });

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((r) => {
      const kaw = Number(nz(r.wsKawpowSum));
      const sha = Number(nz(r.wsShaSum));
      const scr = Number(nz(r.wsScryptSum));
      const prog = Number(nz(r.wsProgpowSum));
      const total = kaw + sha + scr + prog;
      if (total === 0) {
        return { date: r.periodStart, kawpow: 0, sha: 0, scrypt: 0, progpow: 0 };
      }
      return {
        date: r.periodStart,
        kawpow: (kaw / total) * 100,
        sha: (sha / total) * 100,
        scrypt: (scr / total) * 100,
        progpow: (prog / total) * 100,
      };
    });
  }, [data]);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <CardTitle>Workshare share by algorithm</CardTitle>
        <SamplingFootnote kind="extrapolated" />
      </div>

      <ChartLegend items={ALGO_COMPOSITION_LEGEND} className="mt-3" />

      <div className="mt-3 h-72 sm:h-80">
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
                minTickGap={48}
              />
              <YAxis
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                tickFormatter={(v) => `${v}%`}
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    labelFormatter={(v) => formatPeriodDate(String(v))}
                    formatter={(v, name) => [`${Number(v).toFixed(1)}%`, name]}
                  />
                }
              />
              <ProtocolEventLines visibleFrom={from} visibleTo={to} />
              <Area
                type="monotone"
                dataKey="kawpow"
                name="KawPoW"
                stackId="algo"
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
                name="SHA"
                stackId="algo"
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
                name="Scrypt"
                stackId="algo"
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.7}
                isAnimationActive
                animationDuration={500}
                animationEasing="ease-out"
              />
              <Area
                type="monotone"
                dataKey="progpow"
                name="ProgPoW (legacy)"
                stackId="algo"
                stroke="#94a3b8"
                fill="#94a3b8"
                fillOpacity={0.45}
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
