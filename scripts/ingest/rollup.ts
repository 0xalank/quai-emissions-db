#!/usr/bin/env tsx
// Build / rebuild rollups_daily, rollups_weekly, rollups_monthly.
//
// Two modes:
//   - Full rebuild (default, used on first run + post-backfill):
//       runRollups()
//       Rebuilds every period from scratch. Idempotent via ON CONFLICT.
//   - Incremental (used per tail tick):
//       runRollups(sinceBlock)
//       Rebuilds only periods that contain a block with number >= sinceBlock.
//       All blocks within those periods are re-aggregated for correctness;
//       untouched periods are not re-read.
//
// `burn_delta` is computed as:
//   (this period's burn_close)
//     - COALESCE(LAG within this batch, prior stored value, 0)
// This makes it correct in both full-rebuild and incremental modes.

import { pool, close } from "./db";

type Grain = "day" | "week" | "month";

const GRAINS: { name: Grain; table: string }[] = [
  { name: "day", table: "rollups_daily" },
  { name: "week", table: "rollups_weekly" },
  { name: "month", table: "rollups_monthly" },
];

function buildSql(grain: Grain, table: string, sinceBlock?: number): string {
  const bucket = `date_trunc('${grain}', b.ts AT TIME ZONE 'UTC')::date`;
  const currentPeriod = `date_trunc('${grain}', now() AT TIME ZONE 'UTC')::date`;

  // When an incremental `sinceBlock` is provided, restrict `base` to periods
  // that contain any block >= sinceBlock, but still pull EVERY block within
  // those periods so the aggregates are correct.
  const touchedFilter =
    sinceBlock !== undefined
      ? `WHERE ${bucket} IN (
           SELECT DISTINCT date_trunc('${grain}', ts AT TIME ZONE 'UTC')::date
             FROM blocks WHERE block_number >= ${sinceBlock}
         )`
      : "";

  // burn_delta fallback: when LAG inside this batch is NULL (first row, or
  // only one period is being updated incrementally), look up the most recent
  // prior value from the persistent rollup table. We're inside the `joined`
  // CTE, so reference the `aggs` alias `a` — `joined` isn't visible to itself.
  const priorBurnCloseSql = `
    (SELECT r.burn_close FROM ${table} r
      WHERE r.period_start < a.period_start
      ORDER BY r.period_start DESC LIMIT 1)`;

  return `
WITH base AS (
  SELECT
    b.block_number,
    b.ts,
    b.exchange_rate,
    b.winner_token,
    b.workshare_count,
    b.conversion_flow_amount,
    b.ws_kawpow_count,
    b.ws_progpow_count,
    b.ws_sha_count,
    b.ws_scrypt_count,
    b.sha_count_ema,
    b.sha_uncled_ema,
    b.scrypt_count_ema,
    b.scrypt_uncled_ema,
    b.base_block_reward,
    sa.quai_added,
    sa.quai_removed,
    sa.qi_added,
    sa.qi_removed,
    sa.quai_total,
    sa.qi_total,
    sa.soap_burn_balance,
    mi.kawpow_difficulty,
    mi.sha_difficulty,
    mi.scrypt_difficulty,
    mi.kawpow_hashrate,
    mi.sha_hashrate,
    mi.scrypt_hashrate,
    mi.avg_tx_fees,
    mi.workshare_reward,
    cr.quai_base_reward,
    cr.quai_locked_reward,
    cr.qi_reward,
    ${bucket} AS period_start
  FROM blocks b
  JOIN supply_analytics sa ON sa.block_number = b.block_number
  LEFT JOIN mining_info mi ON mi.block_number = b.block_number
  LEFT JOIN coinbase_rewards cr ON cr.block_number = b.block_number
  ${touchedFilter}
),
aggs AS (
  SELECT
    period_start,
    MIN(block_number)                                AS first_block,
    MAX(block_number)                                AS last_block,
    COUNT(*)::int                                    AS block_count,
    SUM(quai_added)                                  AS quai_added_sum,
    SUM(quai_removed)                                AS quai_removed_sum,
    SUM(qi_added)                                    AS qi_added_sum,
    SUM(qi_removed)                                  AS qi_removed_sum,
    SUM(quai_added) - SUM(quai_removed)              AS quai_net_emitted,
    SUM(qi_added)   - SUM(qi_removed)                AS qi_net_emitted,
    COUNT(*) FILTER (WHERE winner_token = 0)::int    AS winner_quai_count,
    COUNT(*) FILTER (WHERE winner_token = 1)::int    AS winner_qi_count,
    COALESCE(SUM(workshare_count), 0)::bigint        AS workshare_total,
    COALESCE(AVG(workshare_count), 0)::numeric(10,4) AS workshare_avg,
    COALESCE(
      EXTRACT(EPOCH FROM (MAX(ts) - MIN(ts)))::numeric
        / NULLIF(COUNT(*) - 1, 0),
      0
    )::numeric(10,4)                                 AS avg_block_time,
    COALESCE(SUM(conversion_flow_amount), 0)         AS conversion_flow_sum,
    MAX(exchange_rate)                               AS rate_high,
    MIN(NULLIF(exchange_rate, 0))                    AS rate_low,
    -- Per-algo workshare count sums. SAMPLED: only 1/BACKFILL_SAMPLE_EVERY
    -- blocks have these populated during backfill (tail mode populates
    -- every block). We extrapolate the period sum by scaling the sampled
    -- average up to the full block count in the period:
    --     period_sum ≈ AVG(non-null ws_*_count) × block_count
    -- This is an unbiased estimator. For tail-only rows the sampled set
    -- equals the full set, so the formula collapses to the true sum.
    ROUND(
      COALESCE(AVG(ws_kawpow_count), 0) * COUNT(*)
    )::bigint                                        AS ws_kawpow_sum,
    ROUND(
      COALESCE(AVG(ws_progpow_count), 0) * COUNT(*)
    )::bigint                                        AS ws_progpow_sum,
    ROUND(
      COALESCE(AVG(ws_sha_count), 0) * COUNT(*)
    )::bigint                                        AS ws_sha_sum,
    ROUND(
      COALESCE(AVG(ws_scrypt_count), 0) * COUNT(*)
    )::bigint                                        AS ws_scrypt_sum,
    -- EMA sums. DENSE: EMAs live on every block's woHeader, parsed at
    -- header-fetch time. Period uncled ratio = uncled_ema_sum / count_ema_sum.
    -- NULL pre-SOAP (fields absent); SUM skips NULLs.
    SUM(sha_count_ema)                               AS sha_count_ema_sum,
    SUM(sha_uncled_ema)                              AS sha_uncled_ema_sum,
    SUM(scrypt_count_ema)                            AS scrypt_count_ema_sum,
    SUM(scrypt_uncled_ema)                           AS scrypt_uncled_ema_sum,
    -- Base block reward stats. DENSE: client-side CalculateQuaiReward runs
    -- for every block using dense header data; the value matches the server
    -- bit-for-bit (verified).
    AVG(base_block_reward)                           AS base_block_reward_avg,
    SUM(base_block_reward)                           AS base_block_reward_sum,
    -- mining_info averages. SAMPLED: one row per sampled post-SOAP block.
    -- Averages are unbiased estimates of the true per-period average
    -- (the RPC already returns 15-min trailing averages internally, so
    -- sampling cadence is independent of within-day resolution).
    AVG(workshare_reward)                            AS workshare_reward_avg,
    AVG(avg_tx_fees)                                 AS avg_tx_fees_avg,
    AVG(kawpow_hashrate)                             AS kawpow_hashrate_avg,
    AVG(sha_hashrate)                                AS sha_hashrate_avg,
    AVG(scrypt_hashrate)                             AS scrypt_hashrate_avg,
    AVG(kawpow_difficulty)                           AS kawpow_difficulty_avg,
    AVG(sha_difficulty)                              AS sha_difficulty_avg,
    AVG(scrypt_difficulty)                           AS scrypt_difficulty_avg,
    -- Exact reward-output sums. coinbase_reward_indexed_count equals the
    -- number of blocks in the period covered by coinbase_rewards.
    COALESCE(SUM(quai_base_reward), 0)               AS coinbase_quai_base_reward_sum,
    COALESCE(SUM(quai_locked_reward), 0)             AS coinbase_quai_locked_reward_sum,
    COALESCE(SUM(qi_reward), 0)                      AS coinbase_qi_reward_sum,
    COUNT(quai_locked_reward)::int                   AS coinbase_reward_indexed_count,
    -- Count of blocks in the period that have a mining_info row; tells
    -- dashboards "how many samples were averaged" (and is zero for
    -- pre-SOAP periods).
    COUNT(kawpow_difficulty)::int                    AS mining_block_count
  FROM base
  GROUP BY period_start
),
firsts AS (
  SELECT DISTINCT ON (period_start)
    period_start,
    exchange_rate AS rate_open
  FROM base
  ORDER BY period_start, block_number ASC
),
lasts AS (
  SELECT DISTINCT ON (period_start)
    period_start,
    exchange_rate     AS rate_close,
    quai_total        AS quai_total_end,
    qi_total          AS qi_total_end,
    soap_burn_balance AS burn_close
  FROM base
  ORDER BY period_start, block_number DESC
),
joined AS (
  SELECT
    a.period_start,
    a.first_block,
    a.last_block,
    a.block_count,
    a.quai_added_sum,
    a.quai_removed_sum,
    a.qi_added_sum,
    a.qi_removed_sum,
    a.quai_net_emitted,
    a.qi_net_emitted,
    l.quai_total_end,
    l.qi_total_end,
    l.burn_close,
    l.burn_close - COALESCE(
      LAG(l.burn_close) OVER (ORDER BY a.period_start),
      ${priorBurnCloseSql},
      0
    ) AS burn_delta,
    a.winner_quai_count,
    a.winner_qi_count,
    a.workshare_total,
    a.workshare_avg,
    a.avg_block_time,
    a.conversion_flow_sum,
    f.rate_open,
    COALESCE(a.rate_high, 0)             AS rate_high,
    COALESCE(a.rate_low, a.rate_high, 0) AS rate_low,
    l.rate_close,
    a.ws_kawpow_sum,
    a.ws_progpow_sum,
    a.ws_sha_sum,
    a.ws_scrypt_sum,
    a.sha_count_ema_sum,
    a.sha_uncled_ema_sum,
    a.scrypt_count_ema_sum,
    a.scrypt_uncled_ema_sum,
    a.base_block_reward_avg,
    a.base_block_reward_sum,
    a.workshare_reward_avg,
    a.avg_tx_fees_avg,
    a.kawpow_hashrate_avg,
    a.sha_hashrate_avg,
    a.scrypt_hashrate_avg,
    a.kawpow_difficulty_avg,
    a.sha_difficulty_avg,
    a.scrypt_difficulty_avg,
    a.coinbase_quai_base_reward_sum,
    a.coinbase_quai_locked_reward_sum,
    a.coinbase_qi_reward_sum,
    a.coinbase_reward_indexed_count,
    a.mining_block_count
  FROM aggs a
  JOIN firsts f USING (period_start)
  JOIN lasts  l USING (period_start)
)
INSERT INTO ${table} (
  period_start, first_block, last_block, block_count, partial,
  quai_added_sum, quai_removed_sum, qi_added_sum, qi_removed_sum,
  quai_net_emitted, qi_net_emitted,
  quai_total_end, qi_total_end,
  burn_close, burn_delta,
  winner_quai_count, winner_qi_count,
  workshare_total, workshare_avg, avg_block_time,
  conversion_flow_sum,
  rate_open, rate_high, rate_low, rate_close,
  ws_kawpow_sum, ws_progpow_sum, ws_sha_sum, ws_scrypt_sum,
  sha_count_ema_sum, sha_uncled_ema_sum,
  scrypt_count_ema_sum, scrypt_uncled_ema_sum,
  base_block_reward_avg, base_block_reward_sum,
  workshare_reward_avg, avg_tx_fees_avg,
  kawpow_hashrate_avg, sha_hashrate_avg, scrypt_hashrate_avg,
  kawpow_difficulty_avg, sha_difficulty_avg, scrypt_difficulty_avg,
  coinbase_quai_base_reward_sum, coinbase_quai_locked_reward_sum,
  coinbase_qi_reward_sum, coinbase_reward_indexed_count,
  mining_block_count,
  computed_at
)
SELECT
  period_start, first_block, last_block, block_count,
  (period_start = ${currentPeriod}) AS partial,
  quai_added_sum, quai_removed_sum, qi_added_sum, qi_removed_sum,
  quai_net_emitted, qi_net_emitted,
  quai_total_end, qi_total_end,
  burn_close, burn_delta,
  winner_quai_count, winner_qi_count,
  workshare_total, workshare_avg, avg_block_time,
  conversion_flow_sum,
  rate_open, rate_high, rate_low, rate_close,
  ws_kawpow_sum, ws_progpow_sum, ws_sha_sum, ws_scrypt_sum,
  sha_count_ema_sum, sha_uncled_ema_sum,
  scrypt_count_ema_sum, scrypt_uncled_ema_sum,
  base_block_reward_avg, base_block_reward_sum,
  workshare_reward_avg, avg_tx_fees_avg,
  kawpow_hashrate_avg, sha_hashrate_avg, scrypt_hashrate_avg,
  kawpow_difficulty_avg, sha_difficulty_avg, scrypt_difficulty_avg,
  coinbase_quai_base_reward_sum, coinbase_quai_locked_reward_sum,
  coinbase_qi_reward_sum, coinbase_reward_indexed_count,
  mining_block_count,
  now()
FROM joined
ON CONFLICT (period_start) DO UPDATE SET
  first_block           = EXCLUDED.first_block,
  last_block            = EXCLUDED.last_block,
  block_count           = EXCLUDED.block_count,
  partial               = EXCLUDED.partial,
  quai_added_sum        = EXCLUDED.quai_added_sum,
  quai_removed_sum      = EXCLUDED.quai_removed_sum,
  qi_added_sum          = EXCLUDED.qi_added_sum,
  qi_removed_sum        = EXCLUDED.qi_removed_sum,
  quai_net_emitted      = EXCLUDED.quai_net_emitted,
  qi_net_emitted        = EXCLUDED.qi_net_emitted,
  quai_total_end        = EXCLUDED.quai_total_end,
  qi_total_end          = EXCLUDED.qi_total_end,
  burn_close            = EXCLUDED.burn_close,
  burn_delta            = EXCLUDED.burn_delta,
  winner_quai_count     = EXCLUDED.winner_quai_count,
  winner_qi_count       = EXCLUDED.winner_qi_count,
  workshare_total       = EXCLUDED.workshare_total,
  workshare_avg         = EXCLUDED.workshare_avg,
  avg_block_time        = EXCLUDED.avg_block_time,
  conversion_flow_sum   = EXCLUDED.conversion_flow_sum,
  rate_open             = EXCLUDED.rate_open,
  rate_high             = EXCLUDED.rate_high,
  rate_low              = EXCLUDED.rate_low,
  rate_close            = EXCLUDED.rate_close,
  ws_kawpow_sum         = EXCLUDED.ws_kawpow_sum,
  ws_progpow_sum        = EXCLUDED.ws_progpow_sum,
  ws_sha_sum            = EXCLUDED.ws_sha_sum,
  ws_scrypt_sum         = EXCLUDED.ws_scrypt_sum,
  sha_count_ema_sum     = EXCLUDED.sha_count_ema_sum,
  sha_uncled_ema_sum    = EXCLUDED.sha_uncled_ema_sum,
  scrypt_count_ema_sum  = EXCLUDED.scrypt_count_ema_sum,
  scrypt_uncled_ema_sum = EXCLUDED.scrypt_uncled_ema_sum,
  base_block_reward_avg = EXCLUDED.base_block_reward_avg,
  base_block_reward_sum = EXCLUDED.base_block_reward_sum,
  workshare_reward_avg  = EXCLUDED.workshare_reward_avg,
  avg_tx_fees_avg       = EXCLUDED.avg_tx_fees_avg,
  kawpow_hashrate_avg   = EXCLUDED.kawpow_hashrate_avg,
  sha_hashrate_avg      = EXCLUDED.sha_hashrate_avg,
  scrypt_hashrate_avg   = EXCLUDED.scrypt_hashrate_avg,
  kawpow_difficulty_avg = EXCLUDED.kawpow_difficulty_avg,
  sha_difficulty_avg    = EXCLUDED.sha_difficulty_avg,
  scrypt_difficulty_avg = EXCLUDED.scrypt_difficulty_avg,
  coinbase_quai_base_reward_sum   = EXCLUDED.coinbase_quai_base_reward_sum,
  coinbase_quai_locked_reward_sum = EXCLUDED.coinbase_quai_locked_reward_sum,
  coinbase_qi_reward_sum          = EXCLUDED.coinbase_qi_reward_sum,
  coinbase_reward_indexed_count   = EXCLUDED.coinbase_reward_indexed_count,
  mining_block_count    = EXCLUDED.mining_block_count,
  computed_at           = EXCLUDED.computed_at
`;
}

