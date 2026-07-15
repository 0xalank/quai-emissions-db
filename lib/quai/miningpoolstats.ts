import type { MiningInfo } from "@/lib/quai/types";

export type MiningPoolStatsAlgoKey = "sha" | "scrypt" | "kawpow";
export type MiningPoolStatsTargetKey = "bch" | "ltc" | "doge" | "rvn";
export type SoapChainKey = "bcash" | "litecoin" | "dogecoin" | "ravencoin";

export type MiningPoolStatsFeedConfig = {
  target: MiningPoolStatsTargetKey;
  targetName: string;
  targetSymbol: "BCH" | "LTC" | "DOGE" | "RVN";
  page: string;
  url: string;
  apiPath: string;
  poolId: "quai-sha" | "quai-scrypt" | "quai-kawpow";
  algoKey: MiningPoolStatsAlgoKey;
  algo: string;
  soapChain: SoapChainKey;
  machineUnit: string;
  machineHashrateHps: number;
};

export type MiningPoolStatsParentBlock = {
  chain: SoapChainKey;
  height: number;
  hash: string;
  time: number;
  reward: number;
  coinbaseTxid: string;
  priceUsd: number | null;
};

export type MiningPoolStatsParentBlockIndex = {
  chain: SoapChainKey;
  totalFound: number;
  sourceTotal: number;
  lastSyncedAt: string;
  blocks: MiningPoolStatsParentBlock[];
};

export type MiningPoolStatsFeed = MiningPoolStatsFeedConfig & {
  name: "Quai Network";
  hashrate: number;
  hashrateExact: string;
  hashrateEstimated: true;
  hashrateWindowSeconds: 900;
  unit: "H/s";
  miners: null;
  workers: null;
  machineEquivalent: {
    unit: string;
    baselineHps: number;
    count: number;
  };
  totalFound: number;
  sourceTotal: number;
  lastFound: MiningPoolStatsParentBlock;
  recentBlocks: MiningPoolStatsParentBlock[];
  blocksLastSyncedAt: string;
};

export type MiningPoolStatsPayload = {
  generatedAt: string;
  poolUrl: "https://qu.ai";
  source: {
    hashrate: "quai_getMiningInfo (15-minute estimate)";
    blocks: "local Postgres parent-block index";
  };
  feeds: MiningPoolStatsFeed[];
};

export type MiningPoolStatsPoolRow = {
  url: "https://qu.ai";
  pool_id: "quai-sha" | "quai-scrypt" | "quai-kawpow";
  name: "Quai Network";
  symbol: "BCH" | "LTC" | "DOGE" | "RVN";
  algo: string;
  hashrate: number;
  hashrate_hps: string;
  hashrate_estimated: true;
  hashrate_window_seconds: 900;
  miners: -1;
  workers: -1;
  lastblock: number;
  lastblockhash: string;
  lastblocktime: number;
  blocks_nr: number;
  reward: number;
  coinbase_txid: string;
  unit: "H/s";
  pool_type: "SOAP meta-pool";
  source: {
    hashrate: "quai_getMiningInfo";
    blocks: "supply.qu.ai parent-block index";
  };
  machine_equivalent: {
    unit: string;
    baseline_hps: number;
    count: number;
  };
};

export type MiningPoolStatsPoolBlock = {
  chain: SoapChainKey;
  symbol: "BCH" | "LTC" | "DOGE" | "RVN";
  height: number;
  hash: string;
  time: number;
  reward: number;
  coinbase_txid: string;
  price_usd: number | null;
};

export type MiningPoolStatsPoolPayload = MiningPoolStatsPoolRow & {
  data: MiningPoolStatsPoolRow[];
  blocks: MiningPoolStatsPoolBlock[];
  blocks_indexed: number;
  blocks_source_total: number;
  blocks_last_synced_at: string;
};

export const MINING_POOL_STATS_FEEDS: MiningPoolStatsFeedConfig[] = [
  {
    target: "bch",
    targetName: "Bitcoin Cash",
    targetSymbol: "BCH",
    page: "bitcoincash",
    url: "https://miningpoolstats.stream/bitcoincash",
    apiPath: "/api/miningpoolstats/bch",
    poolId: "quai-sha",
    algoKey: "sha",
    algo: "SHA-256",
    soapChain: "bcash",
    machineUnit: "S21s",
    machineHashrateHps: 200_000_000_000_000,
  },
  {
    target: "ltc",
    targetName: "Litecoin",
    targetSymbol: "LTC",
    page: "litecoin",
    url: "https://miningpoolstats.stream/litecoin",
    apiPath: "/api/miningpoolstats/ltc",
    poolId: "quai-scrypt",
    algoKey: "scrypt",
    algo: "Scrypt",
    soapChain: "litecoin",
    machineUnit: "L9s",
    machineHashrateHps: 16_000_000_000,
  },
  {
    target: "doge",
    targetName: "Dogecoin",
    targetSymbol: "DOGE",
    page: "dogecoin",
    url: "https://miningpoolstats.stream/dogecoin",
    apiPath: "/api/miningpoolstats/doge",
    poolId: "quai-scrypt",
    algoKey: "scrypt",
    algo: "Scrypt",
    soapChain: "dogecoin",
    machineUnit: "L9s",
    machineHashrateHps: 16_000_000_000,
  },
  {
    target: "rvn",
    targetName: "Ravencoin",
    targetSymbol: "RVN",
    page: "ravencoin",
    url: "https://miningpoolstats.stream/ravencoin",
    apiPath: "/api/miningpoolstats/rvn",
    poolId: "quai-kawpow",
    algoKey: "kawpow",
    algo: "KawPow",
    soapChain: "ravencoin",
    machineUnit: "GPUs",
    machineHashrateHps: 60_000_000,
  },
];

