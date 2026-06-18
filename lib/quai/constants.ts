export const ZONE = process.env.NEXT_PUBLIC_QUAI_ZONE ?? "cyprus1";

function normalizePublicRpc(raw: string): string {
  const trimmed = raw.replace(/\/+$/, "");
  try {
    const url = new URL(trimmed);
    // QUAI_PUBLIC_RPC may be provided as either the gateway base URL
    // (`https://rpc.quai.network`) or the zone URL.
    if (
      url.hostname.endsWith("rpc.quai.network") &&
      (url.pathname === "" || url.pathname === "/")
    ) {
      url.pathname = `/${ZONE}`;
      return url.toString().replace(/\/+$/, "");
    }
  } catch {
    // Environment validation reports malformed URLs in normal app startup.
  }
  return trimmed;
}

// Zone JSON-RPC endpoint — single source for all RPC calls (blocks, analytics,
// balances, getMiningInfo). Default points at the public gateway; set
// `QUAI_ZONE_RPC` to override (e.g. debug.rpc.quai.network/cyprus1 for the
// PR-2696 historical `getMiningInfo` signature).
export const ZONE_RPC =
  process.env.QUAI_ZONE_RPC ?? `https://rpc.quai.network/${ZONE}`;

// Public/current-tip JSON-RPC endpoint for live dashboard KPIs. Historical
// ingest continues to use ZONE_RPC because it may need the block-specific
// getMiningInfo signature that only exists on debug/patched nodes.
export const LIVE_STATS_RPC = normalizePublicRpc(
  process.env.QUAI_PUBLIC_RPC ?? `https://rpc.quai.network/${ZONE}`,
);

export const STATS_REFRESH_MS = 30_000;
export const BLOCKS_REFRESH_MS = 60_000;

export const DEFAULT_WINDOW = 2000;
export const MAX_WINDOW = 10_000;
// Block-detail window: we only fetch full block headers for the most recent N entries.
// Older entries rely on analytics alone (supply totals, mint/burn deltas).
// getBlockByNumber RPC starts truncating at high parallelism beyond ~2k blocks.
export const MAX_DETAIL_WINDOW = 2_000;
export const BLOCK_FETCH_CONCURRENCY = 8;

// Observed RPC batch limits on debug.rpc.quai.network (2026-04):
//  - quai_getBlockByNumber full-block batches of 500+ blow the gateway's
//    ~30s upstream timeout → HTTP 502. 250 is the safe ceiling (~19s).
//  - quai_getSupplyAnalyticsForBlock handles 10_000/batch cleanly (~6s).
//  - quai_getBalance handles thousands per batch trivially.
// If/when we move to a node with a longer timeout we can raise BLOCK_BATCH_SIZE.
export const BLOCK_BATCH_SIZE = 250;
export const ANALYTICS_BATCH_SIZE = 10_000;
export const RPC_BATCH_PARALLELISM = 4;

export const WEI_PER_TOKEN = 10n ** 18n;

// Qi uses 3 decimals per quais.formatQi() — 1 Qi = 1000 qits.
export const QITS_PER_QI = 1000n;
