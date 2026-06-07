import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { serializeBig } from "@/lib/quai/serialize";
import { apiServerError, parseRangeParams } from "@/lib/api-helpers";
import { proxyToUpstreamApi } from "@/lib/api-proxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const GRAIN_TO_TABLE: Record<"day" | "week" | "month", string> = {
  day: "rollups_daily",
  week: "rollups_weekly",
  month: "rollups_monthly",
};

const MAX_ROWS = 3000;

type RollupSqlRow = {
  period_start: string;
  first_block: string;
  last_block: string;
  block_count: number;
  partial: boolean;
  quai_added_sum: string;
  quai_removed_sum: string;
  qi_added_sum: string;
  qi_removed_sum: string;
  quai_net_emitted: string;
  qi_net_emitted: string;
  quai_total_end: string;
  qi_total_end: string;
  burn_close: string;
  burn_delta: string;
  winner_quai_count: number;
  winner_qi_count: number;
  workshare_total: string;
  workshare_avg: string;
  avg_block_time: string;
  conversion_flow_sum: string;
  rate_open: string;
  rate_high: string;
  rate_low: string;
  rate_close: string;
  // SOAP columns (migrations/0005). NULL for pre-SOAP periods.
  ws_kawpow_sum: string | null;
  ws_progpow_sum: string | null;
  ws_sha_sum: string | null;
  ws_scrypt_sum: string | null;
  sha_count_ema_sum: string | null;
  sha_uncled_ema_sum: string | null;
  scrypt_count_ema_sum: string | null;
  scrypt_uncled_ema_sum: string | null;
  base_block_reward_avg: string | null;
  base_block_reward_sum: string | null;
  workshare_reward_avg: string | null;
  avg_tx_fees_avg: string | null;
  kawpow_hashrate_avg: string | null;
  sha_hashrate_avg: string | null;
  scrypt_hashrate_avg: string | null;
  kawpow_difficulty_avg: string | null;
  sha_difficulty_avg: string | null;
  scrypt_difficulty_avg: string | null;
  coinbase_quai_base_reward_sum: string;
  coinbase_quai_locked_reward_sum: string;
  coinbase_qi_reward_sum: string;
  coinbase_reward_indexed_count: number;
  mining_block_count: number | null;
};

const bn = (s: string | null): bigint | null => (s == null ? null : BigInt(s));

function toRollup(r: RollupSqlRow) {
  return {
    periodStart: r.period_start,
    firstBlock: Number(r.first_block),
    lastBlock: Number(r.last_block),
    blockCount: r.block_count,
    partial: r.partial,
    quaiAddedSum: BigInt(r.quai_added_sum),
    quaiRemovedSum: BigInt(r.quai_removed_sum),
    qiAddedSum: BigInt(r.qi_added_sum),
    qiRemovedSum: BigInt(r.qi_removed_sum),
    quaiNetEmitted: BigInt(r.quai_net_emitted),
    qiNetEmitted: BigInt(r.qi_net_emitted),
    quaiTotalEnd: BigInt(r.quai_total_end),
    qiTotalEnd: BigInt(r.qi_total_end),
    burnClose: BigInt(r.burn_close),
    burnDelta: BigInt(r.burn_delta),
    winnerQuaiCount: r.winner_quai_count,
    winnerQiCount: r.winner_qi_count,
    workshareTotal: Number(r.workshare_total),
    workshareAvg: Number(r.workshare_avg),
    avgBlockTime: Number(r.avg_block_time),
    conversionFlowSum: BigInt(r.conversion_flow_sum),
    rateOpen: BigInt(r.rate_open),
    rateHigh: BigInt(r.rate_high),
    rateLow: BigInt(r.rate_low),
    rateClose: BigInt(r.rate_close),
    wsKawpowSum: r.ws_kawpow_sum == null ? null : BigInt(r.ws_kawpow_sum),
    wsProgpowSum: r.ws_progpow_sum == null ? null : BigInt(r.ws_progpow_sum),
    wsShaSum: r.ws_sha_sum == null ? null : BigInt(r.ws_sha_sum),
    wsScryptSum: r.ws_scrypt_sum == null ? null : BigInt(r.ws_scrypt_sum),
    shaCountEmaSum: bn(r.sha_count_ema_sum),
    shaUncledEmaSum: bn(r.sha_uncled_ema_sum),
    scryptCountEmaSum: bn(r.scrypt_count_ema_sum),
    scryptUncledEmaSum: bn(r.scrypt_uncled_ema_sum),
    baseBlockRewardAvg: bn(r.base_block_reward_avg),
    baseBlockRewardSum: bn(r.base_block_reward_sum),
    workshareRewardAvg: bn(r.workshare_reward_avg),
    avgTxFeesAvg: bn(r.avg_tx_fees_avg),
    kawpowHashrateAvg: bn(r.kawpow_hashrate_avg),
    shaHashrateAvg: bn(r.sha_hashrate_avg),
    scryptHashrateAvg: bn(r.scrypt_hashrate_avg),
    kawpowDifficultyAvg: bn(r.kawpow_difficulty_avg),
    shaDifficultyAvg: bn(r.sha_difficulty_avg),
    scryptDifficultyAvg: bn(r.scrypt_difficulty_avg),
    coinbaseQuaiBaseRewardSum: BigInt(r.coinbase_quai_base_reward_sum),
    coinbaseQuaiLockedRewardSum: BigInt(r.coinbase_quai_locked_reward_sum),
    coinbaseQiRewardSum: BigInt(r.coinbase_qi_reward_sum),
    coinbaseRewardIndexedCount: r.coinbase_reward_indexed_count,
    miningBlockCount: r.mining_block_count,
  };
}

