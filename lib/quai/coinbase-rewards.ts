import { isQiAddress } from "quais";
import { ZONE_RPC, RPC_BATCH_PARALLELISM } from "./constants";
import { applyLockupMultiplier } from "./protocol-constants";

const COINBASE_ETX_TYPE = 1;
const FULL_BLOCK_BATCH_SIZE = 100;

type RawOutboundEtx =
  | string
  | {
      blockNumber?: string;
      etxType?: string;
      input?: string;
      to?: string;
      value?: string;
    };

type RawFullBlock = {
  woHeader?: { number?: string };
  outboundEtxs?: RawOutboundEtx[];
};

type BatchResp<T> = { id: number; result?: T; error?: { message: string } };

export type CoinbaseRewardRow = {
  block_number: number;
  quai_base_reward: bigint;
  quai_locked_reward: bigint;
  qi_reward: bigint;
  coinbase_etx_count: number;
  quai_coinbase_etx_count: number;
  qi_coinbase_etx_count: number;
};

const hexToBig = (h?: string): bigint =>
  h && h.startsWith("0x") ? BigInt(h) : 0n;

const hexToNum = (h?: string): number =>
  h && h.startsWith("0x") ? Number(BigInt(h)) : 0;

function safeIsQiAddress(address?: string): boolean {
  if (!address) return false;
  try {
    return isQiAddress(address);
  } catch {
    return false;
  }
}

function lockupByte(input?: string): 0 | 1 | 2 | 3 {
  if (!input || !input.startsWith("0x") || input.length < 4) return 0;
  const b = Number.parseInt(input.slice(2, 4), 16);
  return b === 1 || b === 2 || b === 3 ? b : 0;
}

export function coinbaseRewardsFromBlock(
  fallbackBlockNumber: number,
  block: RawFullBlock,
): CoinbaseRewardRow {
  const blockNumber = hexToNum(block.woHeader?.number) || fallbackBlockNumber;
  let quaiBase = 0n;
  let quaiLocked = 0n;
  let qiReward = 0n;
  let coinbaseCount = 0;
  let quaiCount = 0;
  let qiCount = 0;

  for (const tx of block.outboundEtxs ?? []) {
    if (typeof tx === "string") continue;
    if (hexToNum(tx.etxType) !== COINBASE_ETX_TYPE) continue;

    coinbaseCount++;
    const value = hexToBig(tx.value);
    const to = tx.to ?? "";
    if (safeIsQiAddress(to)) {
      qiReward += value;
      qiCount++;
      continue;
    }

    quaiBase += value;
    quaiLocked += applyLockupMultiplier(
      value,
      lockupByte(tx.input),
      BigInt(blockNumber),
    );
    quaiCount++;
  }

  return {
    block_number: blockNumber,
    quai_base_reward: quaiBase,
    quai_locked_reward: quaiLocked,
    qi_reward: qiReward,
    coinbase_etx_count: coinbaseCount,
    quai_coinbase_etx_count: quaiCount,
    qi_coinbase_etx_count: qiCount,
  };
}

async function batchGetCoinbaseRewards(
  blockNumbers: number[],
  signal?: AbortSignal,
): Promise<Map<number, CoinbaseRewardRow>> {
  if (blockNumbers.length === 0) return new Map();
  const payload = blockNumbers.map((n, i) => ({
    jsonrpc: "2.0",
    id: i,
    method: "quai_getBlockByNumber",
    params: ["0x" + n.toString(16), true],
  }));

  const res = await fetch(ZONE_RPC, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`batch coinbase rewards ${res.status}`);
  const raw = await res.json();
  if (!Array.isArray(raw)) {
    throw new Error(
      `batch coinbase rewards non-array response: ${JSON.stringify(raw).slice(0, 160)}`,
    );
  }

  const out = new Map<number, CoinbaseRewardRow>();
  for (const row of raw as BatchResp<RawFullBlock>[]) {
    if (row && row.result && typeof row.id === "number") {
      const fallback = blockNumbers[row.id];
      out.set(fallback, coinbaseRewardsFromBlock(fallback, row.result));
    }
  }
  return out;
}

export async function walkCoinbaseRewardsByNums(
  blockNumbers: number[],
  signal?: AbortSignal,
): Promise<CoinbaseRewardRow[]> {
  if (blockNumbers.length === 0) return [];
  const chunks: number[][] = [];
  for (let i = 0; i < blockNumbers.length; i += FULL_BLOCK_BATCH_SIZE) {
    chunks.push(blockNumbers.slice(i, i + FULL_BLOCK_BATCH_SIZE));
  }

  const result = new Map<number, CoinbaseRewardRow>();

  async function fetchWithRetry(nums: number[], depth = 0): Promise<void> {
    try {
      const m = await batchGetCoinbaseRewards(nums, signal);
      for (const [k, v] of m) result.set(k, v);
      if (m.size < nums.length && depth < 2) {
        const missing = nums.filter((n) => !m.has(n));
        if (missing.length > 0) {
          const half = Math.max(1, Math.floor(missing.length / 2));
          await Promise.all([
            fetchWithRetry(missing.slice(0, half), depth + 1),
            fetchWithRetry(missing.slice(half), depth + 1),
          ]);
        }
      }
    } catch (e) {
      if (depth < 2 && nums.length > 1) {
        const half = Math.max(1, Math.floor(nums.length / 2));
        await Promise.all([
          fetchWithRetry(nums.slice(0, half), depth + 1),
          fetchWithRetry(nums.slice(half), depth + 1),
        ]);
      } else {
        console.warn(`[coinbase-rewards] final failure for ${nums.length} blocks`, e);
      }
    }
  }

  let idx = 0;
  const worker = async () => {
    while (true) {
      const i = idx++;
      if (i >= chunks.length) break;
      await fetchWithRetry(chunks[i]);
    }
  };
  const workers = Array.from(
    { length: Math.min(RPC_BATCH_PARALLELISM, chunks.length) || 1 },
    () => worker(),
  );
  await Promise.all(workers);

  const out: CoinbaseRewardRow[] = [];
  for (const n of blockNumbers) {
    const row = result.get(n);
    if (row) out.push(row);
  }
  return out;
}
