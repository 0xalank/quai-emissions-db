// pg connection pool + upsert helpers for the ingest worker.
// All wei/qits values are passed as decimal strings to match numeric(78,0) columns.
// Hex strings (hash, coinbase) are converted to bytea Buffers.

import { Pool, type PoolClient } from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set — check .env.local");

export const pool = new Pool({ connectionString: url, max: 4 });

export type Cursor = {
  last_ingested_block: number;
  last_finalized_block: number;
  backfill_done: boolean;
};

export async function getCursor(): Promise<Cursor> {
  const { rows } = await pool.query<{
    last_ingested_block: string;
    last_finalized_block: string;
    backfill_done: boolean;
  }>(
    `SELECT last_ingested_block::text, last_finalized_block::text, backfill_done
     FROM ingest_cursor WHERE id = 1`,
  );
  const r = rows[0];
  return {
    last_ingested_block: Number(r.last_ingested_block),
    last_finalized_block: Number(r.last_finalized_block),
    backfill_done: r.backfill_done,
  };
}

export async function setCursor(
  lastIngested: number,
  lastFinalized: number,
): Promise<void> {
  await pool.query(
    `UPDATE ingest_cursor
     SET last_ingested_block = $1,
         last_finalized_block = $2,
         last_tailed_at = now()
     WHERE id = 1`,
    [lastIngested, lastFinalized],
  );
}

const hexToBytea = (hex: string | null | undefined): Buffer | null => {
  if (!hex) return null;
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return Buffer.from(clean, "hex");
};

// Postgres wire protocol caps a Bind message at 2^16 - 1 = 65,535 parameters
// (the parameter count field is uint16). Callers can pass arbitrarily large
// row arrays; we chunk internally based on params/row to stay safely below.
const PG_PARAM_BUDGET = 60_000;
const maxRowsPerStmt = (paramsPerRow: number): number =>
  Math.max(1, Math.floor(PG_PARAM_BUDGET / paramsPerRow));

export type BlockRow = {
  block_number: number;
  hash: string;
  parent_hash: string | null;
  ts: number; // unix seconds
  primary_coinbase: string;
  winner_token: 0 | 1;
  exchange_rate: bigint;
  k_quai_discount: bigint;
  conversion_flow_amount: bigint;
  difficulty: bigint;
  miner_difficulty: bigint;
  workshare_count: number;
  finalized: boolean;
  // Per-algo workshare counts — null when not sampled, actual count (possibly 0) when sampled.
  ws_kawpow_count: number | null;
  ws_progpow_count: number | null;
  ws_sha_count: number | null;
  ws_scrypt_count: number | null;
  // EMA rates from woHeader — null pre-SOAP (fields absent)
  sha_count_ema: bigint | null;
  sha_uncled_ema: bigint | null;
  scrypt_count_ema: bigint | null;
  scrypt_uncled_ema: bigint | null;
  // Client-side CalculateQuaiReward result (QUAI wei)
  base_block_reward: bigint;
};

const BLOCKS_PARAMS_PER_ROW = 22;

async function upsertBlocksChunk(rows: BlockRow[]): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let i = 1;
  for (const r of rows) {
    placeholders.push(
      `($${i},$${i + 1},$${i + 2},to_timestamp($${i + 3}),$${i + 4},$${i + 5},` +
        `$${i + 6},$${i + 7},$${i + 8},$${i + 9},$${i + 10},$${i + 11},$${i + 12},` +
        `$${i + 13},$${i + 14},$${i + 15},$${i + 16},$${i + 17},$${i + 18},$${i + 19},$${i + 20},$${i + 21})`,
    );
    values.push(
      r.block_number,
      hexToBytea(r.hash),
      hexToBytea(r.parent_hash),
      r.ts,
      hexToBytea(r.primary_coinbase),
      r.winner_token,
      r.exchange_rate.toString(),
      r.k_quai_discount.toString(),
      r.conversion_flow_amount.toString(),
      r.difficulty.toString(),
      r.miner_difficulty.toString(),
      r.workshare_count,
      r.finalized,
      r.ws_kawpow_count,
      r.ws_progpow_count,
      r.ws_sha_count,
      r.ws_scrypt_count,
      r.sha_count_ema !== null ? r.sha_count_ema.toString() : null,
      r.sha_uncled_ema !== null ? r.sha_uncled_ema.toString() : null,
      r.scrypt_count_ema !== null ? r.scrypt_count_ema.toString() : null,
      r.scrypt_uncled_ema !== null ? r.scrypt_uncled_ema.toString() : null,
      r.base_block_reward.toString(),
    );
    i += BLOCKS_PARAMS_PER_ROW;
  }
  await pool.query(
    `INSERT INTO blocks
       (block_number, hash, parent_hash, ts, primary_coinbase, winner_token,
        exchange_rate, k_quai_discount, conversion_flow_amount, difficulty,
        miner_difficulty, workshare_count, finalized,
        ws_kawpow_count, ws_progpow_count, ws_sha_count, ws_scrypt_count,
        sha_count_ema, sha_uncled_ema, scrypt_count_ema, scrypt_uncled_ema,
        base_block_reward)
     VALUES ${placeholders.join(",")}
     ON CONFLICT (block_number) DO UPDATE SET
       hash                    = EXCLUDED.hash,
       parent_hash             = EXCLUDED.parent_hash,
       ts                      = EXCLUDED.ts,
       primary_coinbase        = EXCLUDED.primary_coinbase,
       winner_token            = EXCLUDED.winner_token,
       exchange_rate           = EXCLUDED.exchange_rate,
       k_quai_discount         = EXCLUDED.k_quai_discount,
       conversion_flow_amount  = EXCLUDED.conversion_flow_amount,
       difficulty              = EXCLUDED.difficulty,
       miner_difficulty        = EXCLUDED.miner_difficulty,
       workshare_count         = EXCLUDED.workshare_count,
       finalized               = EXCLUDED.finalized,
       ws_kawpow_count         = EXCLUDED.ws_kawpow_count,
       ws_progpow_count        = EXCLUDED.ws_progpow_count,
       ws_sha_count            = EXCLUDED.ws_sha_count,
       ws_scrypt_count         = EXCLUDED.ws_scrypt_count,
       sha_count_ema           = EXCLUDED.sha_count_ema,
       sha_uncled_ema          = EXCLUDED.sha_uncled_ema,
       scrypt_count_ema        = EXCLUDED.scrypt_count_ema,
       scrypt_uncled_ema       = EXCLUDED.scrypt_uncled_ema,
       base_block_reward       = EXCLUDED.base_block_reward`,
    values,
  );
}

