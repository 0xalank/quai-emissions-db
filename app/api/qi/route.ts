import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { apiServerError, parseRangeParams } from "@/lib/api-helpers";
import { proxyToUpstreamApi } from "@/lib/api-proxy";
import { serializeBig } from "@/lib/quai/serialize";
import type { QiMarketRow } from "@/lib/quai/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_ROWS = 3000;

type QiSqlRow = {
  period_start: string;
  first_block: string;
  last_block: string;
  block_count: number;
  partial: boolean;
  qi_total_end: string;
  qi_added_sum: string;
  qi_removed_sum: string;
  qi_net_emitted: string;
  winner_quai_count: number;
  winner_qi_count: number;
  conversion_flow_sum: string;
  rate_open: string;
  rate_high: string;
  rate_low: string;
  rate_close: string;
  qi_quote_block: string | null;
  qi_to_quai_wei_per_qi: string | null;
  price_source: string | null;
  quote_currency: string | null;
  quai_price_open: string | null;
  quai_price_high: string | null;
  quai_price_low: string | null;
  quai_price_close: string | null;
};

function toQiMarketRow(r: QiSqlRow): QiMarketRow {
  return {
    periodStart: r.period_start,
    firstBlock: Number(r.first_block),
    lastBlock: Number(r.last_block),
    blockCount: r.block_count,
    partial: r.partial,
    qiTotalEnd: BigInt(r.qi_total_end),
    qiAddedSum: BigInt(r.qi_added_sum),
    qiRemovedSum: BigInt(r.qi_removed_sum),
    qiNetEmitted: BigInt(r.qi_net_emitted),
    winnerQuaiCount: r.winner_quai_count,
    winnerQiCount: r.winner_qi_count,
    conversionFlowSum: BigInt(r.conversion_flow_sum),
    rateOpen: BigInt(r.rate_open),
    rateHigh: BigInt(r.rate_high),
    rateLow: BigInt(r.rate_low),
    rateClose: BigInt(r.rate_close),
    qiQuoteBlock: r.qi_quote_block == null ? null : Number(r.qi_quote_block),
    qiToQuaiWeiPerQi:
      r.qi_to_quai_wei_per_qi == null
        ? null
        : BigInt(r.qi_to_quai_wei_per_qi),
    priceSource: r.price_source,
    quoteCurrency: r.quote_currency,
    quaiPriceOpen: r.quai_price_open,
    quaiPriceHigh: r.quai_price_high,
    quaiPriceLow: r.quai_price_low,
    quaiPriceClose: r.quai_price_close,
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
    if (period !== "day") {
      return NextResponse.json(
        { error: "Qi market data is currently available at daily granularity" },
        { status: 400 },
      );
    }

    const { rows } = await pool.query<QiSqlRow>(
      `SELECT
         to_char(r.period_start, 'YYYY-MM-DD') AS period_start,
         r.first_block::text, r.last_block::text, r.block_count, r.partial,
         r.qi_total_end::text,
         r.qi_added_sum::text, r.qi_removed_sum::text, r.qi_net_emitted::text,
         r.winner_quai_count, r.winner_qi_count,
         r.conversion_flow_sum::text,
         r.rate_open::text, r.rate_high::text, r.rate_low::text, r.rate_close::text,
         q.block_number::text AS qi_quote_block,
         q.quai_amount_wei::text AS qi_to_quai_wei_per_qi,
         p.source AS price_source,
         p.quote_currency,
         p.open::text AS quai_price_open,
         p.high::text AS quai_price_high,
         p.low::text AS quai_price_low,
         p.close::text AS quai_price_close
       FROM rollups_daily r
       LEFT JOIN qi_daily_quotes q
         ON q.period_start = r.period_start
       LEFT JOIN market_prices_daily p
         ON p.period_start = r.period_start
        AND p.source = 'mexc'
        AND p.symbol = 'QUAI'
        AND p.quote_currency = 'USDT'
       WHERE r.period_start >= $1::date AND r.period_start <= $2::date
       ORDER BY r.period_start ASC
       LIMIT ${MAX_ROWS}`,
      [from, to],
    );

    return NextResponse.json(
      { period, rows: serializeBig(rows.map(toQiMarketRow)) },
      {
        headers: {
          "cache-control": "s-maxage=30, stale-while-revalidate=300",
        },
      },
    );
  } catch (err) {
    return apiServerError("api/qi", err);
  }
}
