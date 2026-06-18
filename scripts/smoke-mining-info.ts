/* eslint-disable no-console */
// Smoke test for the refactored fetchMiningInfo() path.
// Run: `npx tsx scripts/smoke-mining-info.ts`
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });

// Dynamic import AFTER env is loaded so RPC constants resolve from .env.local.
async function main() {
  const { LIVE_STATS_RPC, ZONE_RPC } = await import("../lib/quai/constants");
  const { fetchMiningInfo } = await import("../lib/quai/endpoints");

  console.log(`[smoke] LIVE_STATS_RPC=${LIVE_STATS_RPC}  ZONE_RPC=${ZONE_RPC}`);
  const t0 = performance.now();
  const info = await fetchMiningInfo();
  const ms = Math.round(performance.now() - t0);

  const fmt = (n: bigint) => n.toLocaleString();
  const mh = (n: bigint) => {
    const units = ["H/s", "KH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s"];
    let v = Number(n);
    let i = 0;
    while (v >= 1000 && i < units.length - 1) {
      v /= 1000;
      i++;
    }
    return `${v.toFixed(2)} ${units[i]}`;
  };

  console.log(`[smoke] ${ms}ms  block=${info.blockNumber}  blocksAnalyzed=${info.blocksAnalyzed}  avgBlockTime=${info.avgBlockTime}s`);
  console.log(`[smoke] KawPoW  diff=${fmt(info.perAlgo.kawpow.difficulty)}  hash=${mh(info.perAlgo.kawpow.hashRate)}  shareTime=${info.perAlgo.kawpow.avgShareTime}s`);
  console.log(`[smoke] SHA     diff=${fmt(info.perAlgo.sha.difficulty)}  hash=${mh(info.perAlgo.sha.hashRate)}  shareTime=${info.perAlgo.sha.avgShareTime}s`);
  console.log(`[smoke] Scrypt  diff=${fmt(info.perAlgo.scrypt.difficulty)}  hash=${mh(info.perAlgo.scrypt.hashRate)}  shareTime=${info.perAlgo.scrypt.avgShareTime}s`);
  console.log(`[smoke] baseReward=${fmt(info.baseBlockReward)}  workshareReward=${fmt(info.workshareReward)}  avgTxFees=${fmt(info.avgTxFees)}`);
  console.log(`[smoke] quaiSupplyTotal=${fmt(info.quaiSupplyTotal)}`);

  const problems: string[] = [];
  if (info.blockNumber <= 0) problems.push("blockNumber is zero/negative");
  if (info.perAlgo.kawpow.difficulty === 0n) problems.push("kawpow difficulty is 0n");
  if (info.perAlgo.sha.hashRate === 0n) problems.push("sha hashRate is 0n");
  if (info.quaiSupplyTotal === 0n) problems.push("quaiSupplyTotal is 0n");
  if (!info.blockHash?.startsWith("0x")) problems.push("blockHash malformed");

  if (problems.length) {
    console.error(`[smoke] FAIL: ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log("[smoke] OK");
}

main().catch((err) => {
  console.error("[smoke] ERROR", err);
  process.exit(1);
});
