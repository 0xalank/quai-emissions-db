#!/usr/bin/env tsx
// Fill exact historical CoinbaseType outbound-ETX reward summaries.
//
// The SOAP mining chart must not infer mined QUAI from sampled workshare counts.
// go-quai emits actual CoinbaseType outbound ETXs on each block; those ETXs
// carry token ledger, raw reward value, and lockup byte. This repair script
// indexes those exact outputs for blocks already present in the local DB.

import { walkCoinbaseRewardsByNums } from "../../lib/quai/coinbase-rewards";
import { SOAP_ACTIVATION_DATE } from "../../lib/quai/protocol-constants";
import { close, pool, upsertCoinbaseRewards } from "./db";
import { runRollups } from "./rollup";

type BlockNumberRow = { block_number: string };

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

const chunkSize = intFlag("chunk", 1000);
const limit = intFlag("limit", Number.MAX_SAFE_INTEGER);
const fromDate = flag("from-date") ?? SOAP_ACTIVATION_DATE;
const toDate = flag("to-date");
const fromBlock = flag("from-block");
const toBlock = flag("to-block");
const overwrite = process.argv.includes("--all");
const rebuildRollups = process.argv.includes("--rollup");

async function selectBatch(remaining: number): Promise<number[]> {
  const clauses: string[] = [];
  const values: unknown[] = [];

  values.push(fromDate);
  clauses.push(`b.ts >= $${values.length}::date`);

  if (toDate) {
    values.push(toDate);
    clauses.push(`b.ts < ($${values.length}::date + INTERVAL '1 day')`);
  }
  if (fromBlock) {
    values.push(fromBlock);
    clauses.push(`b.block_number >= $${values.length}::bigint`);
  }
  if (toBlock) {
    values.push(toBlock);
    clauses.push(`b.block_number <= $${values.length}::bigint`);
  }
  if (!overwrite) {
    clauses.push(`cr.block_number IS NULL`);
  }

  values.push(Math.min(chunkSize, remaining));
  const limitParam = values.length;

  const { rows } = await pool.query<BlockNumberRow>(
    `SELECT b.block_number::text
       FROM blocks b
       LEFT JOIN coinbase_rewards cr ON cr.block_number = b.block_number
      WHERE ${clauses.join(" AND ")}
      ORDER BY b.block_number ASC
      LIMIT $${limitParam}`,
    values,
  );

  return rows.map((r) => Number(r.block_number));
}

async function main() {
  console.log(
    `[coinbase-rewards] from-date=${fromDate} to-date=${toDate ?? "latest"} ` +
      `chunk=${chunkSize} limit=${limit === Number.MAX_SAFE_INTEGER ? "all" : limit} overwrite=${overwrite}`,
  );

  let done = 0;
  const started = Date.now();
  while (done < limit) {
    const nums = await selectBatch(limit - done);
    if (nums.length === 0) break;

    const first = nums[0];
    const last = nums[nums.length - 1];
    const t0 = Date.now();
    const rows = await walkCoinbaseRewardsByNums(nums);
    if (rows.length !== nums.length) {
      const got = new Set(rows.map((r) => r.block_number));
      const missing = nums.filter((n) => !got.has(n));
      throw new Error(
        `RPC returned ${rows.length}/${nums.length} reward rows for #${first}..#${last}; missing ${missing.slice(0, 8).join(",")}`,
      );
    }

    await upsertCoinbaseRewards(rows);
    done += rows.length;
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const totalElapsed = (Date.now() - started) / 1000;
    const rate = done / Math.max(totalElapsed, 0.001);
    console.log(
      `[coinbase-rewards] #${first}..#${last}: ${rows.length} blocks in ${elapsed}s; total=${done.toLocaleString()} avg=${rate.toFixed(1)}/s`,
    );
  }

  if (rebuildRollups) {
    console.log("[coinbase-rewards] rebuilding rollups...");
    const res = await runRollups();
    console.log(`[coinbase-rewards] rollups rebuilt: ${JSON.stringify(res)}`);
  }

  console.log(`[coinbase-rewards] done. indexed ${done.toLocaleString()} blocks`);
}

main()
  .then(() => close())
  .catch(async (err) => {
    console.error("[coinbase-rewards] fatal:", err);
    await close().catch(() => {});
    process.exit(1);
  });
