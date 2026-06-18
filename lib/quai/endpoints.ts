import { LIVE_STATS_RPC, ZONE_RPC } from "./constants";
import type { MiningInfo } from "./types";

const hexToBigInt = (h: string | undefined): bigint =>
  h && h.startsWith("0x") ? BigInt(h) : 0n;

const hexToNumber = (h: string | undefined): number =>
  h && h.startsWith("0x") ? Number(BigInt(h)) : 0;

type MiningInfoRaw = {
  result: {
    blockNumber: string;
    blockHash: string;
    blocksAnalyzed: number;
    avgBlockTime: number;
    avgKawpowShareTime: number;
    avgShaShareTime: number;
    avgScryptShareTime: number;
    kawpowDifficulty: string;
    shaDifficulty: string;
    scryptDifficulty: string;
    kawpowHashRate: string | number;
    shaHashRate: string | number;
    scryptHashRate: string | number;
    baseBlockReward: string;
    estimatedBlockReward: string;
    workshareReward: string;
    avgTxFees: string;
    quaiSupplyTotal: string;
  };
};

type MiningInfoParams = [] | [boolean] | [string, boolean];
type MiningInfoPayload = {
  result?: MiningInfoRaw["result"];
  error?: { code?: number; message?: string };
};

const toBigIntHashRate = (v: string | number): bigint => {
  if (typeof v === "number") return BigInt(Math.trunc(v));
  if (v.startsWith("0x")) return BigInt(v);
  return BigInt(v);
};

async function requestMiningInfo(
  rpcUrl: string,
  params: MiningInfoParams,
  signal?: AbortSignal,
): Promise<MiningInfoPayload> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    signal,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "quai_getMiningInfo",
      params,
    }),
  });
  if (!res.ok) throw new Error(`getMiningInfo ${res.status}`);
  return (await res.json()) as MiningInfoPayload;
}

function normalizeMiningInfo(payload: MiningInfoPayload): MiningInfo {
  if (!payload.result) {
    throw new Error(`getMiningInfo: ${payload.error?.message ?? "no result"}`);
  }
  const r = payload.result;

  const mk = (diffHex: string, hash: string | number, shareTime: number) => {
    const diff = hexToBigInt(diffHex);
    const shares = shareTime > 0 ? r.avgBlockTime / shareTime : 0;
    return {
      difficulty: diff,
      hashRate: toBigIntHashRate(hash),
      avgShareTime: shareTime,
      sharesPerBlock: shares,
    };
  };

  return {
    blockNumber: hexToNumber(r.blockNumber),
    blockHash: r.blockHash,
    blocksAnalyzed: r.blocksAnalyzed,
    avgBlockTime: r.avgBlockTime,
    perAlgo: {
      kawpow: mk(r.kawpowDifficulty, r.kawpowHashRate, r.avgKawpowShareTime),
      sha: mk(r.shaDifficulty, r.shaHashRate, r.avgShaShareTime),
      scrypt: mk(r.scryptDifficulty, r.scryptHashRate, r.avgScryptShareTime),
    },
    baseBlockReward: hexToBigInt(r.baseBlockReward),
    estimatedBlockReward: hexToBigInt(r.estimatedBlockReward),
    workshareReward: hexToBigInt(r.workshareReward),
    avgTxFees: hexToBigInt(r.avgTxFees),
    quaiSupplyTotal: hexToBigInt(r.quaiSupplyTotal),
  };
}

/**
 * Live mining/supply snapshot via `quai_getMiningInfo`.
 *
 * Public gateway nodes currently expose the current-tip signature
 * `quai_getMiningInfo(false)`/`quai_getMiningInfo()`. Patched debug nodes also
 * expose the historical signature `quai_getMiningInfo("latest", false)`.
 * Live dashboard KPIs prefer the public endpoint, then fall back to ZONE_RPC.
 */
export async function fetchMiningInfo(
  signal?: AbortSignal,
): Promise<MiningInfo> {
  const candidates = [
    {
      rpcUrl: LIVE_STATS_RPC,
      params: [[false], [], ["latest", false]] satisfies MiningInfoParams[],
    },
    ...(LIVE_STATS_RPC === ZONE_RPC
      ? []
      : [
          {
            rpcUrl: ZONE_RPC,
            params: [["latest", false], [false], []] satisfies MiningInfoParams[],
          },
        ]),
  ];

  const errors: string[] = [];
  for (const candidate of candidates) {
    for (const params of candidate.params) {
      try {
        return normalizeMiningInfo(
          await requestMiningInfo(candidate.rpcUrl, params, signal),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${candidate.rpcUrl} params=${JSON.stringify(params)}: ${message}`);
      }
    }
  }

  throw new Error(`getMiningInfo failed: ${errors.join("; ")}`);
}
