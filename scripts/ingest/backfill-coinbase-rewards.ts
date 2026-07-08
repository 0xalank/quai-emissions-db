#!/usr/bin/env tsx
// Fill exact historical full-block summaries: CoinbaseType outbound-ETX reward
// summaries plus network activity rows.
//
// The SOAP mining chart must not infer mined QUAI from sampled workshare counts.
// go-quai emits actual CoinbaseType outbound ETXs on each block; those ETXs
// carry token ledger, raw reward value, and lockup byte. This repair script
// indexes those exact outputs for blocks already present in the local DB. The
// same full-block RPC response also carries normal transactions and ETXs, so
// this script backfills daily tx/address primitives for the Network page.

import { walkFullBlockSummariesByNums } from "../../lib/quai/coinbase-rewards";
import { SOAP_ACTIVATION_DATE } from "../../lib/quai/protocol-constants";
import {
  close,
  pool,
  upsertCoinbaseRewards,
  upsertNetworkActivity,
  type AddressFirstSeenRow,
  type BlockActiveAddressRow,
  type BlockActivityRow,
  type CoinbaseRewardRow,
} from "./db";
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
const newestFirst = process.argv.includes("--newest-first");

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
    clauses.push(`(cr.block_number IS NULL OR ba.block_number IS NULL)`);
  }

  values.push(Math.min(chunkSize, remaining));
  const limitParam = values.length;

  const { rows } = await pool.query<BlockNumberRow>(
    `SELECT b.block_number::text
       FROM blocks b
       LEFT JOIN coinbase_rewards cr ON cr.block_number = b.block_number
       LEFT JOIN block_activity ba ON ba.block_number = b.block_number
      WHERE ${clauses.join(" AND ")}
      ORDER BY b.block_number ${newestFirst ? "DESC" : "ASC"}
      LIMIT $${limitParam}`,
    values,
  );

  return rows.map((r) => Number(r.block_number));
}

async function main() {
  console.log(
    `[full-block-index] from-date=${fromDate} to-date=${toDate ?? "latest"} ` +
      `chunk=${chunkSize} limit=${limit === Number.MAX_SAFE_INTEGER ? "all" : limit} ` +
      `overwrite=${overwrite} newestFirst=${newestFirst}`,
  );

  let done = 0;
  const started = Date.now();
  while (done < limit) {
    const nums = await selectBatch(limit - done);
    if (nums.length === 0) break;

    const first = nums[0];
    const last = nums[nums.length - 1];
    const t0 = Date.now();
    const summaries = await walkFullBlockSummariesByNums(nums);
    if (summaries.length !== nums.length) {
      const got = new Set(summaries.map((r) => r.coinbaseReward.block_number));
      const missing = nums.filter((n) => !got.has(n));
      throw new Error(
        `RPC returned ${summaries.length}/${nums.length} full-block summaries for #${first}..#${last}; missing ${missing.slice(0, 8).join(",")}`,
      );
    }

    const rewardRows: CoinbaseRewardRow[] = summaries.map(
      (row) => row.coinbaseReward,
    );
    const blockActivityRows: BlockActivityRow[] = summaries.map(
      (row) => row.activity.blockActivity,
    );
    const blockAddressRows: BlockActiveAddressRow[] = summaries.flatMap(
      (row) => row.activity.blockAddresses,
    );
    const firstSeenRows: AddressFirstSeenRow[] = summaries.flatMap(
      (row) => row.activity.firstSeenAddresses,
    );

    await upsertCoinbaseRewards(rewardRows);
    await upsertNetworkActivity({
      blockActivity: blockActivityRows,
      blockAddresses: blockAddressRows,
      firstSeenAddresses: firstSeenRows,
    });
    done += summaries.length;
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const totalElapsed = (Date.now() - started) / 1000;
    const rate = done / Math.max(totalElapsed, 0.001);
    console.log(
      `[full-block-index] #${first}..#${last}: ${summaries.length} blocks in ${elapsed}s; total=${done.toLocaleString()} avg=${rate.toFixed(1)}/s`,
    );
  }

  if (rebuildRollups) {
    console.log("[full-block-index] rebuilding rollups...");
    const res = await runRollups();
    console.log(`[full-block-index] rollups rebuilt: ${JSON.stringify(res)}`);
  }

  console.log(`[full-block-index] done. indexed ${done.toLocaleString()} blocks`);
}

main()
  .then(() => close())
  .catch(async (err) => {
    console.error("[coinbase-rewards] fatal:", err);
    await close().catch(() => {});
    process.exit(1);
  });
