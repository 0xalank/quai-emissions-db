// /api/supply — supply curves with realized-circulating math.
//
// Backed by v_supply_{daily,weekly,monthly} (migrations/0006). The view does
// the genesis-premine + Singularity-skip math so the route handler is a pure
// projection. Single source of truth: never replicate the formula client-side.
//
// Query params:
//   period   day | week | month   (required)
//   from     YYYY-MM-DD (required, UTC)
//   to       YYYY-MM-DD (required, UTC)
//   include  comma-separated subset of: qi, burn, genesis, mined
//            (defaults to "qi,burn"; "genesis" adds the cumulative-genesis
//             baseline as a separate column for the supply-decomposition page)
//
// Response (JSON, bigints serialized as { __big: "..." } via serializeBig):
//   { period, rows: [{
//       periodStart, firstBlock, lastBlock, blockCount, partial,
//       quaiTotalEnd, realizedCirculatingQuai,
//       qiTotalEnd?, burnClose?, burnDelta?, genesisBaselineQuai?
//     }] }
//
// Caching mirrors /api/rollups (60s s-maxage / 300s SWR). Past periods are
// immutable; today's partial row updates as the tail-mode rollup rebuilder
// re-aggregates.

import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { serializeBig } from "@/lib/quai/serialize";
import {
  GENESIS_PREMINE_QUAI,
  SINGULARITY_FORK_DATE,
  SINGULARITY_SKIP_QUAI,
  SOAP_ACTIVATION_DATE,
} from "@/lib/quai/protocol-constants";
import { apiServerError, parseRangeParams } from "@/lib/api-helpers";
import { proxyToUpstreamApi } from "@/lib/api-proxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const GRAIN_TO_VIEW: Record<"day" | "week" | "month", string> = {
  day: "v_supply_daily",
  week: "v_supply_weekly",
  month: "v_supply_monthly",
};

const GRAIN_TO_ROLLUP: Record<"day" | "week" | "month", string> = {
  day: "rollups_daily",
  week: "rollups_weekly",
  month: "rollups_monthly",
};

const MAX_ROWS = 3000;

type SupplyRow = {
  period_start: string;
  first_block: string;
  last_block: string;
  block_count: number;
  partial: boolean;
  quai_total_end: string;
  qi_total_end: string;
  burn_close: string;
  burn_delta: string;
  realized_circulating_quai: string;
  cumulative_mined: string | null;
};

export async function GET(req: Request) {
  try {
    const proxied = await proxyToUpstreamApi(req);
    if (proxied) return proxied;

    const url = new URL(req.url);
    const parsed = parseRangeParams(url);
    if (parsed instanceof NextResponse) return parsed;
    const { period, from, to } = parsed;
    const includeRaw = url.searchParams.get("include") ?? "qi,burn";
    const include = new Set(includeRaw.split(",").map((s) => s.trim()).filter(Boolean));

    const view = GRAIN_TO_VIEW[period];

    // Cumulative QUAI mining rewards summed up to the end of the requested
    // window. Pre-SOAP keeps the legacy block-reward estimate. Post-SOAP uses
    // the exact CoinbaseType outbound-ETX index, with lockup multipliers
    // applied the same way go-quai applies them when the ETX is processed.
    // The CTE is bounded by `to` so the window function only scans rows the
    // caller can actually see.
    const wantsMined = include.has("mined");
    const rollupTable = GRAIN_TO_ROLLUP[period];

    const sql = wantsMined
      ? `WITH mined AS (
           SELECT
             period_start,
             SUM(
               CASE
                 WHEN period_start < DATE '${SOAP_ACTIVATION_DATE}' THEN
                   CASE
                     WHEN block_count > 0 THEN
                       FLOOR(
                         COALESCE(base_block_reward_sum, 0)
                         * winner_quai_count::numeric
                         / block_count::numeric
                       )
                     ELSE 0::numeric
                   END
                 WHEN coinbase_reward_indexed_count >= block_count THEN
                   COALESCE(coinbase_quai_locked_reward_sum, 0)
                 ELSE 0::numeric
               END
             ) OVER (ORDER BY period_start) AS cumulative_mined
           FROM ${rollupTable}
           WHERE period_start <= $2::date
         )
         SELECT
           to_char(v.period_start, 'YYYY-MM-DD') AS period_start,
           v.first_block::text, v.last_block::text, v.block_count, v.partial,
           v.quai_total_end::text,
           v.qi_total_end::text,
           v.burn_close::text, v.burn_delta::text,
           v.realized_circulating_quai::text,
           TRUNC(m.cumulative_mined)::text AS cumulative_mined
         FROM ${view} v
         JOIN mined m USING (period_start)
         WHERE v.period_start >= $1::date AND v.period_start <= $2::date
         ORDER BY v.period_start ASC
         LIMIT ${MAX_ROWS}`
      : `SELECT
           to_char(period_start, 'YYYY-MM-DD') AS period_start,
           first_block::text, last_block::text, block_count, partial,
           quai_total_end::text,
           qi_total_end::text,
           burn_close::text, burn_delta::text,
           realized_circulating_quai::text,
           NULL::text AS cumulative_mined
         FROM ${view}
         WHERE period_start >= $1::date AND period_start <= $2::date
         ORDER BY period_start ASC
         LIMIT ${MAX_ROWS}`;

    const { rows } = await pool.query<SupplyRow>(sql, [from, to]);

    // Genesis baseline is a step function — flat 3 B QUAI before Singularity,
    // (3 B − 1.667 B) = 1.333 B after. We expose it as a column so charts can
    // render the genesis-unlocks layer without re-deriving the math client-side.
    const genesisPre = GENESIS_PREMINE_QUAI;
    const genesisPost = GENESIS_PREMINE_QUAI - SINGULARITY_SKIP_QUAI;

    const data = rows.map((r) => {
      const out: Record<string, unknown> = {
        periodStart: r.period_start,
        firstBlock: Number(r.first_block),
        lastBlock: Number(r.last_block),
        blockCount: r.block_count,
        partial: r.partial,
        quaiTotalEnd: BigInt(r.quai_total_end),
        realizedCirculatingQuai: BigInt(r.realized_circulating_quai),
      };
      if (include.has("qi")) {
        out.qiTotalEnd = BigInt(r.qi_total_end);
      }
      if (include.has("burn")) {
        out.burnClose = BigInt(r.burn_close);
        out.burnDelta = BigInt(r.burn_delta);
      }
      if (include.has("genesis")) {
        out.genesisBaselineQuai =
          r.period_start >= SINGULARITY_FORK_DATE ? genesisPost : genesisPre;
      }
      if (include.has("mined") && r.cumulative_mined != null) {
        out.cumulativeMinedQuai = BigInt(r.cumulative_mined);
      }
      return out;
    });

    return NextResponse.json(
      { period, rows: serializeBig(data) },
      {
        headers: {
          "cache-control": "s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (err) {
    return apiServerError("api/supply", err);
  }
}
