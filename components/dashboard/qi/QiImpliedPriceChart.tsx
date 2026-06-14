"use client";
import { useMemo, useState } from "react";
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
  isQiPriceLiveDate,
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

type PriceScale = "log" | "linear";

function priceDomain(values: Array<number | null>): [number, number] {
  const positive = values.filter(
    (v): v is number => v != null && Number.isFinite(v) && v > 0,
  );
  if (positive.length === 0) return [0.001, 1];
  const min = Math.min(...positive);
  const max = Math.max(...positive);
  if (min === max) return [min * 0.75, max * 1.25];
  return [min * 0.9, max * 1.1];
}

export function QiImpliedPriceChart({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  const [scale, setScale] = useState<PriceScale>("log");
  const compact = useCompactViewport();
  const { data, isLoading, error } = useQiMarket({ from, to });

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((r) => ({
      date: r.periodStart,
      qiPrice: isQiPriceLiveDate(r.periodStart) ? impliedQiPrice(r) : null,
      quaiPrice: quaiPrice(r),
      quoteCurrency: r.quoteCurrency ?? "USDT",
    }));
  }, [data]);

  const hasPrice = chartData.some((r) => r.qiPrice != null);
  const qiDomain = useMemo(
    () => priceDomain(chartData.map((r) => r.qiPrice)),
    [chartData],
  );

  return (
    <Card>
      <div className="chart-card-header">
        <CardTitle>Implied Qi price</CardTitle>
        <div className="chart-card-actions">
          <div
            role="tablist"
            aria-label="Price scale"
            className="inline-flex items-center gap-0.5 rounded-md border border-slate-900/10 p-0.5 dark:border-white/10"
          >
            {(["log", "linear"] as const).map((opt) => {
              const active = scale === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setScale(opt)}
                  className={
                    active
                      ? "rounded px-2 py-0.5 text-xs transition bg-slate-900/10 text-slate-900 dark:bg-white/15 dark:text-white"
                      : "rounded px-2 py-0.5 text-xs transition text-slate-700 hover:text-slate-900 dark:text-white/60 dark:hover:text-white/90"
                  }
                >
                  {opt === "log" ? "Log" : "Linear"}
                </button>
              );
            })}
          </div>
          <InfoPopover label="About implied Qi price">
            <p>
              Implied Qi price is calculated as daily QUAI/USDT close multiplied
              by the stored chain quote for QUAI per Qi.
            </p>
            <p className="mt-2">
              QUAI candles come from MEXC. Days without a candle still keep the
              chain quote, but cannot produce an implied price.
            </p>
            <p className="mt-2">
              Implied Qi price history is shown from April 16, 2025 onward.
              The QUAI close line always stays on a linear scale.
            </p>
          </InfoPopover>
        </div>
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
                scale={scale}
                domain={scale === "log" ? qiDomain : ["auto", "auto"]}
                tickCount={compact ? 4 : 5}
              />
              <YAxis
                yAxisId="quai"
                orientation="right"
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                tickFormatter={(v) => formatCurrency(Number(v))}
                tickLine={false}
                axisLine={false}
                width={compact ? 48 : 64}
                scale="linear"
                domain={["auto", "auto"]}
                tickCount={compact ? 4 : 5}
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
