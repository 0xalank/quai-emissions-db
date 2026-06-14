import { weiToFloat } from "@/lib/format";
import type { QiMarketRow } from "@/lib/quai/types";

export const QI_QUOTE_COLOR = "#e20101";
export const QI_PRICE_COLOR = "#10b981";
export const QUAI_PRICE_COLOR = "#64748b";
export const QI_SUPPLY_COLOR = "#f59e0b";
export const QI_PRICE_LIVE_DATE = "2025-04-16";

export function isQiPriceLiveDate(periodStart: string): boolean {
  return periodStart >= QI_PRICE_LIVE_DATE;
}

export function qiToQuai(row: QiMarketRow): number | null {
  return row.qiToQuaiWeiPerQi == null
    ? null
    : weiToFloat(row.qiToQuaiWeiPerQi, 8);
}

export function quaiPrice(row: QiMarketRow): number | null {
  if (row.quaiPriceClose == null) return null;
  const n = Number(row.quaiPriceClose);
  return Number.isFinite(n) ? n : null;
}

export function impliedQiPrice(row: QiMarketRow): number | null {
  const quote = qiToQuai(row);
  const price = quaiPrice(row);
  if (quote == null || price == null) return null;
  return quote * price;
}

export function latestWith<T>(
  rows: QiMarketRow[] | undefined,
  getter: (row: QiMarketRow) => T | null | undefined,
): { row: QiMarketRow; value: T } | null {
  if (!rows) return null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const value = getter(rows[i]);
    if (value != null) return { row: rows[i], value };
  }
  return null;
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  const decimals = value < 0.01 ? 5 : value < 1 ? 4 : 2;
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: Math.min(2, decimals),
  })}`;
}

export function formatQuaiPerQi(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value.toLocaleString(undefined, {
    maximumFractionDigits: value >= 100 ? 2 : 4,
    minimumFractionDigits: 2,
  })} QUAI`;
}

export function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(1)}%`;
}