export async function GET(req: Request) {
  try {
    const proxied = await proxyToUpstreamApi(req);
    if (proxied) return proxied;

    const url = new URL(req.url);
    const parsed = parseRangeParams(url);
    if (parsed instanceof NextResponse) return parsed;
    const { period, from, to } = parsed;
    const table = GRAIN_TO_TABLE[period];

    const { rows } = await pool.query<RollupSqlRow>(
      `SELECT
         to_char(period_start, 'YYYY-MM-DD') AS period_start,
         first_block::text, last_block::text, block_count, partial,
         quai_added_sum::text, quai_removed_sum::text,
         qi_added_sum::text, qi_removed_sum::text,
         quai_net_emitted::text, qi_net_emitted::text,
         quai_total_end::text, qi_total_end::text,
         burn_close::text, burn_delta::text,
         winner_quai_count, winner_qi_count,
         workshare_total::text, workshare_avg::text, avg_block_time::text,
         conversion_flow_sum::text,
         rate_open::text, rate_high::text, rate_low::text, rate_close::text,
         ws_kawpow_sum::text, ws_progpow_sum::text,
         ws_sha_sum::text, ws_scrypt_sum::text,
         sha_count_ema_sum::text, sha_uncled_ema_sum::text,
         scrypt_count_ema_sum::text, scrypt_uncled_ema_sum::text,
         base_block_reward_avg::text, base_block_reward_sum::text,
         workshare_reward_avg::text, avg_tx_fees_avg::text,
         kawpow_hashrate_avg::text, sha_hashrate_avg::text, scrypt_hashrate_avg::text,
         kawpow_difficulty_avg::text, sha_difficulty_avg::text, scrypt_difficulty_avg::text,
         coinbase_quai_base_reward_sum::text,
         coinbase_quai_locked_reward_sum::text,
         coinbase_qi_reward_sum::text,
         coinbase_reward_indexed_count,
         mining_block_count
       FROM ${table}
       WHERE period_start >= $1::date AND period_start <= $2::date
       ORDER BY period_start ASC
       LIMIT ${MAX_ROWS}`,
      [from, to],
    );

    const data = rows.map(toRollup);
    return NextResponse.json(
      { period, rows: serializeBig(data) },
      {
        headers: {
          // Past periods are immutable; today's partial row updates on each tail tick.
          "cache-control": "s-maxage=30, stale-while-revalidate=300",
        },
      },
    );
  } catch (err) {
    return apiServerError("api/rollups", err);
  }
}
