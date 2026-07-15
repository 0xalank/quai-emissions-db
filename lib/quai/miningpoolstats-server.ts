import {
  MINING_POOL_STATS_FEEDS,
  type MiningPoolStatsFeedConfig,
  type MiningPoolStatsParentBlock,
  type MiningPoolStatsTargetKey,
} from "@/lib/quai/miningpoolstats";

const SOAP_BLOCKS_API = "https://soap.qu.ai/api/blocks";

type SoapBlockRecord = {
  blockHash?: unknown;
  blockHeight?: unknown;
  blockTime?: unknown;
  reward?: unknown;
  coinbaseTxid?: unknown;
  chain?: unknown;
};

type SoapBlocksResponse = {
  blocks?: unknown;
  totalCount?: unknown;
};

function finiteNumber(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`SOAP blocks response has invalid ${field}`);
  }
  return parsed;
}

export async function fetchLatestSoapParentBlock(
  config: MiningPoolStatsFeedConfig,
): Promise<MiningPoolStatsParentBlock> {
  const url = new URL(SOAP_BLOCKS_API);
  url.searchParams.set("limit", "1");
  url.searchParams.set("offset", "0");
  url.searchParams.set("chain", config.soapChain);

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: 60 },
  });
  if (!response.ok) {
    throw new Error(`SOAP blocks ${config.target} ${response.status}`);
  }

  const payload = (await response.json()) as SoapBlocksResponse;
  if (!Array.isArray(payload.blocks) || payload.blocks.length === 0) {
    throw new Error(`SOAP blocks ${config.target} returned no blocks`);
  }
  const block = payload.blocks[0] as SoapBlockRecord;
  if (
    block.chain !== config.soapChain ||
    typeof block.blockHash !== "string" ||
    typeof block.coinbaseTxid !== "string"
  ) {
    throw new Error(`SOAP blocks ${config.target} returned an invalid block`);
  }

  return {
    chain: config.soapChain,
    height: finiteNumber(block.blockHeight, "blockHeight"),
    hash: block.blockHash,
    time: finiteNumber(block.blockTime, "blockTime"),
    reward: finiteNumber(block.reward, "reward"),
    coinbaseTxid: block.coinbaseTxid,
    totalFound: finiteNumber(payload.totalCount, "totalCount"),
  };
}

export async function fetchLatestSoapParentBlocks(): Promise<
  Record<MiningPoolStatsTargetKey, MiningPoolStatsParentBlock>
> {
  const entries = await Promise.all(
    MINING_POOL_STATS_FEEDS.map(async (config) =>
      [config.target, await fetchLatestSoapParentBlock(config)] as const,
    ),
  );
  return Object.fromEntries(entries) as Record<
    MiningPoolStatsTargetKey,
    MiningPoolStatsParentBlock
  >;
}
