import { pool } from "@/lib/db";
import {
  MINING_POOL_STATS_FEEDS,
  type MiningPoolStatsFeedConfig,
  type MiningPoolStatsParentBlockIndex,
  type MiningPoolStatsTargetKey,
} from "@/lib/quai/miningpoolstats";

const DEFAULT_BLOCK_LIMIT = 100;
const MAX_BLOCK_LIMIT = 1000;

type IndexedBlockRow = {
  chain: MiningPoolStatsParentBlockIndex["chain"];
  block_height: string;
  block_hash: string;
  block_time: string;
  reward: string;
  coinbase_txid: string;
  price_usd: string | null;
  total_found: string;
  source_total_count: string;
  last_synced_at: string;
};

export function parseMiningPoolStatsBlockLimit(url: URL): number {
  const raw = url.searchParams.get("blocks");
  if (!raw) return DEFAULT_BLOCK_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_BLOCK_LIMIT;
  return Math.max(1, Math.min(MAX_BLOCK_LIMIT, parsed));
}

export async function fetchIndexedSoapParentBlocks(
  config: MiningPoolStatsFeedConfig,
  limit = DEFAULT_BLOCK_LIMIT,
): Promise<MiningPoolStatsParentBlockIndex> {
  const boundedLimit = Math.max(1, Math.min(MAX_BLOCK_LIMIT, limit));
  const { rows } = await pool.query<IndexedBlockRow>(
    `SELECT
       b.chain,
       b.block_height::text,
       encode(b.block_hash, 'hex') AS block_hash,
       extract(epoch FROM b.block_time)::bigint::text AS block_time,
       b.reward::text,
       encode(b.coinbase_txid, 'hex') AS coinbase_txid,
       b.price_usd::text,
       count(*) OVER ()::bigint::text AS total_found,
       s.source_total_count::bigint::text,
       to_char(s.last_synced_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
         AS last_synced_at
     FROM soap_parent_blocks b
     JOIN soap_parent_block_sync s USING (chain)
     WHERE b.chain = $1
     ORDER BY b.block_time DESC, b.block_height DESC
     LIMIT $2`,
    [config.soapChain, boundedLimit],
  );
  if (rows.length === 0) {
    throw new Error(`No indexed ${config.targetSymbol} parent blocks`);
  }

  return {
    chain: config.soapChain,
    totalFound: Number(rows[0].total_found),
    sourceTotal: Number(rows[0].source_total_count),
    lastSyncedAt: rows[0].last_synced_at,
    blocks: rows.map((row) => ({
      chain: row.chain,
      height: Number(row.block_height),
      hash: row.block_hash,
      time: Number(row.block_time),
      reward: Number(row.reward),
      coinbaseTxid: row.coinbase_txid,
      priceUsd: row.price_usd == null ? null : Number(row.price_usd),
    })),
  };
}

export async function fetchAllIndexedSoapParentBlocks(
  limit = DEFAULT_BLOCK_LIMIT,
): Promise<Record<MiningPoolStatsTargetKey, MiningPoolStatsParentBlockIndex>> {
  const entries = await Promise.all(
    MINING_POOL_STATS_FEEDS.map(async (config) =>
      [
        config.target,
        await fetchIndexedSoapParentBlocks(config, limit),
      ] as const,
    ),
  );
  return Object.fromEntries(entries) as Record<
    MiningPoolStatsTargetKey,
    MiningPoolStatsParentBlockIndex
  >;
}
