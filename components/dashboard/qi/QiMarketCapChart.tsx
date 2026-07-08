"use client";
import { useMemo } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { ChartLegend } from "@/components/ui/ChartLegend";
import { ChartSkeleton } from "@/components/ui/ChartSkeleton";
import { ChartTooltip } from "@/components/ui/ChartTooltip";
import { InfoPopover } from "@/components/ui/InfoPopover";
import { useCompactViewport, useQiMarket } from "@/lib/hooks";
import { formatCompact, formatPeriodDate, qitsToFloat } from "@/lib/format";
import {
  impliedQiPrice,
  isQiPriceLiveDate,
  QI_PRICE_COLOR,
} from "./qi-format";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const MARKET_CAP_COLOR = "#7c3aed";

function formatMarketCap(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `$${formatCompact(value)}`;
}

export function QiMarketCapChart({ from, to }: { from: string; to: string }) {
  const compact = useCompactViewport();
  const { data, isLoading, error } = useQiMarket({ from, to });

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((r) => {
      const price = isQiPriceLiveDate(r.periodStart) ? impliedQiPrice(r) : null;
      const supply = qitsToFloat(r.qiTotalEnd, 3);
      return {
        date: r.periodStart,
        marketCap: price == null ? null : supply * price,
        price,
      };
    });
  }, [data]);

  const hasMarketCap = chartData.some((r) => r.marketCap != null);

  return (
    <Card>
      <div className="chart-card-header">
        <CardTitle>Qi market cap</CardTitle>
        <InfoPopover label="About Qi market cap">
          <p>
            Market cap is daily Qi supply multiplied by the implied Qi price.
            Implied price uses the chain Qi-to-QUAI quote and the daily QUAI
            close.
          </p>
          <p className="mt-2">
            Days without both a chain quote and QUAI market price are left
            blank.
          </p>
        </InfoPopover>
      </div>

      <ChartLegend
        items={[
          { label: "Qi market cap", color: MARKET_CAP_COLOR },
          { label: "Implied Qi price", color: QI_PRICE_COLOR },
        ]}
        className="mt-3"
      />

      <div className="chart-shell">
        {isLoading || !data ? (
          <ChartSkeleton />
        ) : error ? (
          <div className="text-sm text-quai-600 dark:text-quai-400">
            {String(error)}
          </div>
        ) : data.length === 0 || !hasMarketCap ? (
          <div className="text-sm text-slate-900/50 dark:text-white/50">
            No overlapping Qi supply, chain quote, and QUAI price rows in this
            range.
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
                minTickGap={compact ? 64 : 32}
              />
              <YAxis
                yAxisId="cap"
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                tickFormatter={(v) => formatMarketCap(Number(v))}
                tickLine={false}
                axisLine={false}
                width={compact ? 54 : 72}
              />
              <YAxis
                yAxisId="price"
                orientation="right"
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                tickFormatter={(v) => `$${Number(v).toFixed(Number(v) < 1 ? 4 : 2)}`}
                tickLine={false}
                axisLine={false}
                width={compact ? 48 : 64}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    labelFormatter={(v) => formatPeriodDate(String(v))}
                    formatter={(v, name) => [
                      name === "Qi market cap"
                        ? formatMarketCap(Number(v))
                        : `$${Number(v).toLocaleString(undefined, {
                            maximumFractionDigits: Number(v) < 1 ? 5 : 2,
                            minimumFractionDigits: 2,
                          })}`,
                      name,
                    ]}
                  />
                }
              />
              <Area
                yAxisId="cap"
                type="monotone"
                dataKey="marketCap"
                name="Qi market cap"
                stroke={MARKET_CAP_COLOR}
                fill={MARKET_CAP_COLOR}
                fillOpacity={0.12}
                strokeWidth={1.8}
                dot={false}
                connectNulls={false}
                isAnimationActive
                animationDuration={500}
                animationEasing="ease-out"
              />
              <Area
                yAxisId="price"
                type="monotone"
                dataKey="price"
                name="Implied Qi price"
                stroke={QI_PRICE_COLOR}
                fill={QI_PRICE_COLOR}
                fillOpacity={0.05}
                strokeWidth={1.3}
                dot={false}
                connectNulls={false}
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
