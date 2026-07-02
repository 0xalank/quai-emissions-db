import type {
  PowMarketHistory,
  PowMarketHistoryPoint,
  PowMarketQuote,
} from "@/lib/comparisons/pow-dominance";

const COINGECKO_BASE_URL =
  process.env.COINGECKO_API_BASE ?? "https://api.coingecko.com/api/v3";

type CoinGeckoSimplePriceRow = {
  usd?: number;
  usd_market_cap?: number;
  usd_24h_change?: number;
  last_updated_at?: number;
};

type CoinGeckoSimplePriceResponse = Record<string, CoinGeckoSimplePriceRow>;

type CoinGeckoMarketChartResponse = {
  prices?: [number, number][];
  market_caps?: [number, number][];
};

function coinGeckoHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
  };
  const demoKey =
    process.env.COINGECKO_DEMO_API_KEY ?? process.env.CG_DEMO_API_KEY;
  const proKey = process.env.COINGECKO_PRO_API_KEY;
  if (proKey) {
    headers["x-cg-pro-api-key"] = proKey;
  } else if (demoKey) {
    headers["x-cg-demo-api-key"] = demoKey;
  }
  return headers;
}

function msToDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export async function fetchCoinGeckoSimplePrices({
  ids,
  signal,
}: {
  ids: string[];
  signal?: AbortSignal;
}): Promise<PowMarketQuote[]> {
  const params = new URLSearchParams({
    ids: ids.join(","),
    vs_currencies: "usd",
    include_market_cap: "true",
    include_24hr_change: "true",
    include_last_updated_at: "true",
    precision: "full",
  });

  const res = await fetch(`${COINGECKO_BASE_URL}/simple/price?${params}`, {
    headers: coinGeckoHeaders(),
    signal,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`coingecko simple price ${res.status}`);

  const raw = (await res.json()) as CoinGeckoSimplePriceResponse;
  return ids.map((id) => {
    const row = raw[id] ?? {};
    return {
      id,
      usd: typeof row.usd === "number" ? row.usd : null,
      usdMarketCap:
        typeof row.usd_market_cap === "number" ? row.usd_market_cap : null,
      usd24hChange:
        typeof row.usd_24h_change === "number" ? row.usd_24h_change : null,
      lastUpdatedAt:
        typeof row.last_updated_at === "number" ? row.last_updated_at : null,
    };
  });
}

export async function fetchCoinGeckoMarketChartRange({
  id,
  from,
  to,
  signal,
}: {
  id: string;
  from: string;
  to: string;
  signal?: AbortSignal;
}): Promise<PowMarketHistory> {
  const params = new URLSearchParams({
    vs_currency: "usd",
    from,
    to,
    interval: "daily",
    precision: "full",
  });

  const res = await fetch(
    `${COINGECKO_BASE_URL}/coins/${encodeURIComponent(
      id,
    )}/market_chart/range?${params}`,
    {
      headers: coinGeckoHeaders(),
      signal,
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`coingecko market chart ${id} ${res.status}`);

  const raw = (await res.json()) as CoinGeckoMarketChartResponse;
  const marketCapByDate = new Map(
    (raw.market_caps ?? []).map(([ms, cap]) => [msToDate(ms), cap]),
  );
  const rowsByDate = new Map<string, PowMarketHistoryPoint>();

  for (const [ms, price] of raw.prices ?? []) {
    const date = msToDate(ms);
    rowsByDate.set(date, {
      date,
      priceUsd: Number.isFinite(price) ? price : null,
      marketCapUsd: marketCapByDate.get(date) ?? null,
    });
  }

  return {
    id,
    rows: [...rowsByDate.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
  };
}
