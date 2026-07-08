#!/usr/bin/env tsx
// Unified ingest: backfill → tail → maintain. One command for life.
//
// HYBRID DENSE/SAMPLED MODEL
// ───────────────────────────
// Dense (every block, pre- and post-SOAP):
//   - blocks: hash, parent_hash, ts, primary_coinbase, winner_token,
//     exchange_rate, k_quai_discount, conversion_flow_amount, difficulty,
//     miner_difficulty, primeTerminusNumber, base_block_reward (client-computed),
//     shaCountEma, shaUncledEma, scryptCountEma, scryptUncledEma
//   - supply_analytics: all columns (quai_added/removed/total, qi_added/removed/total,
//     soap_burn_balance)
//   - burn balance
//   - coinbase_rewards: exact CoinbaseType outbound-ETX reward sums
// Sampled (every BACKFILL_SAMPLE_EVERY-th block in backfill mode; every block in tail):
//   - blocks: ws_kawpow_count, ws_progpow_count, ws_sha_count, ws_scrypt_count
//     (requires full-block fetch to read the `workshares[]` array)
//   - mining_info: all columns (kawpow/sha/scrypt hashrate, difficulty, share
//     times, reward math — server-computed 15-min trailing averages)
//
// Dashboard implications documented in SAMPLING.md:
//   - Anything "per block" or a period snapshot (burn_close, quai_total_end)
//     is dense → exactly accurate.
//   - Anything averaged (hashrate_avg, difficulty_avg) over a day is lossless
//     — 288 samples/day dwarfs the within-day autocorrelation.
//   - Anything summed from sampled columns (ws_*_sum) is estimated from
//     avg × block_count; rollup SQL marks which columns use this pattern.
//
// Integrity guarantees (unchanged from dense version):
//   1. Strict coverage — every requested block has a header, analytics, and
//      burn balance row before we write. Missing any → throw.
//   2. Chunk-boundary continuity — new chunk's first block's parentHash must
//      equal stored hash of (first - 1). Mismatch → rewind, throw.
//   3. Tail-mode reorg scan — top-REORG_DEPTH hash comparison.
//
// Sampling failures are best-effort: if walkBlocks or walkMiningInfo fail on
// some sampled blocks, the rest of the chunk still commits (dense columns
// remain correct). A later re-pass can fill the gaps.

import {
  getLatestBlockNumber,
  walkBlocksByNums,
  walkMiningInfo,
} from "../../lib/quai/blocks";
import { walkFullBlockSummariesByNums } from "../../lib/quai/coinbase-rewards";
import { walkSupplyAnalytics } from "../../lib/quai/supply";
import { ZONE_RPC } from "../../lib/quai/constants";
import { KAWPOW_FORK_BLOCK } from "../../lib/quai/rewards";
import { walkHeaders } from "./headers";
import { batchBurnBalances } from "./burn";
import {
  close,
  getCursor,
  pool,
  setCursor,
  upsertAnalytics,
  upsertBlocks,
  upsertCoinbaseRewards,
  upsertMiningInfo,
  upsertNetworkActivity,
  type AnalyticsRow,
  type BlockActiveAddressRow,
  type BlockActivityRow,
  type BlockRow,
  type CoinbaseRewardRow,
  type AddressFirstSeenRow,
  type MiningInfoRow,
} from "./db";
import { runRollups } from "./rollup";
import { syncQiMarketData } from "./qi-market";
import type { NormalizedBlock } from "../../lib/quai/types";

const FINALITY_BUFFER = 15; // 5-block cushion past REORG_DEPTH
const REORG_DEPTH = 10;
// Sampling cadence for the expensive calls during backfill. Every 60 zone
// blocks ≈ 5 minutes, giving ~288 samples/day — plenty for averaged stats.
// Tail mode ignores this and samples every block.
const BACKFILL_SAMPLE_EVERY = 60;
// 10k blocks/iteration. Each chunk fans out into 5 parallel 2k header batches
// (quai_getHeaderByNumber response caps at ~2025 rows before hitting the 10 MiB
// batch-response limit on debug.rpc.quai.network), one 10k analytics batch
// (quai_getSupplyAnalyticsForBlock has ~40k headroom), and one 10k burn-balance
// batch (quai_getBalance has ~142k headroom). Larger chunks amortize the
// per-iteration fixed costs (DB upsert, continuity check, cursor write, log
// line) across 5x more blocks.
const BACKFILL_CHUNK = 10_000;
const TAIL_POLL_MS = 3000;
const ERROR_BACKOFF_MS = 5000;
const MARKET_SYNC_MS = 15 * 60_000;

