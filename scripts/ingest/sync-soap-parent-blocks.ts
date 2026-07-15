#!/usr/bin/env tsx

import { close } from "./db";
import { syncSoapParentBlocks } from "./soap-parent-blocks";

async function main(): Promise<void> {
  const results = await syncSoapParentBlocks();
  for (const result of results) {
    console.log(
      `[soap-parent-blocks] ${result.target}: fetched=${result.fetched.toLocaleString()} ` +
        `indexed=${result.indexed.toLocaleString()} source=${result.sourceTotal.toLocaleString()}`,
    );
  }
}

main()
  .then(() => close())
  .catch(async (err) => {
    console.error(`[soap-parent-blocks] fatal: ${String(err)}`);
    await close().catch(() => {});
    process.exit(1);
  });
