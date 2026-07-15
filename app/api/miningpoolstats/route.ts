import { NextResponse } from "next/server";
import { apiServerError } from "@/lib/api-helpers";
import { buildMiningPoolStatsPayload } from "@/lib/quai/miningpoolstats";
import { fetchAllIndexedSoapParentBlocks } from "@/lib/quai/miningpoolstats-server";
import { fetchMiningInfo } from "@/lib/quai/endpoints";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const [info, parentBlocks] = await Promise.all([
      fetchMiningInfo(),
      fetchAllIndexedSoapParentBlocks(10),
    ]);

    return NextResponse.json(
      buildMiningPoolStatsPayload({
        info,
        parentBlocks,
      }),
      {
        headers: {
          "cache-control": "s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (err) {
    return apiServerError("api/miningpoolstats", err);
  }
}
