export type WinnerToken = "QUAI" | "QI";

export type AlgoStats = {
  difficulty: bigint;
  hashRate: bigint;
  avgShareTime: number;
  sharesPerBlock: number;
};

export type MiningInfo = {
  blockNumber: number;
  blockHash: string;
  blocksAnalyzed: number;
  avgBlockTime: number;
  perAlgo: {
    kawpow: AlgoStats;
    sha: AlgoStats;
    scrypt: AlgoStats;
  };
  baseBlockReward: bigint;
  estimatedBlockReward: bigint;
  workshareReward: bigint;
  avgTxFees: bigint;
  quaiSupplyTotal: bigint;
};

export type SupplyInfo = {
  quaiWhole: bigint;
};

export type NormalizedBlock = {
  number: number;
  timestamp: number;
  hash: string;
  parentHash: string;
  exchangeRate: bigint;
  kQuaiDiscount: bigint;
  conversionFlowAmount: bigint;
  primaryCoinbase: string;
  winnerToken: WinnerToken;
  difficulty: bigint;
  minerDifficulty: bigint;
  workshareCount: number;
  // Post-SOAP prime-terminus number (from woHeader.primeTerminusNumber), used
  // to gate reward-math adjustments. null pre-SOAP (field absent).
  primeTerminusNumber: number | null;
  // Per-algo workshare counts from the block's `workshares[]` array, classified
  // by `auxpow.powId` (null → ProgPoW; 0x1 KawPoW; 0x2/0x3 SHA; 0x4 Scrypt).
  // **null for un-sampled blocks** — only populated via full-block fetch, which
  // backfill runs at a sampling cadence (scripts/ingest/run.ts BACKFILL_SAMPLE_EVERY).
  // Tail mode populates every block. NULL ≠ 0: null means "not sampled," 0 means
  // "sampled, no workshares in this block."
  wsKawpowCount: number | null;
  wsProgpowCount: number | null;
  wsShaCount: number | null;
  wsScryptCount: number | null;
  // EMA-smoothed share/uncled rates from woHeader {sha,scrypt}DiffAndCount.
  // Values are in go-quai units (shares-per-block × 2^32). null pre-SOAP
  // (fields absent from the header).
  shaCountEma: bigint | null;
  shaUncledEma: bigint | null;
  scryptCountEma: bigint | null;
  scryptUncledEma: bigint | null;
  // Client-side computed CalculateQuaiReward (QUAI wei). Populated for every
  // block; pre-SOAP uses the simpler formula (no KawPow-equivalent adjustment).
  baseBlockReward: bigint;
};

/** Per-block snapshot from quai_getMiningInfo(block, false). Post-SOAP only. */
export type BlockMiningInfo = {
  blockNumber: number;
  blocksAnalyzed: number;
  avgBlockTime: number;
  kawpowDifficulty: bigint;
  shaDifficulty: bigint;
  scryptDifficulty: bigint;
  kawpowHashRate: bigint;
  shaHashRate: bigint;
  scryptHashRate: bigint;
  avgKawpowShareTime: number;
  avgShaShareTime: number;
  avgScryptShareTime: number;
  avgTxFees: bigint;
  estimatedBlockReward: bigint;
  workshareReward: bigint;
};

export type SupplyAnalytics = {
  quaiSupplyAdded: bigint;
  quaiSupplyRemoved: bigint;
  quaiSupplyTotal: bigint;
  qiSupplyAdded: bigint;
  qiSupplyRemoved: bigint;
  qiSupplyTotal: bigint;
  // Latest snapshot of balanceOf(0x0050AF…), attached by /api/stats from the
  // store. Absent when DB is unreachable. Sole authoritative burn signal.
  soapBurnBalance?: bigint;
};

export type Emission = {
  blockNumber: number;
  timestamp: number;
  // hasBlockDetail=false means the block header wasn't fetched (outside detail window).
  // In that case, exchangeRate/difficulty/winnerToken/workshareCount fields are zero/placeholders.
  hasBlockDetail: boolean;
  winnerToken: WinnerToken;
  exchangeRate: bigint;
  difficulty: bigint;
  workshareCount: number;

  // Estimated emissions from /mininginfo + header (only meaningful when hasBlockDetail)
  nativeEmittedWei: bigint;
  blockRewardWei: bigint;
  workshareRewardWei: bigint;
  quaiEmittedWei: bigint;
  qiEmittedWei: bigint;

  // Authoritative supply data from quai_getSupplyAnalyticsForBlock (always present)
  analytics: SupplyAnalytics;
};

// Rollup-period granularity. Matches SQL tables rollups_{daily|weekly|monthly}.
export type Period = "day" | "week" | "month";

// History-view range preset tags. `custom` = user picked explicit from/to dates.
export type EventPreset = `since-${string}`;

export type RangePreset =
  | "7d"
  | "30d"
  | "90d"
  | "ytd"
  | "1y"
  | "all"
  | "custom"
  | EventPreset;