let shuttingDown = false;
const sigHandler = (sig: string) => {
  if (shuttingDown) return;
  console.log(`\n[ingest] received ${sig}, finishing current work then exiting`);
  shuttingDown = true;
};
process.on("SIGINT", () => sigHandler("SIGINT"));
process.on("SIGTERM", () => sigHandler("SIGTERM"));

const sleep = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));

function toHashHex(h: string): string {
  return (h.startsWith("0x") ? h.slice(2) : h).toLowerCase();
}

function blocksToRows(
  blocks: NormalizedBlock[],
  safeHead: number,
): BlockRow[] {
  return blocks.map((b) => ({
    block_number: b.number,
    hash: b.hash,
    parent_hash: b.parentHash,
    ts: b.timestamp,
    primary_coinbase: b.primaryCoinbase,
    winner_token: b.winnerToken === "QUAI" ? 0 : 1,
    exchange_rate: b.exchangeRate,
    k_quai_discount: b.kQuaiDiscount,
    conversion_flow_amount: b.conversionFlowAmount,
    ws_kawpow_count: b.wsKawpowCount,
    ws_progpow_count: b.wsProgpowCount,
    ws_sha_count: b.wsShaCount,
    ws_scrypt_count: b.wsScryptCount,
    sha_count_ema: b.shaCountEma,
    sha_uncled_ema: b.shaUncledEma,
    scrypt_count_ema: b.scryptCountEma,
    scrypt_uncled_ema: b.scryptUncledEma,
    base_block_reward: b.baseBlockReward,
    difficulty: b.difficulty,
    miner_difficulty: b.minerDifficulty,
    workshare_count: b.workshareCount,
    finalized: b.number <= safeHead,
  }));
}

type LogReorgArgs = {
  mode: "tail" | "backfill_continuity";
  divergeFrom: number;
  cursorBefore: number;
  oldHash: Buffer | null;
  newHash: Buffer | null;
  note?: string;
};

async function logReorg(r: LogReorgArgs): Promise<void> {
  await pool.query(
    `INSERT INTO reorg_log
       (detection_mode, diverge_from, cursor_before, old_hash, new_hash, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [r.mode, r.divergeFrom, r.cursorBefore, r.oldHash, r.newHash, r.note ?? null],
  );
}

// Before we write a new chunk, confirm the chain links up: block[from].parentHash
// must match the stored hash of (from - 1). If not, the stored chain from some
// earlier point is stale (deep reorg we missed). Rewind cursor and let the
// next iteration re-ingest.
async function assertContinuity(
  from: number,
  firstBlock: NormalizedBlock,
  cursorBefore: number,
): Promise<void> {
  if (from <= 1) return;
  const { rows } = await pool.query<{ hash: Buffer }>(
    `SELECT hash FROM blocks WHERE block_number = $1`,
    [from - 1],
  );
  if (rows.length === 0) {
    throw new Error(
      `continuity: no stored block ${from - 1} — cursor/DB out of sync`,
    );
  }
  const storedHex = rows[0].hash.toString("hex").toLowerCase();
  const parentHex = toHashHex(firstBlock.parentHash);
  if (storedHex !== parentHex) {
    const rewindTo = Math.max(0, from - 1 - REORG_DEPTH);
    console.warn(
      `[ingest] continuity break at #${from - 1}: stored=${storedHex.slice(0, 12)}… ` +
        `parent=${parentHex.slice(0, 12)}… — rewinding cursor to ${rewindTo}`,
    );
    await logReorg({
      mode: "backfill_continuity",
      divergeFrom: from - 1,
      cursorBefore,
      oldHash: rows[0].hash,
      newHash: Buffer.from(parentHex, "hex"),
      note: `rewound ${REORG_DEPTH} blocks to ${rewindTo}`,
    });
    await pool.query(`DELETE FROM address_first_seen WHERE first_seen_block > $1`, [
      rewindTo,
    ]);
    await pool.query(`DELETE FROM blocks WHERE block_number > $1`, [rewindTo]);
    await pool.query(
      `UPDATE ingest_cursor
         SET last_ingested_block = $1,
             last_finalized_block = LEAST(last_finalized_block, $1)
         WHERE id = 1`,
      [rewindTo],
    );
    throw new Error(`continuity: rewound to ${rewindTo}, will retry`);
  }
}

