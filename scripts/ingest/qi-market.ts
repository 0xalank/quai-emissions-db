import { fetchMexcDailyPrices } from "../../lib/market/prices";
import { walkQiToQuaiDailyQuotes } from "../../lib/quai/qi-quotes";
import {
  pool,
  upsertMarketPricesDaily,
  upsertQiDailyQuotes,
  type MarketPriceDailyRow,
  type QiDailyQuoteRow,
} from "./db";

const MAINNET_DATE = "2025-01-29";
const DAY_MS = 86_400_000;

type SyncResult = {
  marketPrices: number;
  qiQuotes: number;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

async function defaultMarketFromDate(): Promise<string> {
  const { rows } = await pool.query<{ max_period: string | null }>(
    `SELECT to_char(max(period_start), 'YYYY-MM-DD') AS max_period
      FROM market_prices_daily
      WHERE source = 'mexc' AND symbol = 'QUAI' AND quote_currency = 'USDT'`,
  );
  const maxPeriod = rows[0]?.max_period;
  if (!maxPeriod) return MAINNET_DATE;
  // Refresh recent rows because today's candle is partial and yesterday can
  // settle slightly after UTC close.
  return maxDate(MAINNET_DATE, addDays(maxPeriod, -2));
}

export async function syncMarketPricesDaily({
  fromDate,
  toDate = todayIso(),
}: {
  fromDate?: string;
  toDate?: string;
} = {}): Promise<number> {
  let cursor = fromDate ?? (await defaultMarketFromDate());
  let total = 0;

  while (cursor <= toDate) {
    const rows: MarketPriceDailyRow[] = await fetchMexcDailyPrices({
      from: cursor,
      to: toDate,
      limit: 1000,
    });
    if (rows.length === 0) break;
    await upsertMarketPricesDaily(rows);
    total += rows.length;

    const last = rows[rows.length - 1].period_start;
    const next = addDays(last, 1);
    if (next <= cursor) break;
    cursor = next;
    if (Date.parse(next) > Date.parse(toDate) + DAY_MS) break;
  }

  return total;
}

type QuoteTarget = {
  period_start: string;
  block_number: string;
};

export async function syncQiDailyQuotes({
  fromDate = MAINNET_DATE,
  toDate = todayIso(),
  limit = 1000,
  refreshRecentDays = 2,
}: {
  fromDate?: string;
  toDate?: string;
  limit?: number;
  refreshRecentDays?: number;
} = {}): Promise<number> {
  const recentCutoff = minDate(toDate, addDays(todayIso(), -refreshRecentDays));
  const { rows } = await pool.query<QuoteTarget>(
    `SELECT
       to_char(r.period_start, 'YYYY-MM-DD') AS period_start,
       r.last_block::text AS block_number
     FROM rollups_daily r
     LEFT JOIN qi_daily_quotes q ON q.period_start = r.period_start
     WHERE r.period_start >= $1::date
       AND r.period_start <= $2::date
       AND r.block_count > 0
       AND (
         q.period_start IS NULL
         OR q.block_number <> r.last_block
         OR r.period_start >= $3::date
       )
     ORDER BY r.period_start ASC
     LIMIT $4`,
    [fromDate, toDate, recentCutoff, limit],
  );
  if (rows.length === 0) return 0;

  const targets = rows.map((r) => ({
    period_start: r.period_start,
    block_number: Number(r.block_number),
  }));
  const quotes: QiDailyQuoteRow[] = await walkQiToQuaiDailyQuotes(targets);
  await upsertQiDailyQuotes(quotes);
  return quotes.length;
}

export async function syncQiMarketData(args: {
  fromDate?: string;
  toDate?: string;
  quoteLimit?: number;
} = {}): Promise<SyncResult> {
  const [marketPrices, qiQuotes] = await Promise.all([
    syncMarketPricesDaily({
      fromDate: args.fromDate,
      toDate: args.toDate,
    }),
    syncQiDailyQuotes({
      fromDate: args.fromDate ?? MAINNET_DATE,
      toDate: args.toDate ?? todayIso(),
      limit: args.quoteLimit ?? 1000,
    }),
  ]);
  return { marketPrices, qiQuotes };
}