// D/W/M rollup row — shape matches `GET /api/rollups` response (camelCase).
// Backed by migrations/0002_rollups.sql + 0004_avg_block_time.sql.
export type Rollup = {
  periodStart: string;        // YYYY-MM-DD (UTC)
  firstBlock: number;
  lastBlock: number;
  blockCount: number;
  partial: boolean;
  quaiAddedSum: bigint;       // wei, gross credit flow (NOT "minted"; NOT pure issuance)
  quaiRemovedSum: bigint;     // wei, gross debit flow (NOT "burn" — see burnDelta)
  qiAddedSum: bigint;         // qits
  qiRemovedSum: bigint;       // qits
  quaiNetEmitted: bigint;     // wei, added - removed
  qiNetEmitted: bigint;       // qits
  quaiTotalEnd: bigint;       // wei, end-of-period snapshot (already net of SOAP burn)
  qiTotalEnd: bigint;         // qits
  burnClose: bigint;          // wei, balanceOf(0x0050AF…) at period end — authoritative burn
  burnDelta: bigint;          // wei, burn_close(t) − burn_close(t-1)
  winnerQuaiCount: number;
  winnerQiCount: number;
  workshareTotal: number;
  workshareAvg: number;
  avgBlockTime: number;       // seconds/block
  conversionFlowSum: bigint;
  rateOpen: bigint;
  rateHigh: bigint;
  rateLow: bigint;
  rateClose: bigint;

  // ── SOAP / per-algo columns (migrations/0005) ─────────────────────────
  // All NULL for pre-SOAP periods; sampled (and extrapolated) during backfill,
  // dense in tail. See docs/sampling.md before charting any of these.
  // Use nz() below to coerce NULL → 0n / 0 in chart consumers.
  wsKawpowSum: bigint | null;       // workshares — extrapolated avg×count
  wsProgpowSum: bigint | null;
  wsShaSum: bigint | null;
  wsScryptSum: bigint | null;
  shaCountEmaSum: bigint | null;    // dense exact (EMA numerator/denominator)
  shaUncledEmaSum: bigint | null;
  scryptCountEmaSum: bigint | null;
  scryptUncledEmaSum: bigint | null;
  baseBlockRewardAvg: bigint | null;
  baseBlockRewardSum: bigint | null;
  workshareRewardAvg: bigint | null;
  avgTxFeesAvg: bigint | null;
  kawpowHashrateAvg: bigint | null; // sampled mining_info → unbiased average
  shaHashrateAvg: bigint | null;
  scryptHashrateAvg: bigint | null;
  kawpowDifficultyAvg: bigint | null;
  shaDifficultyAvg: bigint | null;
  scryptDifficultyAvg: bigint | null;
  // Exact reward-output index (migrations/0009). Sums come from actual
  // CoinbaseType outbound ETXs, not reward-parameter estimates.
  coinbaseQuaiBaseRewardSum: bigint;     // raw QUAI wei before lockup multiplier
  coinbaseQuaiLockedRewardSum: bigint;   // lockup-adjusted QUAI wei
  coinbaseQiRewardSum: bigint;           // qits
  coinbaseRewardIndexedCount: number;    // blocks in period with exact reward row
  miningBlockCount: number | null;  // post-SOAP blocks with mining_info row
};

/** NULL-coalesce helper for the nullable SOAP columns. Pre-SOAP rollup rows
 *  have NULL for every per-algo column; chart consumers should use nz() to
 *  treat them as zero. Intentionally typed to bigint so callers don't lose
 *  bigint-ness on the happy path. */
export function nz(v: bigint | null | undefined): bigint {
  return v ?? 0n;
}

/** Same idea, but for number columns. */
export function nzn(v: number | null | undefined): number {
  return v ?? 0;
}

/** Row shape returned by /api/supply. Optional fields appear only when the
 *  matching `include=` flag is set. */
export type SupplyRow = {
  periodStart: string;
  firstBlock: number;
  lastBlock: number;
  blockCount: number;
  partial: boolean;
  quaiTotalEnd: bigint;
  realizedCirculatingQuai: bigint;
  qiTotalEnd?: bigint;
  burnClose?: bigint;
  burnDelta?: bigint;
  genesisBaselineQuai?: bigint;
  cumulativeMinedQuai?: bigint;
};

export type GrainMeta = {
  rows: number;
  earliestPeriod: string | null;
  latestPeriod: string | null;
};

export type RollupsMeta = {
  earliestRollup: string | null;
  latestRollup: string | null;
  grains: { day: GrainMeta; week: GrainMeta; month: GrainMeta };
};

// JSON-over-the-wire representation. bigints are serialized as decimal strings.
export type Serialized<T> = {
  [K in keyof T]: T[K] extends bigint
    ? string
    : T[K] extends bigint | undefined
      ? string | undefined
      : T[K] extends object
        ? Serialized<T[K]>
        : T[K];
};
