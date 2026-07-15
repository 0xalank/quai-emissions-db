import { NextResponse } from "next/server";
import { apiServerError } from "@/lib/api-helpers";
import { fetchMiningInfo } from "@/lib/quai/endpoints";
import {
  buildMiningPoolStatsPoolPayload,
  miningPoolStatsFeedForTarget,
} from "@/lib/quai/miningpoolstats";
import { fetchLatestSoapParentBlock } from "@/lib/quai/miningpoolstats-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ network: string }> },
) {
  try {
    const { network } = await params;
    const config = miningPoolStatsFeedForTarget(network);
    if (!config) {
      return NextResponse.json(
        { error: "Unknown MiningPoolStats network. Use bch, ltc, doge, or rvn." },
        { status: 404 },
      );
    }

    const [info, parentBlock] = await Promise.all([
      fetchMiningInfo(),
      fetchLatestSoapParentBlock(config),
    ]);
    return NextResponse.json(
      buildMiningPoolStatsPoolPayload({ info, config, parentBlock }),
      {
        headers: {
          "cache-control": "s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (err) {
    return apiServerError("api/miningpoolstats/[network]", err);
  }
}
