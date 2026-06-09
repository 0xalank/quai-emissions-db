"use client";
import { useMemo, useState } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { useCompactViewport, useRollups } from "@/lib/hooks";
import { formatHashrate, formatPeriodDate } from "@/lib/format";
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
import { cn } from "@/lib/utils";

type Algo = "kawpow" | "sha" | "scrypt";

const ALGOS: ReadonlyArray<{ key: Algo; label: string; color: string }> = [
  { key: "kawpow", label: "KawPoW", color: "#e20101" },
  { key: "sha", label: "SHA", color: "#f0a16d" },
  { key: "scrypt", label: "Scrypt", color: "#10b981" },
];

// HashrateChart — one line per SOAP algorithm, but on a linear scale per
// selected algorithm. Algorithms differ by 6+ orders of magnitude
// (KawPoW Quai-only is GH/s; SHA from BTC/BCH merge-mining is EH/s),
// so a single shared linear axis is unreadable. Toggle picks which
// algorithm gets its own properly-scaled axis.

export function HashrateChart({ from, to }: { from: string; to: string }) {
  const [algo, setAlgo] = useState<Algo>("kawpow");
  const compact = useCompactViewport();
  const { data, isLoading, error } = useRollups({ period: "day", from, to });

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((r) => ({
      date: r.periodStart,
      kawpow: r.kawpowHashrateAvg == null ? null : Number(r.kawpowHashrateAvg),
      sha: r.shaHashrateAvg == null ? null : Number(r.shaHashrateAvg),
      scrypt: r.scryptHashrateAvg == null ? null : Number(r.scryptHashrateAvg),
    }));
  }, [data]);

  const active = ALGOS.find((a) => a.key === algo)!;
  const legend = [{ label: active.label, color: active.color }];

  return (
    <Card>
      <div className="chart-card-header">
        <CardTitle>Per-algorithm hashrate</CardTitle>
        <SamplingFootnote kind="averaged" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[0.7rem] uppercase tracking-wider text-slate-900/55 dark:text-white/55">
          Algorithm
        </span>
        <div
          role="tablist"
          aria-label="Algorithm"
          className="inline-flex items-center gap-0.5 rounded-md border border-slate-900/10 p-0.5 dark:border-white/10"
        >
          {ALGOS.map((a) => {
            const isActive = a.key === algo;
            return (
              <button
                key={a.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setAlgo(a.key)}
                className={cn(
                  "rounded px-2 py-0.5 text-xs transition",
                  isActive
                    ? "bg-slate-900/10 text-slate-900 dark:bg-white/15 dark:text-white"
                    : "text-slate-700 hover:text-slate-900 dark:text-white/60 dark:hover:text-white/90",
                )}
              >
                {a.label}
              </button>
            );
          })}
        </div>
      </div>

      <ChartLegend items={legend} className="mt-2" />

      <div className="chart-shell-short">
        {isLoading || !data ? (
          <ChartSkeleton />
        ) : error ? (
          <div className="text-sm text-quai-600 dark:text-quai-400">{String(error)}</div>
        ) : data.length === 0 ? (
          <div className="text-sm text-slate-900/50 dark:text-white/50">
            No rollup data.
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
                tickFormatter={(v) => formatHashrate(BigInt(Math.floor(Number(v))))}
                tickLine={false}
                axisLine={false}
                width={compact ? 56 : 80}
                domain={[0, "auto"]}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    labelFormatter={(v) => formatPeriodDate(String(v))}
                    formatter={(v, name) =>
                      v == null
                        ? ["—", name]
                        : [formatHashrate(BigInt(Math.floor(Number(v)))), name]
                    }
                  />
                }
              />
              <ProtocolEventLines visibleFrom={from} visibleTo={to} />
              <Line
                type="monotone"
                dataKey={algo}
                name={active.label}
                stroke={active.color}
                strokeWidth={1.7}
                dot={false}
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