export function miningPoolStatsFeedForTarget(
  target: string,
): MiningPoolStatsFeedConfig | null {
  return MINING_POOL_STATS_FEEDS.find((feed) => feed.target === target) ?? null;
}

function machineEquivalent(hashrate: bigint, baselineHps: number): number {
  return Math.max(0, Math.round(Number(hashrate) / baselineHps));
}

function buildFeed(args: {
  info: MiningInfo;
  config: MiningPoolStatsFeedConfig;
  parentBlocks: MiningPoolStatsParentBlockIndex;
}): MiningPoolStatsFeed {
  const hashrate = args.info.perAlgo[args.config.algoKey].hashRate;
  const lastFound = args.parentBlocks.blocks[0];
  if (!lastFound) {
    throw new Error(`No indexed ${args.config.targetSymbol} parent blocks`);
  }
  return {
    ...args.config,
    name: "Quai Network",
    hashrate: Number(hashrate),
    hashrateExact: hashrate.toString(),
    hashrateEstimated: true,
    hashrateWindowSeconds: 900,
    unit: "H/s",
    miners: null,
    workers: null,
    machineEquivalent: {
      unit: args.config.machineUnit,
      baselineHps: args.config.machineHashrateHps,
      count: machineEquivalent(hashrate, args.config.machineHashrateHps),
    },
    totalFound: args.parentBlocks.totalFound,
    sourceTotal: args.parentBlocks.sourceTotal,
    lastFound,
    recentBlocks: args.parentBlocks.blocks,
    blocksLastSyncedAt: args.parentBlocks.lastSyncedAt,
  };
}

export function buildMiningPoolStatsPayload(args: {
  info: MiningInfo;
  parentBlocks: Record<MiningPoolStatsTargetKey, MiningPoolStatsParentBlockIndex>;
  generatedAt?: Date;
}): MiningPoolStatsPayload {
  const generatedAt = args.generatedAt ?? new Date();
  return {
    generatedAt: generatedAt.toISOString(),
    poolUrl: "https://qu.ai",
    source: {
      hashrate: "quai_getMiningInfo (15-minute estimate)",
      blocks: "local Postgres parent-block index",
    },
    feeds: MINING_POOL_STATS_FEEDS.map((config) =>
      buildFeed({
        info: args.info,
        config,
        parentBlocks: args.parentBlocks[config.target],
      }),
    ),
  };
}

export function buildMiningPoolStatsPoolPayload(args: {
  info: MiningInfo;
  config: MiningPoolStatsFeedConfig;
  parentBlocks: MiningPoolStatsParentBlockIndex;
}): MiningPoolStatsPoolPayload {
  const feed = buildFeed(args);
  const row: MiningPoolStatsPoolRow = {
    url: "https://qu.ai",
    pool_id: feed.poolId,
    name: "Quai Network",
    symbol: feed.targetSymbol,
    algo: feed.algo,
    hashrate: feed.hashrate,
    hashrate_hps: feed.hashrateExact,
    hashrate_estimated: true,
    hashrate_window_seconds: feed.hashrateWindowSeconds,
    miners: -1,
    workers: -1,
    lastblock: feed.lastFound.height,
    lastblockhash: feed.lastFound.hash,
    lastblocktime: feed.lastFound.time,
    blocks_nr: feed.totalFound,
    reward: feed.lastFound.reward,
    coinbase_txid: feed.lastFound.coinbaseTxid,
    unit: "H/s",
    pool_type: "SOAP meta-pool",
    source: {
      hashrate: "quai_getMiningInfo",
      blocks: "supply.qu.ai parent-block index",
    },
    machine_equivalent: {
      unit: feed.machineEquivalent.unit,
      baseline_hps: feed.machineEquivalent.baselineHps,
      count: feed.machineEquivalent.count,
    },
  };
  const blocks: MiningPoolStatsPoolBlock[] = feed.recentBlocks.map((block) => ({
    chain: block.chain,
    symbol: feed.targetSymbol,
    height: block.height,
    hash: block.hash,
    time: block.time,
    reward: block.reward,
    coinbase_txid: block.coinbaseTxid,
    price_usd: block.priceUsd,
  }));
  return {
    ...row,
    data: [row],
    blocks,
    blocks_indexed: feed.totalFound,
    blocks_source_total: feed.sourceTotal,
    blocks_last_synced_at: feed.blocksLastSyncedAt,
  };
}