async function ingestRange(
  from: number,
  to: number,
  opts: { safeHead: number; cursorBefore: number; sampleEvery: number },
): Promise<{
  blocks: number;
  sampled: number;
  miningInfo: number;
  coinbaseRewards: number;
  activityBlocks: number;
  dbWriteMs: number;
}> {
  const expected = to - from + 1;
  const blockNums: number[] = [];
  for (let n = from; n <= to; n++) blockNums.push(n);

  // Sampled subset of block numbers (backfill: 1/sampleEvery; tail: every block).
  const sampledNums =
    opts.sampleEvery <= 1
      ? blockNums.slice()
      : blockNums.filter((n) => n % opts.sampleEvery === 0);

  // Dense path (every block): headers carry woHeader with per-algo EMAs and
  // primeTerminusNumber, so almost every column gets populated here.
  // Sampled path: full blocks to count workshares[]; getMiningInfo for
  // server-computed hashrate/reward. Both post-SOAP only for mining_info.
  const fullBlockSummariesPromise = walkFullBlockSummariesByNums(blockNums);

  const [headers, analyticsMap, burnMap, sampledBlocks, fullBlockSummaries] =
    await Promise.all([
      walkHeaders(from, to),
      walkSupplyAnalytics(from, to),
      batchBurnBalances(blockNums),
      walkBlocksByNums(sampledNums),
      fullBlockSummariesPromise,
    ]);
  const coinbaseRewardRows: CoinbaseRewardRow[] = fullBlockSummaries.map(
    (row) => row.coinbaseReward,
  );
  const blockActivityRows: BlockActivityRow[] = fullBlockSummaries.map(
    (row) => row.activity.blockActivity,
  );
  const blockAddressRows: BlockActiveAddressRow[] = fullBlockSummaries.flatMap(
    (row) => row.activity.blockAddresses,
  );
  const headerTsByBlock = new Map(headers.map((b) => [b.number, b.timestamp]));
  const firstSeenRows: AddressFirstSeenRow[] = fullBlockSummaries.flatMap((row) =>
    row.activity.firstSeenAddresses.map((addressRow) => ({
      ...addressRow,
      first_seen_ts:
        addressRow.first_seen_ts ||
        headerTsByBlock.get(addressRow.first_seen_block) ||
        0,
    })),
  );

  // --- Tier 1: strict coverage (dense path must cover every block) ---
  if (headers.length !== expected) {
    const got = new Set(headers.map((b) => b.number));
    const missing: number[] = [];
    for (let n = from; n <= to; n++) if (!got.has(n)) missing.push(n);
    throw new Error(
      `strict: expected ${expected} headers in #${from}..#${to}, got ${headers.length}. ` +
        `Missing ${missing.length}: [${missing.slice(0, 8).join(",")}${missing.length > 8 ? ",…" : ""}]`,
    );
  }
  for (const b of headers) {
    if (!analyticsMap.has(b.number)) {
      throw new Error(`strict: missing analytics for block ${b.number}`);
    }
    if (!burnMap.has(b.number)) {
      throw new Error(`strict: missing burn balance for block ${b.number}`);
    }
  }
  if (coinbaseRewardRows.length !== expected) {
    const got = new Set(coinbaseRewardRows.map((r) => r.block_number));
    const missing: number[] = [];
    for (let n = from; n <= to; n++) if (!got.has(n)) missing.push(n);
    throw new Error(
      `strict: expected ${expected} coinbase reward rows in #${from}..#${to}, got ${coinbaseRewardRows.length}. ` +
        `Missing ${missing.length}: [${missing.slice(0, 8).join(",")}${missing.length > 8 ? ",…" : ""}]`,
    );
  }
  if (blockActivityRows.length !== expected) {
    const got = new Set(blockActivityRows.map((r) => r.block_number));
    const missing: number[] = [];
    for (let n = from; n <= to; n++) if (!got.has(n)) missing.push(n);
    throw new Error(
      `strict: expected ${expected} network activity rows in #${from}..#${to}, got ${blockActivityRows.length}. ` +
        `Missing ${missing.length}: [${missing.slice(0, 8).join(",")}${missing.length > 8 ? ",…" : ""}]`,
    );
  }

  // --- Tier 3: continuity ---
  await assertContinuity(from, headers[0], opts.cursorBefore);

  // Overlay sampled workshare counts onto dense header rows. Non-sampled
  // header rows keep their null ws_*_count values so consumers can
  // distinguish "not sampled" from "sampled, zero workshares."
  const sampleByNum = new Map(sampledBlocks.map((b) => [b.number, b]));
  const mergedBlocks: NormalizedBlock[] = headers.map((h) => {
    const s = sampleByNum.get(h.number);
    if (!s) return h;
    return {
      ...h,
      workshareCount: s.workshareCount,
      wsKawpowCount: s.wsKawpowCount,
      wsProgpowCount: s.wsProgpowCount,
      wsShaCount: s.wsShaCount,
      wsScryptCount: s.wsScryptCount,
    };
  });

  // Mining-info lookup: only for sampled blocks that are post-SOAP. The RPC
  // returns -32000 per-row for pre-SOAP; filter server-side to avoid the noise.
  const miningInfoTargets = sampledBlocks
    .filter((b) => {
      const ptn = b.primeTerminusNumber;
      return ptn !== null && BigInt(ptn) >= KAWPOW_FORK_BLOCK;
    })
    .map((b) => b.number);
  const miningInfoMap = await walkMiningInfo(miningInfoTargets);

  const blockRows = blocksToRows(mergedBlocks, opts.safeHead);
  const analyticsRows: AnalyticsRow[] = mergedBlocks.map((b) => {
    const a = analyticsMap.get(b.number)!;
    const burn = burnMap.get(b.number)!;
    return {
      block_number: b.number,
      quai_added: a.quaiSupplyAdded,
      quai_removed: a.quaiSupplyRemoved,
      quai_total: a.quaiSupplyTotal,
      qi_added: a.qiSupplyAdded,
      qi_removed: a.qiSupplyRemoved,
      qi_total: a.qiSupplyTotal,
      soap_burn_balance: burn,
      ts: b.timestamp,
    };
  });

  const miningInfoRows: MiningInfoRow[] = [];
  for (const [blockNumber, mi] of miningInfoMap) {
    miningInfoRows.push({
      block_number: blockNumber,
      blocks_analyzed: mi.blocksAnalyzed,
      avg_block_time_s: mi.avgBlockTime,
      kawpow_difficulty: mi.kawpowDifficulty,
      sha_difficulty: mi.shaDifficulty,
      scrypt_difficulty: mi.scryptDifficulty,
      kawpow_hashrate: mi.kawpowHashRate,
      sha_hashrate: mi.shaHashRate,
      scrypt_hashrate: mi.scryptHashRate,
      avg_kawpow_share_s: mi.avgKawpowShareTime,
      avg_sha_share_s: mi.avgShaShareTime,
      avg_scrypt_share_s: mi.avgScryptShareTime,
      avg_tx_fees: mi.avgTxFees,
      estimated_block_reward: mi.estimatedBlockReward,
      workshare_reward: mi.workshareReward,
    });
  }

  // Order: blocks first (FK target), then dependent tables.
  const dbWriteStart = Date.now();
  await upsertBlocks(blockRows);
  await Promise.all([
    upsertAnalytics(analyticsRows),
    upsertMiningInfo(miningInfoRows),
    upsertCoinbaseRewards(coinbaseRewardRows),
    upsertNetworkActivity({
      blockActivity: blockActivityRows,
      blockAddresses: blockAddressRows,
      firstSeenAddresses: firstSeenRows,
    }),
  ]);
  const highest = mergedBlocks[mergedBlocks.length - 1].number;
  await setCursor(highest, Math.min(highest, opts.safeHead));
  const dbWriteMs = Date.now() - dbWriteStart;
  return {
    blocks: mergedBlocks.length,
    sampled: sampledBlocks.length,
    miningInfo: miningInfoRows.length,
    coinbaseRewards: coinbaseRewardRows.length,
    activityBlocks: blockActivityRows.length,
    dbWriteMs,
  };
}

