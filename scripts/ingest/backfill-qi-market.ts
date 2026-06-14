#!/usr/bin/env tsx
// Backfill / repair daily QUAI market prices and Qi→QUAI quote rows.

import { close } from "./db";
import { syncQiMarketData } from "./qi-market";

function flag(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

function intFlag(name: string, fallback: number): number {
  const raw = flag(name);
  if (raw == null) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const fromDate = flag("from-date");
  const toDate = flag("to-date");
  const quoteLimit = intFlag("quote-limit", 1000);

  console.log(
    `[qi-market] from-date=${fromDate ?? "auto"} to-date=${toDate ?? "today"} quote-limit=${quoteLimit}`,
  );
  const result = await syncQiMarketData({ fromDate, toDate, quoteLimit });
  console.log(
    `[qi-market] done. market_prices=${result.marketPrices.toLocaleString()} qi_quotes=${result.qiQuotes.toLocaleString()}`,
  );
}

main()
  .then(() => close())
  .catch(async (err) => {
    console.error("[qi-market] fatal:", err);
    await close().catch(() => {});
    process.exit(1);
  });