export async function upsertBlocks(rows: BlockRow[]): Promise<void> {
  const max = maxRowsPerStmt(BLOCKS_PARAMS_PER_ROW);
  for (let i = 0; i < rows.length; i += max) {
    await upsertBlocksChunk(rows.slice(i, i + max));
  }
}

export type AnalyticsRow = {
  block_number: number;
  quai_added: bigint;
  quai_removed: bigint;
  quai_total: bigint;
  qi_added: bigint;
  qi_removed: bigint;
  qi_total: bigint;
  soap_burn_balance: bigint;
  ts: number;
};

const ANALYTICS_PARAMS_PER_ROW = 9;

async function upsertAnalyticsChunk(rows: AnalyticsRow[]): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let i = 1;
  for (const r of rows) {
    placeholders.push(
      `($${i},$${i + 1},$${i + 2},$${i + 3},$${i + 4},$${i + 5},$${i + 6},$${i + 7},to_timestamp($${i + 8}))`,
    );
    values.push(
      r.block_number,
      r.quai_added.toString(),
      r.quai_removed.toString(),
      r.quai_total.toString(),
      r.qi_added.toString(),
      r.qi_removed.toString(),
      r.qi_total.toString(),
      r.soap_burn_balance.toString(),
      r.ts,
    );
    i += ANALYTICS_PARAMS_PER_ROW;
  }
  await pool.query(
    `INSERT INTO supply_analytics
       (block_number, quai_added, quai_removed, quai_total,
        qi_added, qi_removed, qi_total, soap_burn_balance, ts)
     VALUES ${placeholders.join(",")}
     ON CONFLICT (block_number) DO UPDATE SET
       quai_added        = EXCLUDED.quai_added,
       quai_removed      = EXCLUDED.quai_removed,
       quai_total        = EXCLUDED.quai_total,
       qi_added          = EXCLUDED.qi_added,
       qi_removed        = EXCLUDED.qi_removed,
       qi_total          = EXCLUDED.qi_total,
       soap_burn_balance = EXCLUDED.soap_burn_balance,
       ts                = EXCLUDED.ts`,
    values,
  );
}

export async function upsertAnalytics(rows: AnalyticsRow[]): Promise<void> {
  const max = maxRowsPerStmt(ANALYTICS_PARAMS_PER_ROW);
  for (let i = 0; i < rows.length; i += max) {
    await upsertAnalyticsChunk(rows.slice(i, i + max));
  }
}

// ── mining_info upsert ──────────────────────────────────────────────────

export type MiningInfoRow = {
  block_number: number;
  blocks_analyzed: number;
  avg_block_time_s: number;
  kawpow_difficulty: bigint;
  sha_difficulty: bigint;
  scrypt_difficulty: bigint;
  kawpow_hashrate: bigint;
  sha_hashrate: bigint;
  scrypt_hashrate: bigint;
  avg_kawpow_share_s: number;
  avg_sha_share_s: number;
  avg_scrypt_share_s: number;
  avg_tx_fees: bigint;
  estimated_block_reward: bigint;
  workshare_reward: bigint;
};

const MINING_INFO_PARAMS_PER_ROW = 15;

