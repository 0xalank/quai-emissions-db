import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  MINING_POOL_STATS_DIRECTORY_SLUGS,
  parseMiningPoolStatsDirectory,
} from "../../lib/quai/miningpoolstats-directory";
import type { MiningPoolStatsAlgoKey } from "../../lib/quai/miningpoolstats";
import {
  upsertMiningPoolParticipantCounts,
  type MiningPoolParticipantCountRow,
} from "./db";

const execFileAsync = promisify(execFile);
const ALGO_KEYS = Object.keys(
  MINING_POOL_STATS_DIRECTORY_SLUGS,
) as MiningPoolStatsAlgoKey[];

async function fetchParticipantCounts(
  algo: MiningPoolStatsAlgoKey,
): Promise<MiningPoolParticipantCountRow> {
  const slug = MINING_POOL_STATS_DIRECTORY_SLUGS[algo];
  const pageUrl = `https://miningpoolstats.stream/${slug}`;
  const { stdout: page } = await execFileAsync(
    "curl",
    ["-fsS", "--max-time", "10", "-A", "Mozilla/5.0", pageUrl],
    { maxBuffer: 2 * 1024 * 1024 },
  );
  const escapedSlug = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sourceUrl = page.match(
    new RegExp(
      `https://data\\.miningpoolstats\\.stream/data/${escapedSlug}\\.js\\?t=\\d+`,
    ),
  )?.[0];
  if (!sourceUrl) {
    throw new Error(`${slug} page did not publish a directory feed URL`);
  }
  const { stdout } = await execFileAsync(
    "curl",
    [
      "-fsS",
      "--max-time",
      "10",
      "-A",
      "Mozilla/5.0",
      "-H",
      "Origin: https://miningpoolstats.stream",
      "-H",
      `Referer: https://miningpoolstats.stream/${slug}`,
      sourceUrl,
    ],
    { maxBuffer: 2 * 1024 * 1024 },
  );
  const counts = parseMiningPoolStatsDirectory(JSON.parse(stdout));
  if (!counts) {
    throw new Error(`${slug} returned invalid participant counts`);
  }
  return { algo, ...counts };
}

export async function syncMiningPoolStatsParticipantCounts(): Promise<
  MiningPoolParticipantCountRow[]
> {
  const results = await Promise.allSettled(
    ALGO_KEYS.map(fetchParticipantCounts),
  );
  const rows: MiningPoolParticipantCountRow[] = [];
  const failures: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      rows.push(result.value);
    } else {
      const message =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      failures.push(`${ALGO_KEYS[i]}: ${message}`);
    }
  }

  await upsertMiningPoolParticipantCounts(rows);
  if (rows.length === 0) {
    throw new Error(failures.join("; "));
  }
  if (failures.length > 0) {
    console.warn(`[ingest] MiningPoolStats partial sync: ${failures.join("; ")}`);
  }
  return rows;
}
