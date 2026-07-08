import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  PowMarketHistory,
  PowMarketQuote,
} from "@/lib/comparisons/pow-dominance";

type CacheEnvelope<T> = {
  cachedAt: string;
  value: T;
};

const CACHE_DIR =
  process.env.POW_MARKET_CACHE_DIR ?? join(process.cwd(), ".cache", "pow-market");

function safeKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

async function readCache<T>(file: string): Promise<CacheEnvelope<T> | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as CacheEnvelope<T>;
  } catch {
    return null;
  }
}

async function writeCache<T>(file: string, value: T): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(
    file,
    JSON.stringify({ cachedAt: new Date().toISOString(), value }),
    "utf8",
  );
}

export async function readPowQuotesCache(): Promise<CacheEnvelope<
  PowMarketQuote[]
> | null> {
  return readCache(join(CACHE_DIR, "quotes.json"));
}

export async function writePowQuotesCache(rows: PowMarketQuote[]): Promise<void> {
  await writeCache(join(CACHE_DIR, "quotes.json"), rows);
}

export async function readPowHistoryCache(args: {
  id: string;
  from: string;
  to: string;
}): Promise<CacheEnvelope<PowMarketHistory> | null> {
  const exact = await readCache<PowMarketHistory>(
    join(
      CACHE_DIR,
      `history_${safeKey(args.id)}_${safeKey(args.from)}_${safeKey(args.to)}.json`,
    ),
  );
  if (exact) return exact;

  const latest = await readCache<PowMarketHistory>(
    join(CACHE_DIR, `history_${safeKey(args.id)}_latest.json`),
  );
  if (!latest) return null;

  return {
    cachedAt: latest.cachedAt,
    value: {
      ...latest.value,
      rows: latest.value.rows.filter(
        (row) => row.date >= args.from && row.date <= args.to,
      ),
    },
  };
}

export async function writePowHistoryCache(
  history: PowMarketHistory,
  args: { from: string; to: string },
): Promise<void> {
  await writeCache(
    join(
      CACHE_DIR,
      `history_${safeKey(history.id)}_${safeKey(args.from)}_${safeKey(args.to)}.json`,
    ),
    history,
  );
  await writeCache(
    join(CACHE_DIR, `history_${safeKey(history.id)}_latest.json`),
    history,
  );
}
