import { NextResponse } from "next/server";
import { apiServerError } from "@/lib/api-helpers";
import { POW_BENCHMARK_NETWORKS } from "@/lib/comparisons/pow-dominance";
import { fetchCoinGeckoSimplePrices } from "@/lib/market/coingecko";
import {
  readPowQuotesCache,
  writePowQuotesCache,
} from "@/lib/market/pow-market-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const QUOTES_CACHE_TTL_MS = 60 * 1_000;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isFresh(cachedAt: string): boolean {
  const ts = new Date(cachedAt).getTime();
  return Number.isFinite(ts) && Date.now() - ts < QUOTES_CACHE_TTL_MS;
}

export async function GET(req: Request) {
  try {
    const ids = POW_BENCHMARK_NETWORKS.map((n) => n.coinGeckoId);
    let rows = null;
    let stale = false;
    let staleAt: string | null = null;
    let error: string | null = null;
    const cached = await readPowQuotesCache();

    if (cached && isFresh(cached.cachedAt)) {
      rows = cached.value;
      stale = true;
      staleAt = cached.cachedAt;
    }

    if (rows == null) {
      try {
        rows = await fetchCoinGeckoSimplePrices({ ids });
        await writePowQuotesCache(rows);
      } catch (err) {
        error = errorMessage(err);
        if (cached) {
          rows = cached.value;
          stale = true;
          staleAt = cached.cachedAt;
        } else {
          rows = ids.map((id) => ({
            id,
            usd: null,
            usdMarketCap: null,
            usd24hChange: null,
            lastUpdatedAt: null,
          }));
        }
      }
    }

    return NextResponse.json(
      {
        source: "coingecko",
        fetchedAt: new Date().toISOString(),
        stale,
        staleAt,
        errors: error == null ? [] : [{ id: "coingecko", message: error }],
        rows,
      },
      {
        headers: {
          "cache-control": "s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (err) {
    return apiServerError("api/pow-markets", err);
  }
}