export async function runRollups(
  sinceBlock?: number,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const g of GRAINS) {
    const res = await pool.query(buildSql(g.name, g.table, sinceBlock));
    out[g.table] = res.rowCount ?? 0;
  }
  return out;
}

// CLI entry point — full rebuild.
async function cli(): Promise<void> {
  const {
    rows: [{ n }],
  } = await pool.query<{ n: string }>("SELECT count(*)::text AS n FROM blocks");
  const blockCount = Number(n);
  console.log(`[rollup] ${blockCount.toLocaleString()} blocks available in store`);
  if (blockCount === 0) {
    console.log("[rollup] no blocks yet — skipping.");
    return;
  }
  for (const g of GRAINS) {
    const start = Date.now();
    await pool.query(buildSql(g.name, g.table));
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM ${g.table}`,
    );
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`[rollup] ${g.table}: ${rows[0].n} rows in ${elapsed}s`);
  }
}

// Only run CLI if invoked directly (not when imported by run.ts)
const invokedDirectly =
  process.argv[1]?.endsWith("rollup.ts") ||
  process.argv[1]?.endsWith("rollup.js");
if (invokedDirectly) {
  cli()
    .then(() => close())
    .catch(async (err) => {
      console.error("[rollup] fatal:", err);
      await close().catch(() => {});
      process.exit(1);
    });
}