async function reorgCheck(lastIngested: number): Promise<void> {
  const from = Math.max(1, lastIngested - REORG_DEPTH + 1);
  const { rows: stored } = await pool.query<{
    block_number: string;
    hash: Buffer;
  }>(
    `SELECT block_number::text, hash FROM blocks
       WHERE block_number >= $1 ORDER BY block_number`,
    [from],
  );
  if (stored.length === 0) return;

  const remote = await walkHeaders(from, lastIngested);
  const remoteByNum = new Map<number, string>();
  for (const b of remote) remoteByNum.set(b.number, toHashHex(b.hash));

  let divergeFrom: number | null = null;
  let divergeOld: Buffer | null = null;
  let divergeNew: Buffer | null = null;
  for (const s of stored) {
    const n = Number(s.block_number);
    const storedHex = s.hash.toString("hex").toLowerCase();
    const remoteHex = remoteByNum.get(n);
    if (remoteHex && remoteHex !== storedHex) {
      divergeFrom = n;
      divergeOld = s.hash;
      divergeNew = Buffer.from(remoteHex, "hex");
      break;
    }
  }

  if (divergeFrom !== null) {
    console.warn(
      `[ingest] tail reorg at #${divergeFrom}; dropping suffix and rewinding cursor`,
    );
    await logReorg({
      mode: "tail",
      divergeFrom,
      cursorBefore: lastIngested,
      oldHash: divergeOld,
      newHash: divergeNew,
    });
    await pool.query(`DELETE FROM address_first_seen WHERE first_seen_block >= $1`, [
      divergeFrom,
    ]);
    await pool.query(`DELETE FROM blocks WHERE block_number >= $1`, [
      divergeFrom,
    ]);
    await pool.query(
      `UPDATE ingest_cursor
         SET last_ingested_block = $1,
             last_finalized_block = LEAST(last_finalized_block, $1)
         WHERE id = 1`,
      [divergeFrom - 1],
    );
  }
}

