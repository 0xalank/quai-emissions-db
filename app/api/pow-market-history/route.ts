import { NextResponse } from "next/server";
import { apiServerError, parseRangeParams } from "@/lib/api-helpers";
import { POW_BENCHMARK_NETWORKS } from "@/lib/comparisons/pow-dominance";
import type { PowMarketHistory } from "@/lib/comparisons/pow-dominance";
import { fetchCoinGeckoMarketChartRange } from "@/lib/market/coingecko";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = parseRangeParams(url);
    if (parsed instanceof NextResponse) return parsed;
    const { from, to } = parsed;

    const rows: PowMarketHistory[] = [];
    const errors: { id: string; message: string }[] = [];
    for (const network of POW_BENCHMARK_NETWORKS) {
      try {
        rows.push(
          await fetchCoinGeckoMarketChartRange({
            id: network.coinGeckoId,
            from,
            to,
          }),
        );
      } catch (err) {
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
