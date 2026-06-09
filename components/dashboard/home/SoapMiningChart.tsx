"use client";
import { useMemo, useState } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { useCompactViewport, useRollups } from "@/lib/hooks";
import {
  formatCompact,
  formatPeriodDate,
  weiToFloat,
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
import { InfoPopover } from "@/components/ui/InfoPopover";
import { ChartTooltip } from "@/components/ui/ChartTooltip";
import { ChartLegend, type ChartLegendItem } from "@/components/ui/ChartLegend";
import { ChartSkeleton } from "@/components/ui/ChartSkeleton";
import {
  TimeframeToggle,
  type Timeframe,
} from "@/components/dashboard/shared/TimeframeToggle";
import { SOAP_ACTIVATION_DATE } from "@/lib/quai/protocol-constants";

const SOAP_WINDOW_OPTIONS: Timeframe[] = ["7d", "30d", "90d", "1y", "all"];

function timeframeFromToIso(timeframe: Timeframe, to: string): string {
  if (timeframe === "all") return SOAP_ACTIVATION_DATE;
  const days = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 }[timeframe];
  const d = new Date(to + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  const from = d.toISOString().slice(0, 10);
  return from > SOAP_ACTIVATION_DATE ? from : SOAP_ACTIVATION_DATE;
}

// SoapMiningChart - cumulative exact QUAI CoinbaseType rewards and cumulative
// SOAP burn over the visible window, zero-anchored at the first rollup row.
export function SoapMiningChart({ to }: { to: string }) {
  const [timeframe, setTimeframe] = useState<Timeframe>("30d");
  const compact = useCompactViewport();
  const from = useMemo(
    () => timeframeFromToIso(timeframe, to),
    [timeframe, to],
  );
  const { data, isLoading, error } = useRollups({ period: "day", from, to });

  const chartData = useMemo(() => {
    if (!data) return [];
    let cumulativeMined = 0n;
    let burnAnchor: bigint | null = null;
    const rows: { date: string; mined: number; burned: number; net: number }[] = [
      { date: from, mined: 0, burned: 0, net: 0 },
    ];

    for (const r of data) {
      if (burnAnchor === null) burnAnchor = r.burnClose;
      if (r.blockCount === 0) continue;

      // Only draw periods whose exact reward-output index covers every block.
      // Partial rows would make the cumulative red line look falsely low.
      if (
        typeof r.coinbaseRewardIndexedCount !== "number" ||
        r.coinbaseRewardIndexedCount < r.blockCount
      ) {
        continue;
      }

      cumulativeMined += r.coinbaseQuaiLockedRewardSum ?? 0n;
      const burned = r.burnClose - (burnAnchor ?? 0n);
      const net = cumulativeMined - burned;
      rows.push({
        date: r.periodStart,
        mined: weiToFloat(cumulativeMined, 0),
        burned: weiToFloat(burned, 0),
        net: weiToFloat(net, 0),
      });
    }

    return rows;
  }, [data, from]);

  const last = chartData[chartData.length - 1];

  const legendItems: ChartLegendItem[] = [
    { label: "Cumulative QUAI mined", color: "#e20101" },
    { label: "Cumulative SOAP burn", color: "#f0a16d" },
    { label: "Net (mined - burned)", color: "#10b981", dasharray: "3 3" },
  ];

  return (
    <Card>
      <div className="chart-card-header">
        <CardTitle>QUAI mining vs SOAP burn since SOAP</CardTitle>
        <InfoPopover label="About SOAP mining vs burn">
          <p>
            <span className="font-medium">Mined per period</span>: exact
            lockup-adjusted QUAI <code>CoinbaseType</code> outbound ETXs,
            rolled up as <code>coinbase_quai_locked_reward_sum</code>.
          </p>
          <p className="mt-2">
            Days render only after <code>coinbase_reward_indexed_count</code>{" "}
            equals <code>block_count</code>, so the red line does not use
            sampled workshare counts, reward averages, or genesis unlocks.
          </p>
          <p className="mt-2">
            <span className="font-medium">Burned in window</span>:{" "}
            <code>burn_close[t] - burn_close[first row]</code>. The anchor is
            the first visible rollup row, so the orange line starts at zero and
            accumulates only burns in the selected window.
          </p>
        </InfoPopover>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[0.7rem] uppercase tracking-wider text-slate-900/55 dark:text-white/55">
          Window
        </span>
        <TimeframeToggle
          value={timeframe}
          onChange={setTimeframe}
          options={SOAP_WINDOW_OPTIONS}
        />
      </div>

      <ChartLegend items={legendItems} className="mt-3" />

      <div className="chart-shell">
        {isLoading || !data ? (
          <ChartSkeleton />
        ) : error ? (
          <div className="text-sm text-quai-600 dark:text-quai-400">
            {String(error)}
          </div>
        ) : chartData.length <= 1 ? (
          <div className="text-sm text-slate-900/50 dark:text-white/50">
            No fully indexed coinbase reward rows in this range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              syncId="home"
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
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
                      `${Number(v).toLocaleString()} QUAI`,
                      name,
                    ]}
                  />
                }
              />
              <ProtocolEventLines visibleFrom={from} visibleTo={to} />
              <Line
                type="monotone"
                dataKey="mined"
                name="Cumulative QUAI mined"
                stroke="#e20101"
                strokeWidth={1.6}
                dot={false}
                isAnimationActive
                animationDuration={500}
                animationEasing="ease-out"
              />
              <Line
                type="monotone"
                dataKey="burned"
                name="Cumulative SOAP burn"
                stroke="#f0a16d"
                strokeWidth={1.6}
                dot={false}
                isAnimationActive
                animationDuration={500}
                animationEasing="ease-out"
              />
              <Line
                type="monotone"
                dataKey="net"
                name="Net (mined - burned)"
                stroke="#10b981"
                strokeWidth={1.2}
                strokeDasharray="3 3"
                dot={false}
                isAnimationActive
                animationDuration={500}
                animationEasing="ease-out"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {last && chartData.length > 1 && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-slate-900/50 dark:text-white/50">
          <span>Latest {formatPeriodDate(last.date)}:</span>
          <span>
            mined{" "}
            <span className="font-mono text-quai-600 dark:text-quai-400">
              {formatCompact(last.mined)} QUAI
            </span>
          </span>
          <span>
            burned{" "}
            <span className="font-mono text-amber-600 dark:text-amber-300">
              {formatCompact(last.burned)} QUAI
            </span>
          </span>
          <span>
            net{" "}
            <span className="font-mono text-emerald-600 dark:text-emerald-300">
              {last.net >= 0 ? "+" : ""}
              {formatCompact(last.net)} QUAI
            </span>
          </span>
        </div>
      )}
    </Card>
  );
}
