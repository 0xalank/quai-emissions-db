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
  formatCurrency,
  impliedQiPrice,
  QI_PRICE_COLOR,
  QUAI_PRICE_COLOR,
  quaiPrice,
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

const LEGEND = [
  { label: "Implied Qi price", color: QI_PRICE_COLOR },
  { label: "QUAI close", color: QUAI_PRICE_COLOR },
];

export function QiImpliedPriceChart({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  const compact = useCompactViewport();
  const { data, isLoading, error } = useQiMarket({ from, to });

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((r) => ({
      date: r.periodStart,
      qiPrice: impliedQiPrice(r),
      quaiPrice: quaiPrice(r),
      quoteCurrency: r.quoteCurrency ?? "USDT",
    }));
  }, [data]);

  const hasPrice = chartData.some((r) => r.qiPrice != null);

  return (
    <Card>
      <div className="chart-card-header">
        <CardTitle>Implied Qi price</CardTitle>
        <InfoPopover label="About implied Qi price">
          <p>
            Implied Qi price is calculated as daily QUAI/USDT close multiplied
            by the stored chain quote for QUAI per Qi.
          </p>
          <p className="mt-2">
            QUAI candles come from MEXC. Days without a candle still keep the
            chain quote, but cannot produce an implied price.
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
        ) : data.length === 0 || !hasPrice ? (
          <div className="text-sm text-slate-900/50 dark:text-white/50">
            No overlapping Qi quote and QUAI price rows in this range.
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
                yAxisId="qi"
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                tickFormatter={(v) => formatCurrency(Number(v))}
                tickLine={false}
                axisLine={false}
                width={compact ? 54 : 68}
                domain={["auto", "auto"]}
              />
              <YAxis
                yAxisId="quai"
                orientation="right"
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                tickFormatter={(v) => formatCurrency(Number(v))}
                tickLine={false}
                axisLine={false}
                width={compact ? 48 : 64}
                domain={["auto", "auto"]}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    labelFormatter={(v) => formatPeriodDate(String(v))}
                    formatter={(v, name) => [
                      v == null ? "-" : formatCurrency(Number(v)),
                      name,
                    ]}
                  />
                }
              />
              <Line
                yAxisId="qi"
                type="monotone"
                dataKey="qiPrice"
                name="Implied Qi price"
                stroke={QI_PRICE_COLOR}
                strokeWidth={1.8}
                dot={false}
                connectNulls={false}
                isAnimationActive
                animationDuration={500}
                animationEasing="ease-out"
              />
              <Line
                yAxisId="quai"
                type="monotone"
                dataKey="quaiPrice"
                name="QUAI close"
                stroke={QUAI_PRICE_COLOR}
                strokeWidth={1.5}
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
