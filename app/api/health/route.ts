import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getLatestBlockNumber } from "@/lib/quai/blocks";
import { apiServerError } from "@/lib/api-helpers";
import { proxyToUpstreamApi } from "@/lib/api-proxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CursorRow = {
  last_ingested_block: string;
  last_finalized_block: string;
  last_tailed_at: Date | null;
  backfill_done: boolean;
};

export async function GET(req: Request) {
  try {
    const proxied = await proxyToUpstreamApi(req);
    if (proxied) return proxied;

    const [cursorRes, head] = await Promise.all([
      pool.query<CursorRow>(
        `SELECT last_ingested_block::text, last_finalized_block::text,
                last_tailed_at, backfill_done
         FROM ingest_cursor WHERE id = 1`,
      ),
      getLatestBlockNumber().catch(() => null),
    ]);

    const row = cursorRes.rows[0];
    const lastIngested = Number(row.last_ingested_block);
    const lastFinalized = Number(row.last_finalized_block);

    return NextResponse.json(
      {
        headBlock: head,
        lastIngestedBlock: lastIngested,
        lastFinalizedBlock: lastFinalized,
        lagBlocks: head !== null ? head - lastIngested : null,
        lastTailedAt: row.last_tailed_at
          ? row.last_tailed_at.toISOString()
          : null,
        backfillDone: row.backfill_done,
      },
      {
        headers: {
          "cache-control": "s-maxage=5, stale-while-revalidate=10",
        },
      },
    );
  } catch (err) {
    return apiServerError("api/health", err);
  }
}