async function maybeSyncQiMarketData(state: {
  lastMarketSyncAt: number;
}): Promise<void> {
  const now = Date.now();
  if (now - state.lastMarketSyncAt < MARKET_SYNC_MS) return;
  state.lastMarketSyncAt = now;

  try {
    const result = await syncQiMarketData({ quoteLimit: 1000 });
    console.log(
      `[ingest] qi market sync: ${result.qiQuotes} qi_quotes, ${result.marketPrices} market_prices`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[ingest] qi market sync skipped: ${msg}`);
  }
}

async function iterate(state: {
  mode: "backfill" | "tail" | null;
  backfillWroteBlocks: boolean;
  lastMarketSyncAt: number;
  backfillStart: number;
  backfillStartedAt: number;
  startedAt: number;
  blocksWritten: number;
  iterations: number;
  errors: number;
}): Promise<void> {
  state.iterations++;
  const [cursor, head] = await Promise.all([
    getCursor(),
    getLatestBlockNumber(),
  ]);
  const safeHead = head - FINALITY_BUFFER;
  const behind = safeHead - cursor.last_ingested_block;

  if (behind > 0) {
    if (state.mode !== "backfill") {
      state.mode = "backfill";
      state.backfillStart = cursor.last_ingested_block;
      state.backfillStartedAt = Date.now();
      console.log(
        `[ingest] backfill mode: ${behind.toLocaleString()} blocks behind safe head (#${cursor.last_ingested_block} → #${safeHead})`,
      );
    }

    const from = cursor.last_ingested_block + 1;
    const to = Math.min(safeHead, from + BACKFILL_CHUNK - 1);
    const chunkStart = Date.now();
    const {
      blocks: n,
      sampled: s,
      miningInfo: mi,
      coinbaseRewards: cr,
      activityBlocks: act,
      dbWriteMs,
    } = await ingestRange(from, to, {
      safeHead,
      cursorBefore: cursor.last_ingested_block,
      sampleEvery: BACKFILL_SAMPLE_EVERY,
    });
    state.blocksWritten += n;
    state.backfillWroteBlocks ||= n > 0;

    const chunkElapsed = (Date.now() - chunkStart) / 1000;
    const totalDone = cursor.last_ingested_block + n - state.backfillStart;
    const totalElapsed = (Date.now() - state.backfillStartedAt) / 1000;
    const rate = totalDone / Math.max(totalElapsed, 0.001);
    const remaining = safeHead - (cursor.last_ingested_block + n);
    const eta = rate > 0 ? remaining / rate : 0;
    const lifetimeMinutes = Math.max((Date.now() - state.startedAt) / 60_000, 0.001);
    const errorRate = state.errors / Math.max(state.iterations, 1);
    console.log(
      `[ingest] #${from}..#${to}  ${n} blocks  ${s} sampled  ${mi} mining_info  ` +
        `${cr} coinbase_rewards  ${act} activity  ` +
        `${chunkElapsed.toFixed(1)}s  ${(n / Math.max(chunkElapsed, 0.001)).toFixed(0)}/s  ` +
        `db=${dbWriteMs}ms lag=${remaining.toLocaleString()} blocks  ETA ${(eta / 60).toFixed(0)}m  ` +
        `avg=${(state.blocksWritten / lifetimeMinutes).toFixed(0)} blocks/min errors=${state.errors}/${state.iterations} (${(errorRate * 100).toFixed(1)}%)`,
    );
  } else {
    if (state.mode !== "tail") {
      state.mode = "tail";
      console.log(
        `[ingest] caught up to head #${head} (safe #${safeHead}); entering tail mode`,
      );
      if (state.backfillWroteBlocks) {
        console.log(`[ingest] running full rollup rebuild post-backfill…`);
        const t0 = Date.now();
        const r = await runRollups();
        const dt = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(
          `[ingest] rollup complete in ${dt}s  ${JSON.stringify(r)}`,
        );
        state.backfillWroteBlocks = false;
        await maybeSyncQiMarketData(state);
      }
      // Flip backfill_done once caught up. Idempotent — safe if already true.
      if (!cursor.backfill_done) {
        await pool.query(
          `UPDATE ingest_cursor SET backfill_done = true WHERE id = 1`,
        );
      }
      await maybeSyncQiMarketData(state);
    }

    if (head > cursor.last_ingested_block) {
      await reorgCheck(cursor.last_ingested_block);
      const prevCursor = (await getCursor()).last_ingested_block;
      const from = prevCursor + 1;
      const to = head;
      const tailStart = Date.now();
      const {
        blocks: n,
        miningInfo: mi,
        coinbaseRewards: cr,
        activityBlocks: act,
        dbWriteMs,
      } = await ingestRange(from, to, {
        safeHead,
        cursorBefore: prevCursor,
        sampleEvery: 1, // tail mode: dense sample every block
      });
      state.blocksWritten += n;
      if (n > 0) {
        await runRollups(prevCursor + 1);
        await maybeSyncQiMarketData(state);
        const elapsed = (Date.now() - tailStart) / 1000;
        const lag = Math.max(0, head - (prevCursor + n));
        const lifetimeMinutes = Math.max((Date.now() - state.startedAt) / 60_000, 0.001);
        const errorRate = state.errors / Math.max(state.iterations, 1);
        console.log(
          `[ingest] tail: #${from}..#${to} (${n} blocks, ${mi} mining_info, ${cr} coinbase_rewards, ${act} activity), ` +
            `elapsed=${elapsed.toFixed(1)}s db=${dbWriteMs}ms lag=${lag} blocks ` +
            `avg=${(state.blocksWritten / lifetimeMinutes).toFixed(0)} blocks/min ` +
            `errors=${state.errors}/${state.iterations} (${(errorRate * 100).toFixed(1)}%), rollups updated`,
        );
      }
    }

    await sleep(TAIL_POLL_MS);
  }
}

