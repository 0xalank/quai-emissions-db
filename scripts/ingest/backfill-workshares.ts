#!/usr/bin/env tsx
// Fill historical workshare counts from full block bodies.
//
// The normal dense backfill uses quai_getHeaderByNumber, which does not include
// the top-level workshares[] array. Historical SOAP workshare counts were
// therefore sampled during the first ingest. This repair script walks full block
// bodies for the requested range and fills ws_*_count + workshare_count exactly.

import { walkBlocksByNums } from "../../lib/quai/blocks";
import { SOAP_ACTIVATION_DATE } from "../../lib/quai/protocol-constants";
import { close, pool } from "./db";
import { runRollups } from "./rollup";

type MissingRow = { block_number: string };

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
  clauses.push(`ts >= $${values.length}::date`);

  if (toDate) {
    values.push(toDate);
    clauses.push(`ts < ($${values.length}::date + INTERVAL '1 day')`);
  }
  if (fromBlock) {
    values.push(fromBlock);
    clauses.push(`block_number >= $${values.length}::bigint`);
  }
  if (toBlock) {
    values.push(toBlock);
    clauses.push(`block_number <= $${values.length}::bigint`);
  }
  if (!overwrite) {
    clauses.push(`(
      ws_kawpow_count IS NULL OR
      ws_progpow_count IS NULL OR
      ws_sha_count IS NULL OR
      ws_scrypt_count IS NULL
    )`);
  }

  values.push(Math.min(chunkSize, remaining));
  const limitParam = values.length;

  const { rows } = await pool.query<MissingRow>(
    `SELECT block_number::text
       FROM blocks
      WHERE ${clauses.join(" AND ")}
      ORDER BY block_number ASC
      LIMIT $${limitParam}`,
    values,
  );

  return rows.map((r) => Number(r.block_number));
}

async function updateCounts(blocks: Awaited<ReturnType<typeof walkBlocksByNums>>) {
  if (blocks.length === 0) return;

  const values: unknown[] = [];
  const tuples: string[] = [];
  let i = 1;
  for (const b of blocks) {
    const kaw = b.wsKawpowCount ?? 0;
    const prog = b.wsProgpowCount ?? 0;
    const sha = b.wsShaCount ?? 0;
    const scr = b.wsScryptCount ?? 0;
    const total = kaw + prog + sha + scr;

    tuples.push(`($${i}::bigint,$${i + 1}::int,$${i + 2}::smallint,$${i + 3}::smallint,$${i + 4}::smallint,$${i + 5}::smallint)`);
    values.push(b.number, total, kaw, prog, sha, scr);
    i += 6;
  }

  await pool.query(
    `UPDATE blocks b
        SET workshare_count = v.workshare_count,
            ws_kawpow_count = v.ws_kawpow_count,
            ws_progpow_count = v.ws_progpow_count,
            ws_sha_count = v.ws_sha_count,
            ws_scrypt_count = v.ws_scrypt_count
       FROM (VALUES ${tuples.join(",")}) AS v(
         block_number,
         workshare_count,
         ws_kawpow_count,
         ws_progpow_count,
         ws_sha_count,
         ws_scrypt_count
       )
      WHERE b.block_number = v.block_number`,
    values,
  );
}

async function main() {
  console.log(
    `[workshares] from-date=${fromDate} to-date=${toDate ?? "latest"} chunk=${chunkSize} limit=${limit === Number.MAX_SAFE_INTEGER ? "all" : limit} overwrite=${overwrite}`,
  );

  let done = 0;
  const started = Date.now();
  while (done < limit) {
    const nums = await selectBatch(limit - done);
    if (nums.length === 0) break;

    const first = nums[0];
    const last = nums[nums.length - 1];
    const t0 = Date.now();
    const blocks = await walkBlocksByNums(nums);
    if (blocks.length !== nums.length) {
      const got = new Set(blocks.map((b) => b.number));
      const missing = nums.filter((n) => !got.has(n));
      throw new Error(
        `RPC returned ${blocks.length}/${nums.length} full blocks for #${first}..#${last}; missing ${missing.slice(0, 8).join(",")}`,
      );
    }

    await updateCounts(blocks);
    done += blocks.length;
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const totalElapsed = (Date.now() - started) / 1000;
    const rate = done / Math.max(totalElapsed, 0.001);
    console.log(
      `[workshares] #${first}..#${last}: ${blocks.length} blocks in ${elapsed}s; total=${done.toLocaleString()} avg=${rate.toFixed(1)}/s`,
    );
  }

  if (rebuildRollups) {
    console.log("[workshares] rebuilding rollups...");
    const res = await runRollups();
    console.log(`[workshares] rollups rebuilt: ${JSON.stringify(res)}`);
  }

  console.log(`[workshares] done. updated ${done.toLocaleString()} blocks`);
}

main()
  .then(() => close())
  .catch(async (err) => {
    console.error("[workshares] fatal:", err);
    await close().catch(() => {});
    process.exit(1);
  });
