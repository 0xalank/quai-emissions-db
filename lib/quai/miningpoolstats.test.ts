import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMiningPoolStatsPayload,
  buildMiningPoolStatsPoolPayload,
  miningPoolStatsFeedForTarget,
  type MiningPoolStatsParentBlock,
  type MiningPoolStatsParentBlockIndex,
  type MiningPoolStatsTargetKey,
} from "@/lib/quai/miningpoolstats";
import type { MiningInfo } from "@/lib/quai/types";
import { parseMiningPoolStatsDirectory } from "@/lib/quai/miningpoolstats-directory";

const info: MiningInfo = {
  blockNumber: 9_000_000,
  blockHash: "0xquai",
  blocksAnalyzed: 180,
  avgBlockTime: 5,
  perAlgo: {
    sha: {
      difficulty: 1n,
      hashRate: 400_000_000_000_000_000n,
      avgShareTime: 1,
      sharesPerBlock: 5,
    },
    scrypt: {
      difficulty: 1n,
      hashRate: 32_000_000_000_000n,
      avgShareTime: 1,
      sharesPerBlock: 5,
    },
    kawpow: {
      difficulty: 1n,
      hashRate: 360_000_000_000n,
      avgShareTime: 1,
      sharesPerBlock: 5,
    },
  },
  baseBlockReward: 0n,
  estimatedBlockReward: 0n,
  workshareReward: 0n,
  avgTxFees: 0n,
  quaiSupplyTotal: 0n,
};

function parentBlock(
  target: MiningPoolStatsTargetKey,
  height: number,
): MiningPoolStatsParentBlock {
  const config = miningPoolStatsFeedForTarget(target);
  assert.ok(config);
  return {
    chain: config.soapChain,
    height,
    hash: `${target}-block-hash`,
    time: 1_700_000_000 + height,
    reward: height / 100,
    coinbaseTxid: `${target}-coinbase-txid`,
    priceUsd: height / 10,
  };
}

const parentBlocks: Record<
  MiningPoolStatsTargetKey,
  MiningPoolStatsParentBlockIndex
> = {
  bch: {
    chain: "bcash",
    totalFound: 200,
    sourceTotal: 200,
    lastSyncedAt: "2026-07-14T00:00:00.000Z",
    blocks: [parentBlock("bch", 100), parentBlock("bch", 99)],
  },
  ltc: {
    chain: "litecoin",
    totalFound: 400,
    sourceTotal: 400,
    lastSyncedAt: "2026-07-14T00:00:00.000Z",
    blocks: [parentBlock("ltc", 200), parentBlock("ltc", 199)],
  },
  doge: {
    chain: "dogecoin",
    totalFound: 600,
    sourceTotal: 600,
    lastSyncedAt: "2026-07-14T00:00:00.000Z",
    blocks: [parentBlock("doge", 300), parentBlock("doge", 299)],
  },
  rvn: {
    chain: "ravencoin",
    totalFound: 800,
    sourceTotal: 800,
    lastSyncedAt: "2026-07-14T00:00:00.000Z",
    blocks: [parentBlock("rvn", 400), parentBlock("rvn", 399)],
  },
};

test("builds four parent-network feeds with separate LTC and DOGE blocks", () => {
  const payload = buildMiningPoolStatsPayload({
    info,
    parentBlocks,
    participantCounts: {
      sha: {
        miners: 479,
        workers: -1,
        poolCount: 12,
        sourceUpdatedAt: "2026-07-14T00:00:00.000Z",
      },
      scrypt: {
        miners: 299,
        workers: -1,
        poolCount: 10,
        sourceUpdatedAt: "2026-07-14T00:00:00.000Z",
      },
    },
    generatedAt: new Date("2026-07-14T00:00:00Z"),
  });

  assert.deepEqual(
    payload.feeds.map((feed) => feed.target),
    ["bch", "ltc", "doge", "rvn"],
  );
  const ltc = payload.feeds.find((feed) => feed.target === "ltc");
  const doge = payload.feeds.find((feed) => feed.target === "doge");
  assert.ok(ltc);
  assert.ok(doge);
  assert.equal(ltc.hashrate, doge.hashrate);
  assert.equal(ltc.hashrateExact, "32000000000000");
  assert.equal(ltc.miners, 299);
  assert.equal(ltc.workers, null);
  assert.equal(ltc.lastFound.height, 200);
  assert.equal(doge.lastFound.height, 300);
  assert.equal(ltc.totalFound, 400);
  assert.equal(doge.recentBlocks.length, 2);
  assert.equal(ltc.apiPath, "/api/miningpoolstats/ltc");
  assert.equal(doge.apiPath, "/api/miningpoolstats/doge");
});

