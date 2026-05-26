#!/usr/bin/env tsx

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

async function run(name: string, cmd: string, args: string[]): Promise<void> {
  try {
    const { stdout } = await exec(cmd, args, { timeout: 15_000 });
    const first = stdout.trim().split("\n")[0] ?? "";
    console.log(`ok   ${name}${first ? `: ${first}` : ""}`);
  } catch (err) {
    const message =
      err && typeof err === "object" && "message" in err
        ? String(err.message)
        : String(err);
    console.error(`fail ${name}: ${message}`);
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  await run("dashboard service", "systemctl", ["is-active", "quai-emissions-dashboard"]);
  await run("ingest service", "systemctl", ["is-active", "quai-emissions-ingest"]);
  await run("nginx config", "nginx", ["-t"]);
  await run("local health", "curl", ["-fsS", "http://127.0.0.1:3000/api/health"]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