async function upsertMiningInfoChunk(rows: MiningInfoRow[]): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let i = 1;
  for (const r of rows) {
    placeholders.push(
      `($${i},$${i + 1},$${i + 2},$${i + 3},$${i + 4},$${i + 5},$${i + 6},$${i + 7},` +
        `$${i + 8},$${i + 9},$${i + 10},$${i + 11},$${i + 12},$${i + 13},$${i + 14})`,
    );
    values.push(
      r.block_number,
      r.blocks_analyzed,
      r.avg_block_time_s,
      r.kawpow_difficulty.toString(),
      r.sha_difficulty.toString(),
      r.scrypt_difficulty.toString(),
      r.kawpow_hashrate.toString(),
      r.sha_hashrate.toString(),
      r.scrypt_hashrate.toString(),
      r.avg_kawpow_share_s,
      r.avg_sha_share_s,
      r.avg_scrypt_share_s,
      r.avg_tx_fees.toString(),
      r.estimated_block_reward.toString(),
      r.workshare_reward.toString(),
    );
    i += MINING_INFO_PARAMS_PER_ROW;
  }
  await pool.query(
    `INSERT INTO mining_info
       (block_number, blocks_analyzed, avg_block_time_s,
        kawpow_difficulty, sha_difficulty, scrypt_difficulty,
        kawpow_hashrate, sha_hashrate, scrypt_hashrate,
        avg_kawpow_share_s, avg_sha_share_s, avg_scrypt_share_s,
        avg_tx_fees, estimated_block_reward, workshare_reward)
     VALUES ${placeholders.join(",")}
     ON CONFLICT (block_number) DO UPDATE SET
       blocks_analyzed        = EXCLUDED.blocks_analyzed,
       avg_block_time_s       = EXCLUDED.avg_block_time_s,
       kawpow_difficulty      = EXCLUDED.kawpow_difficulty,
       sha_difficulty         = EXCLUDED.sha_difficulty,
       scrypt_difficulty      = EXCLUDED.scrypt_difficulty,
       kawpow_hashrate        = EXCLUDED.kawpow_hashrate,
       sha_hashrate           = EXCLUDED.sha_hashrate,
       scrypt_hashrate        = EXCLUDED.scrypt_hashrate,
       avg_kawpow_share_s     = EXCLUDED.avg_kawpow_share_s,
       avg_sha_share_s        = EXCLUDED.avg_sha_share_s,
       avg_scrypt_share_s     = EXCLUDED.avg_scrypt_share_s,
       avg_tx_fees            = EXCLUDED.avg_tx_fees,
       estimated_block_reward = EXCLUDED.estimated_block_reward,
       workshare_reward       = EXCLUDED.workshare_reward`,
    values,
  );
}

export async function upsertMiningInfo(rows: MiningInfoRow[]): Promise<void> {
  const max = maxRowsPerStmt(MINING_INFO_PARAMS_PER_ROW);
  for (let i = 0; i < rows.length; i += max) {
    await upsertMiningInfoChunk(rows.slice(i, i + max));
  }
}

// ── coinbase_rewards upsert ───────────────────────────────────────────────

export type CoinbaseRewardRow = {
  block_number: number;
  quai_base_reward: bigint;
  quai_locked_reward: bigint;
  qi_reward: bigint;
  coinbase_etx_count: number;
  quai_coinbase_etx_count: number;
  qi_coinbase_etx_count: number;
};

const COINBASE_REWARD_PARAMS_PER_ROW = 7;

async function upsertCoinbaseRewardsChunk(
  rows: CoinbaseRewardRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let i = 1;
  for (const r of rows) {
    placeholders.push(
      `($${i},$${i + 1},$${i + 2},$${i + 3},$${i + 4},$${i + 5},$${i + 6})`,
    );
    values.push(
      r.block_number,
      r.quai_base_reward.toString(),
      r.quai_locked_reward.toString(),
      r.qi_reward.toString(),
      r.coinbase_etx_count,
      r.quai_coinbase_etx_count,
      r.qi_coinbase_etx_count,
    );
    i += COINBASE_REWARD_PARAMS_PER_ROW;
  }

  await pool.query(
    `INSERT INTO coinbase_rewards
       (block_number, quai_base_reward, quai_locked_reward, qi_reward,
        coinbase_etx_count, quai_coinbase_etx_count, qi_coinbase_etx_count)
     VALUES ${placeholders.join(",")}
     ON CONFLICT (block_number) DO UPDATE SET
       quai_base_reward        = EXCLUDED.quai_base_reward,
       quai_locked_reward      = EXCLUDED.quai_locked_reward,
       qi_reward               = EXCLUDED.qi_reward,
       coinbase_etx_count      = EXCLUDED.coinbase_etx_count,
       quai_coinbase_etx_count = EXCLUDED.quai_coinbase_etx_count,
       qi_coinbase_etx_count   = EXCLUDED.qi_coinbase_etx_count,
       indexed_at              = now()`,
    values,
  );
}

export async function upsertCoinbaseRewards(
  rows: CoinbaseRewardRow[],
): Promise<void> {
  const max = maxRowsPerStmt(COINBASE_REWARD_PARAMS_PER_ROW);
  for (let i = 0; i < rows.length; i += max) {
    await upsertCoinbaseRewardsChunk(rows.slice(i, i + max));
  }
}

export async function close(): Promise<void> {
  await pool.end();
}

// Expose type for downstream consumers that want a raw client.
export type { PoolClient };
