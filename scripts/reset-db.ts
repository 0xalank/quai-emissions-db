#!/usr/bin/env tsx
// Drop every table owned by this project, including the schema_migrations
// tracker, so the next `npm run migrate` re-runs everything from scratch.
//
// Requires DATABASE_URL to point at the target Postgres. Prompts for explicit
// confirmation because this is irreversible.
//
// Usage:
//   npm run reset:db            (interactive — asks to confirm)
//   FORCE=1 npm run reset:db    (skip prompt — for scripted pipelines)

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Client } from "pg";

const TABLES = [
  // Child/dependent tables first; CASCADE on each makes order non-critical,
  // but explicit ordering helps readers understand the dependency graph.
  "rollups_daily",
  "rollups_weekly",
  "rollups_monthly",
  "coinbase_rewards",
  "mining_info",
  "supply_analytics",
  "reorg_log",
  "ingest_cursor",
  "blocks",
  "schema_migrations",
];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set. Check .env.local.");
    process.exit(1);
  }

  // Surface the target so you can't nuke the wrong DB by accident.
  const redacted = url.replace(/:[^:@]+@/, ":****@");
  console.log(`Target:  ${redacted}`);
  console.log(`Tables:  ${TABLES.join(", ")}`);

  if (process.env.FORCE !== "1") {
    const rl = createInterface({ input, output });
    const answer = await rl.question(
      `\nThis will DROP all tables above. Type "yes" to continue: `,
    );
    rl.close();
    if (answer.trim().toLowerCase() !== "yes") {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    for (const t of TABLES) {
      process.stdout.write(`DROP TABLE IF EXISTS ${t} CASCADE ... `);
      await client.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
      console.log("ok");
    }
    console.log(
      `\nDone. Next steps:\n  npm run migrate\n  npm run ingest`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
