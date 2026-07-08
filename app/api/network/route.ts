import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { apiServerError, parseRangeParams } from "@/lib/api-helpers";
import { proxyToUpstreamApi } from "@/lib/api-proxy";
import { serializeBig } from "@/lib/quai/serialize";
import type { NetworkStatsRow } from "@/lib/quai/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_ROWS = 3000;

type NetworkSqlRow = {
  period_start: string;
  first_block: string;
  last_block: string;
  block_count: number;
  partial: boolean;
  tx_count: string;
  active_addresses: string;
  new_addresses: string;
  cumulative_addresses: string;
  burn_delta: string;
  burn_close: string;
  coinbase_quai_locked_reward_sum: string;
  coinbase_reward_indexed_count: number;
  kawpow_hashrate_avg: string | null;
  sha_hashrate_avg: string | null;
  scrypt_hashrate_avg: string | null;
  mining_block_count: number | null;
};

function toNetworkStatsRow(r: NetworkSqlRow): NetworkStatsRow {
  return {
    periodStart: r.period_start,
    firstBlock: Number(r.first_block),
    lastBlock: Number(r.last_block),
    blockCount: r.block_count,
    partial: r.partial,
    txCount: Number(r.tx_count),
    activeAddresses: Number(r.active_addresses),
    newAddresses: Number(r.new_addresses),
    cumulativeAddresses: Number(r.cumulative_addresses),
    burnDelta: BigInt(r.burn_delta),
    burnClose: BigInt(r.burn_close),
    coinbaseQuaiLockedRewardSum: BigInt(r.coinbase_quai_locked_reward_sum),
    coinbaseRewardIndexedCount: r.coinbase_reward_indexed_count,
    kawpowHashrateAvg:
      r.kawpow_hashrate_avg == null ? null : BigInt(r.kawpow_hashrate_avg),
    shaHashrateAvg:
      r.sha_hashrate_avg == null ? null : BigInt(r.sha_hashrate_avg),
    scryptHashrateAvg:
      r.scrypt_hashrate_avg == null ? null : BigInt(r.scrypt_hashrate_avg),
    miningBlockCount: r.mining_block_count,
  };
}

export async function GET(req: Request) {
  try {
    const proxied = await proxyToUpstreamApi(req);
    if (proxied) return proxied;

    const url = new URL(req.url);
    const parsed = parseRangeParams(url);
    if (parsed instanceof NextResponse) return parsed;
    const { period, from, to } = parsed;
    if (period !== "day") {
      return NextResponse.json(
        { error: "Network stats are currently available at daily granularity" },
        { status: 400 },
      );
    }

    const { rows } = await pool.query<NetworkSqlRow>(
      `WITH periods AS (
         SELECT
           period_start,
           first_block,
           last_block,
           block_count,
           partial,
           burn_delta,
           burn_close,
           coinbase_quai_locked_reward_sum,
           coinbase_reward_indexed_count,
           kawpow_hashrate_avg,
           sha_hashrate_avg,
           scrypt_hashrate_avg,
           mining_block_count
         FROM rollups_daily
         WHERE period_start >= $1::date AND period_start <= $2::date
         ORDER BY period_start ASC
         LIMIT ${MAX_ROWS}
       ),
       tx_daily AS (
         SELECT
           date_trunc('day', b.ts AT TIME ZONE 'UTC')::date AS period_start,
           SUM(ba.tx_count)::bigint AS tx_count
         FROM block_activity ba
         JOIN blocks b ON b.block_number = ba.block_number
         WHERE b.ts >= $1::date AND b.ts < ($2::date + INTERVAL '1 day')
         GROUP BY 1
       ),
       active_daily AS (
         SELECT
           date_trunc('day', b.ts AT TIME ZONE 'UTC')::date AS period_start,
           COUNT(DISTINCT baa.address)::bigint AS active_addresses
         FROM block_active_addresses baa
         JOIN blocks b ON b.block_number = baa.block_number
         WHERE b.ts >= $1::date AND b.ts < ($2::date + INTERVAL '1 day')
         GROUP BY 1
       ),
       new_daily AS (
         SELECT
           first_seen_date AS period_start,
           COUNT(*)::bigint AS new_addresses
         FROM address_first_seen
         WHERE first_seen_date >= $1::date AND first_seen_date <= $2::date
         GROUP BY 1
       ),
       prior AS (
         SELECT COUNT(*)::bigint AS n
         FROM address_first_seen
         WHERE first_seen_date < $1::date
       ),
       joined AS (
         SELECT
           p.*,
           COALESCE(t.tx_count, 0)::bigint AS tx_count,
           COALESCE(a.active_addresses, 0)::bigint AS active_addresses,
           COALESCE(n.new_addresses, 0)::bigint AS new_addresses
         FROM periods p
         LEFT JOIN tx_daily t USING (period_start)
         LEFT JOIN active_daily a USING (period_start)
         LEFT JOIN new_daily n USING (period_start)
       )
       SELECT
         to_char(j.period_start, 'YYYY-MM-DD') AS period_start,
         j.first_block::text,
         j.last_block::text,
         j.block_count,
         j.partial,
         j.tx_count::text,
         j.active_addresses::text,
         j.new_addresses::text,
         (prior.n + SUM(j.new_addresses) OVER (ORDER BY j.period_start))::text
           AS cumulative_addresses,
         j.burn_delta::text,
         j.burn_close::text,
         j.coinbase_quai_locked_reward_sum::text,
         j.coinbase_reward_indexed_count,
         j.kawpow_hashrate_avg::text,
         j.sha_hashrate_avg::text,
         j.scrypt_hashrate_avg::text,
         j.mining_block_count
       FROM joined j
       CROSS JOIN prior
       ORDER BY j.period_start ASC`,
      [from, to],
    );

    return NextResponse.json(
      { period, rows: serializeBig(rows.map(toNetworkStatsRow)) },
      {
        headers: {
          "cache-control": "s-maxage=30, stale-while-revalidate=300",
        },
      },
    );
  } catch (err) {
    return apiServerError("api/network", err);
  }
}
