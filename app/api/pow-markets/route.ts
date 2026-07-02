import { NextResponse } from "next/server";
import { apiServerError } from "@/lib/api-helpers";
import { POW_BENCHMARK_NETWORKS } from "@/lib/comparisons/pow-dominance";
import { fetchCoinGeckoSimplePrices } from "@/lib/market/coingecko";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const ids = POW_BENCHMARK_NETWORKS.map((n) => n.coinGeckoId);
    const rows = await fetchCoinGeckoSimplePrices({ ids });

    return NextResponse.json(
      {
        source: "coingecko",
        fetchedAt: new Date().toISOString(),
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
