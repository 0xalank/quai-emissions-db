import type {
  MiningPoolStatsFeedConfig,
  MiningPoolStatsParentBlock,
} from "@/lib/quai/miningpoolstats";

const SOAP_BLOCKS_API = "https://soap.qu.ai/api/blocks";
const HASH_RE = /^(?:0x)?[0-9a-fA-F]{64}$/;

type SoapBlockRecord = {
  blockHash?: unknown;
  blockHeight?: unknown;
  blockTime?: unknown;
  reward?: unknown;
  coinbaseTxid?: unknown;
  chain?: unknown;
  priceUsd?: unknown;
};

type SoapBlocksResponse = {
  blocks?: unknown;
  totalCount?: unknown;
  hasMore?: unknown;
};

export type SoapParentBlockPage = {
  blocks: MiningPoolStatsParentBlock[];
  totalCount: number;
  hasMore: boolean;
};

function finiteNumber(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`SOAP blocks response has invalid ${field}`);
  }
  return parsed;
}

function optionalFiniteNumber(value: unknown, field: string): number | null {
  if (value == null) return null;
  return finiteNumber(value, field);
}

function normalizedHash(value: unknown, field: string): string {
  if (typeof value !== "string" || !HASH_RE.test(value)) {
    throw new Error(`SOAP blocks response has invalid ${field}`);
  }
  return (value.startsWith("0x") ? value.slice(2) : value).toLowerCase();
}

function normalizeBlock(
  config: MiningPoolStatsFeedConfig,
  block: SoapBlockRecord,
): MiningPoolStatsParentBlock {
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
    hash: normalizedHash(block.blockHash, "blockHash"),
    time: finiteNumber(block.blockTime, "blockTime"),
    reward: finiteNumber(block.reward, "reward"),
    coinbaseTxid: normalizedHash(block.coinbaseTxid, "coinbaseTxid"),
    priceUsd: optionalFiniteNumber(block.priceUsd, "priceUsd"),
  };
}

export async function fetchSoapParentBlockPage(
  config: MiningPoolStatsFeedConfig,
  args: { limit: number; offset: number },
): Promise<SoapParentBlockPage> {
  const url = new URL(SOAP_BLOCKS_API);
  url.searchParams.set("limit", String(args.limit));
  url.searchParams.set("offset", String(args.offset));
  url.searchParams.set("chain", config.soapChain);

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`SOAP blocks ${config.target} ${response.status}`);
  }

  const payload = (await response.json()) as SoapBlocksResponse;
  if (!Array.isArray(payload.blocks)) {
    throw new Error(`SOAP blocks ${config.target} returned invalid blocks`);
  }
  const totalCount = finiteNumber(payload.totalCount, "totalCount");
  return {
    blocks: payload.blocks.map((block) =>
      normalizeBlock(config, block as SoapBlockRecord),
    ),
    totalCount,
    hasMore:
      typeof payload.hasMore === "boolean"
        ? payload.hasMore
        : args.offset + payload.blocks.length < totalCount,
  };
}
