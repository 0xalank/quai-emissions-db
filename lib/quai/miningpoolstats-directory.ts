import type {
  MiningPoolStatsAlgoKey,
  MiningPoolStatsParticipantCounts,
} from "@/lib/quai/miningpoolstats";

type DirectoryPool = {
  url?: unknown;
  pool_id?: unknown;
  miners?: unknown;
  workers?: unknown;
};

type DirectoryPayload = {
  time?: unknown;
  poolsminers?: unknown;
  data?: unknown;
};

export const MINING_POOL_STATS_DIRECTORY_SLUGS: Record<
  MiningPoolStatsAlgoKey,
  string
> = {
  sha: "quai-sha",
  scrypt: "quai-scrypt",
  kawpow: "quai-kawpow",
};
const SELF_POOL_IDS = new Set(["quai-sha", "quai-scrypt", "quai-kawpow"]);

function nonnegativeInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.trunc(value);
}

function isQuaiNetworkPool(pool: DirectoryPool): boolean {
  if (typeof pool.pool_id === "string" && SELF_POOL_IDS.has(pool.pool_id)) {
    return true;
  }
  if (typeof pool.url !== "string") return false;
  try {
    const hostname = new URL(pool.url).hostname.toLowerCase();
    return hostname === "qu.ai" || hostname === "www.qu.ai";
  } catch {
    return false;
  }
}

export function parseMiningPoolStatsDirectory(
  payload: unknown,
): MiningPoolStatsParticipantCounts | null {
  if (!payload || typeof payload !== "object") return null;
  const directory = payload as DirectoryPayload;
  if (!Array.isArray(directory.data)) return null;

  const pools = (directory.data as DirectoryPool[]).filter(
    (pool) => pool && typeof pool === "object" && !isQuaiNetworkPool(pool),
  );
  let miners = 0;
  let reportedMinerPools = 0;
  let workers = 0;
  let allWorkersReported = pools.length > 0;

  for (const pool of pools) {
    const poolMiners = nonnegativeInteger(pool.miners);
    const poolWorkers = nonnegativeInteger(pool.workers);
    const displayedMiners = poolMiners ?? poolWorkers;
    if (displayedMiners !== null) {
      miners += displayedMiners;
      reportedMinerPools++;
    }
    if (poolWorkers === null) {
      allWorkersReported = false;
    } else {
      workers += poolWorkers;
    }
  }

  if (reportedMinerPools === 0) return null;
  const sourceTime = nonnegativeInteger(directory.time);
  if (sourceTime === null) return null;

  return {
    miners,
    workers: allWorkersReported ? workers : -1,
    poolCount: pools.length,
    sourceUpdatedAt: new Date(sourceTime * 1000).toISOString(),
  };
}
