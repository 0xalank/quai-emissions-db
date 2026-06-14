const MEXC_BASE_URL = "https://api.mexc.com";
const DAY_MS = 86_400_000;

export type MarketPriceDailyRow = {
  source: string;
  symbol: string;
  quote_currency: string;
  period_start: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string | null;
  quote_volume: string | null;
  source_open_time_ms: number;
  source_close_time_ms: number;
};

type MexcKlineRow = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
];

function dateToMs(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getTime();
}

function msToDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export async function fetchMexcDailyPrices({
  symbol = "QUAIUSDT",
  from,
  to,
  limit = 1000,
  signal,
}: {
  symbol?: string;
  from: string;
  to: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<MarketPriceDailyRow[]> {
  const params = new URLSearchParams({
    symbol,
    interval: "1d",
    startTime: String(dateToMs(from)),
    endTime: String(dateToMs(to) + DAY_MS - 1),
    limit: String(limit),
  });
  const res = await fetch(`${MEXC_BASE_URL}/api/v3/klines?${params}`, {
    signal,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`mexc klines ${res.status}`);
  const raw = (await res.json()) as MexcKlineRow[];
  if (!Array.isArray(raw)) {
    throw new Error(`mexc klines non-array response`);
  }
  return raw.map((r) => ({
    source: "mexc",
    symbol: "QUAI",
    quote_currency: "USDT",
    period_start: msToDate(r[0]),
    open: r[1],
    high: r[2],
    low: r[3],
    close: r[4],
    volume: r[5] ?? null,
    quote_volume: r[7] ?? null,
    source_open_time_ms: r[0],
    source_close_time_ms: r[6],
  }));
}
