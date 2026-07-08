import { NextResponse } from "next/server";
import { apiServerError, parseRangeParams } from "@/lib/api-helpers";
import { POW_BENCHMARK_NETWORKS } from "@/lib/comparisons/pow-dominance";
import type { PowMarketHistory } from "@/lib/comparisons/pow-dominance";
import { fetchCoinGeckoMarketChartRange } from "@/lib/market/coingecko";
import {
  readPowHistoryCache,
  writePowHistoryCache,
} from "@/lib/market/pow-market-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const HISTORY_CACHE_TTL_MS = 6 * 60 * 60 * 1_000;

function isRateLimit(err: unknown): boolean {
  return errorMessage(err).includes(" 429");
}

function historyFetchOrder() {
  const priority = new Map([
    ["kaspa", 0],
    ["ravencoin", 1],
  ]);
  return [...POW_BENCHMARK_NETWORKS].sort(
    (a, b) =>
      (priority.get(a.coinGeckoId) ?? 10) -
      (priority.get(b.coinGeckoId) ?? 10),
  );
}

function isFresh(cachedAt: string): boolean {
  const ts = new Date(cachedAt).getTime();
  return Number.isFinite(ts) && Date.now() - ts < HISTORY_CACHE_TTL_MS;
}

function coversRange(history: PowMarketHistory, from: string, to: string): boolean {
  if (history.rows.length === 0) return false;
  return (
    history.rows[0].date <= from &&
    history.rows[history.rows.length - 1].date >= to
  );
}

async function fetchWithRetry(args: {
  id: string;
  from: string;
  to: string;
}): Promise<PowMarketHistory> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetchCoinGeckoMarketChartRange(args);
    } catch (err) {
      lastErr = err;
      if (!isRateLimit(err) || attempt === 2) break;
      await sleep(1_500 * (attempt + 1));
    }
  }
  throw lastErr;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = parseRangeParams(url);
    if (parsed instanceof NextResponse) return parsed;
    const { from, to } = parsed;

    const rows: PowMarketHistory[] = [];
    const errors: { id: string; message: string }[] = [];
    const staleRows: { id: string; cachedAt: string }[] = [];
    const networks = historyFetchOrder();
    for (let i = 0; i < networks.length; i++) {
      const network = networks[i];
      if (i > 0) await sleep(650);
      const cached = await readPowHistoryCache({
        id: network.coinGeckoId,
        from,
        to,
      });
      if (
        cached &&
        isFresh(cached.cachedAt) &&
        coversRange(cached.value, from, to)
      ) {
        rows.push(cached.value);
        staleRows.push({
          id: network.coinGeckoId,
          cachedAt: cached.cachedAt,
        });
        continue;
      }

      try {
        const history = await fetchWithRetry({
          id: network.coinGeckoId,
          from,
          to,
        });
        rows.push(history);
        await writePowHistoryCache(history, { from, to });
      } catch (err) {
        if (cached) {
          rows.push(cached.value);
          staleRows.push({
            id: network.coinGeckoId,
            cachedAt: cached.cachedAt,
          });
        }
        errors.push({
          id: network.coinGeckoId,
          message: errorMessage(err),
        });
      }
    }

    return NextResponse.json(
      {
        source: "coingecko",
        fetchedAt: new Date().toISOString(),
        from,
        to,
        rows,
        errors,
        staleRows,
      },
      {
        headers: {
          "cache-control": "s-maxage=1800, stale-while-revalidate=3600",
        },
      },
    );
  } catch (err) {
    return apiServerError("api/pow-market-history", err);
  }
}
