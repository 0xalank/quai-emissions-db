import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMiningPoolStatsPayload,
  buildMiningPoolStatsPoolPayload,
  miningPoolStatsFeedForTarget,
  type MiningPoolStatsParentBlock,
  type MiningPoolStatsTargetKey,
} from "@/lib/quai/miningpoolstats";
import type { MiningInfo } from "@/lib/quai/types";

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
    totalFound: height * 2,
  };
}

const parentBlocks: Record<
  MiningPoolStatsTargetKey,
  MiningPoolStatsParentBlock
> = {
  bch: parentBlock("bch", 100),
  ltc: parentBlock("ltc", 200),
  doge: parentBlock("doge", 300),
  rvn: parentBlock("rvn", 400),
};

test("builds four parent-network feeds with separate LTC and DOGE blocks", () => {
  const payload = buildMiningPoolStatsPayload({
    info,
    parentBlocks,
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
  assert.equal(ltc.lastFound.height, 200);
  assert.equal(doge.lastFound.height, 300);
  assert.equal(ltc.apiPath, "/api/miningpoolstats/ltc");
  assert.equal(doge.apiPath, "/api/miningpoolstats/doge");
});

test("pool payload uses parent blocks and does not claim machine estimates are miners", () => {
  const config = miningPoolStatsFeedForTarget("bch");
  assert.ok(config);
  const payload = buildMiningPoolStatsPoolPayload({
    info,
    config,
    parentBlock: parentBlocks.bch,
  });

  assert.equal(payload.symbol, "BCH");
  assert.equal(payload.url, "https://qu.ai");
  assert.equal(payload.hashrate, 400_000_000_000_000_000);
  assert.equal(payload.hashrate_hps, "400000000000000000");
  assert.equal(payload.lastblock, 100);
  assert.equal(payload.lastblockhash, "bch-block-hash");
  assert.equal(payload.lastblocktime, 1_700_000_100);
  assert.equal(payload.miners, -1);
  assert.equal(payload.workers, -1);
  assert.equal(payload.machine_equivalent.count, 2_000);
  assert.equal("height" in payload, false);
  assert.equal("fee" in payload, false);
  assert.equal("minpay" in payload, false);
  assert.equal("country" in payload, false);
});

test("rejects the old ambiguous algorithm routes", () => {
  assert.equal(miningPoolStatsFeedForTarget("scrypt"), null);
  assert.equal(miningPoolStatsFeedForTarget("sha"), null);
  assert.equal(miningPoolStatsFeedForTarget("kawpow"), null);
});