async function main(): Promise<void> {
  console.log(
    `[ingest] rpc=${ZONE_RPC}  finality_buffer=${FINALITY_BUFFER}  reorg_depth=${REORG_DEPTH}`,
  );

  const state = {
    mode: null as "backfill" | "tail" | null,
    backfillWroteBlocks: false,
    lastMarketSyncAt: 0,
    backfillStart: 0,
    backfillStartedAt: 0,
    startedAt: Date.now(),
    blocksWritten: 0,
    iterations: 0,
    errors: 0,
  };

  while (!shuttingDown) {
    try {
      await iterate(state);
    } catch (err) {
      state.errors++;
      const msg = err instanceof Error ? err.message : String(err);
      const errorRate = state.errors / Math.max(state.iterations, 1);
      console.error(
        `[ingest] iteration error: ${msg}  errors=${state.errors}/${state.iterations} (${(errorRate * 100).toFixed(1)}%)`,
      );
      // Reset mode so transition-logging re-triggers after recovery
      state.mode = null;
      if (!shuttingDown) await sleep(ERROR_BACKOFF_MS);
    }
  }

  console.log(`[ingest] shutting down cleanly`);
}

main()
  .then(() => close())
  .catch(async (err) => {
    console.error("[ingest] fatal:", err);
    await close().catch(() => {});
    process.exit(1);
  });
