import { NextResponse } from "next/server";
import { fetchMiningInfo } from "@/lib/quai/endpoints";
import { serializeBig } from "@/lib/quai/serialize";
import { storeLatestAnalytics } from "@/lib/store";
import { WEI_PER_TOKEN } from "@/lib/quai/constants";
import type { SupplyInfo } from "@/lib/quai/types";
import { apiServerError } from "@/lib/api-helpers";
import { proxyToUpstreamApi } from "@/lib/api-proxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const proxied = await proxyToUpstreamApi(req);
    if (proxied) return proxied;

    // Mining info comes from `quai_getMiningInfo` on the zone RPC; supply +
    // analytics + burn come from the rollup store.
    const [info, analytics] = await Promise.all([
      fetchMiningInfo(),
      storeLatestAnalytics(),
    ]);

    // Derive the legacy `supply.quaiWhole` from analytics so the frontend
    // KpiStrip's fallback chain keeps working without a trip to /supply.
    const supply: SupplyInfo = {
      quaiWhole: analytics
        ? analytics.quaiSupplyTotal / WEI_PER_TOKEN
        : 0n,
    };

    return NextResponse.json(
      {
        supply: serializeBig(supply),
        info: serializeBig(info),
        analytics: analytics ? serializeBig(analytics) : null,
      },
      {
        headers: {
          "cache-control": "s-maxage=30, stale-while-revalidate=60",
        },
      },
    );
  } catch (err) {
    return apiServerError("api/stats", err);
  }
}