test("pool payload uses parent blocks and aggregated directory miners", () => {
  const config = miningPoolStatsFeedForTarget("bch");
  assert.ok(config);
  const payload = buildMiningPoolStatsPoolPayload({
    info,
    config,
    parentBlocks: parentBlocks.bch,
    participantCounts: {
      miners: 479,
      workers: -1,
      poolCount: 12,
      sourceUpdatedAt: "2026-07-14T00:00:00.000Z",
    },
  });

  assert.equal(payload.symbol, "BCH");
  assert.equal(payload.url, "https://qu.ai");
  assert.equal(payload.name, "Quai Network");
  assert.equal(payload.pool_id, "quai-sha");
  assert.equal(payload.hashrate, 400_000_000_000_000_000);
  assert.equal(payload.hashrate_hps, "400000000000000000");
  assert.equal(payload.lastblock, 100);
  assert.equal(payload.lastblockhash, "bch-block-hash");
  assert.equal(payload.lastblocktime, 1_700_000_100);
  assert.equal(payload.blocks_nr, 200);
  assert.equal(payload.blocks.length, 2);
  assert.deepEqual(payload.blocks[0], {
    chain: "bcash",
    symbol: "BCH",
    height: 100,
    hash: "bch-block-hash",
    time: 1_700_000_100,
    reward: 1,
    coinbase_txid: "bch-coinbase-txid",
    price_usd: 10,
  });
  assert.equal(payload.blocks_indexed, 200);
  assert.equal(payload.blocks_source_total, 200);
  assert.equal(payload.blocks_last_synced_at, "2026-07-14T00:00:00.000Z");
  assert.equal(payload.miners, 479);
  assert.equal(payload.workers, -1);
  assert.equal(payload.machine_equivalent.count, 2_000);
  assert.equal("height" in payload, false);
  assert.equal("fee" in payload, false);
  assert.equal("minpay" in payload, false);
  assert.equal("country" in payload, false);
});

test("directory totals use workers only when a pool omits miners and exclude Quai", () => {
  const counts = parseMiningPoolStatsDirectory({
    time: 1_720_000_000,
    poolsminers: 10_000,
    data: [
      { url: "https://pool-a.test", miners: 10, workers: 20 },
      { url: "https://pool-b.test", miners: -1, workers: 3 },
      { url: "https://pool-c.test", miners: 0 },
      {
        url: "https://qu.ai",
        pool_id: "quai-sha",
        miners: 10_000,
        workers: 10_000,
      },
    ],
  });

  assert.deepEqual(counts, {
    miners: 13,
    workers: -1,
    poolCount: 3,
    sourceUpdatedAt: "2024-07-03T09:46:40.000Z",
  });
});

test("directory returns workers only when every listed pool reports them", () => {
  const counts = parseMiningPoolStatsDirectory({
    time: 1_720_000_000,
    data: [
      { url: "https://pool-a.test", miners: 10, workers: 20 },
      { url: "https://pool-b.test", miners: 2, workers: 4 },
    ],
  });

  assert.equal(counts?.miners, 12);
  assert.equal(counts?.workers, 24);
});

test("uses algorithm-level pool ids across parent-network lists", () => {
  assert.equal(miningPoolStatsFeedForTarget("bch")?.poolId, "quai-sha");
  assert.equal(miningPoolStatsFeedForTarget("ltc")?.poolId, "quai-scrypt");
  assert.equal(miningPoolStatsFeedForTarget("doge")?.poolId, "quai-scrypt");
  assert.equal(miningPoolStatsFeedForTarget("rvn")?.poolId, "quai-kawpow");
});

test("rejects the old ambiguous algorithm routes", () => {
  assert.equal(miningPoolStatsFeedForTarget("scrypt"), null);
  assert.equal(miningPoolStatsFeedForTarget("sha"), null);
  assert.equal(miningPoolStatsFeedForTarget("kawpow"), null);
});
