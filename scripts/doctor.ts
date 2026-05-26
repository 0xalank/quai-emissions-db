#!/usr/bin/env tsx

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

type Check = {
  name: string;
  run: () => Promise<string>;
};

const REQUIRED_NODE_MAJOR = 20;

function loadLocalEnv(): void {
  if (!existsSync(".env.local")) return;
  const lines = readFileSync(".env.local", "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    process.env[key] ??= value;
  }
}

function ok(name: string, detail: string): void {
  console.log(`ok   ${name}: ${detail}`);
}

function bad(name: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`fail ${name}: ${msg}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

loadLocalEnv();

const dbUrl = process.env.DATABASE_URL;

const checks: Check[] = [
  {
    name: "node",
    run: async () => {
      const major = Number(process.versions.node.split(".")[0]);
      assert(major >= REQUIRED_NODE_MAJOR, `Node ${REQUIRED_NODE_MAJOR}+ required, got ${process.version}`);
      return process.version;
    },
  },
  {
    name: "environment",
    run: async () => {
      assert(dbUrl, "DATABASE_URL is not set");
      const parsed = new URL(dbUrl);
      assert(["postgres:", "postgresql:"].includes(parsed.protocol), "DATABASE_URL must be Postgres");
      assert(!/CHANGE_ME|<|>|\byour-|example\.com/i.test(dbUrl), "DATABASE_URL still contains a placeholder");
      assert(!["user", "username"].includes(decodeURIComponent(parsed.username).toLowerCase()), "DATABASE_URL still contains a placeholder username");
      assert(!["host", "db-host"].includes(parsed.hostname.toLowerCase()), "DATABASE_URL still contains a placeholder host");
      return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}`;
    },
  },
  {
    name: "rpc",
    run: async () => {
      const [{ getLatestBlockNumber }, { ZONE_RPC }] = await Promise.all([
        import("../lib/quai/blocks"),
        import("../lib/quai/constants"),
      ]);
      const head = await getLatestBlockNumber();
      return `${ZONE_RPC} head=${head.toLocaleString()}`;
    },
  },
  {
    name: "database",
    run: async () => {
      assert(dbUrl, "DATABASE_URL is not set");
      const client = new Client({ connectionString: dbUrl });
      await client.connect();
      try {
        const res = await client.query<{ current_database: string; current_user: string }>(
          "SELECT current_database(), current_user",
        );
        const row = res.rows[0];
        return `${row.current_user}@${row.current_database}`;
      } finally {
        await client.end();
      }
    },
  },
  {
    name: "migrations",
    run: async () => {
      assert(dbUrl, "DATABASE_URL is not set");
      const expected = readdirSync(join(process.cwd(), "migrations"))
        .filter((f) => f.endsWith(".sql"))
        .map((f) => f.replace(/\.sql$/, ""))
        .sort();
      const client = new Client({ connectionString: dbUrl });
      await client.connect();
      try {
        const exists = await client.query<{ exists: boolean }>(
          "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists",
        );
        assert(exists.rows[0]?.exists, "schema_migrations missing; run npm run migrate");
        const applied = await client.query<{ version: string }>(
          "SELECT version FROM schema_migrations ORDER BY version",
        );
        const appliedSet = new Set(applied.rows.map((r) => r.version));
        const missing = expected.filter((v) => !appliedSet.has(v));
        assert(missing.length === 0, `missing migrations: ${missing.join(", ")}`);
        return `${applied.rows.length}/${expected.length} applied`;
      } finally {
        await client.end();
      }
    },
  },
  {
    name: "tables",
    run: async () => {
      assert(dbUrl, "DATABASE_URL is not set");
      const client = new Client({ connectionString: dbUrl });
      await client.connect();
      try {
        const res = await client.query<{
          blocks: string;
          supply_analytics: string;
          rollups_daily: string;
          mining_info: string;
          cursor: string;
        }>(`
          SELECT
            (SELECT count(*) FROM blocks)::text AS blocks,
            (SELECT count(*) FROM supply_analytics)::text AS supply_analytics,
            (SELECT count(*) FROM rollups_daily)::text AS rollups_daily,
            (SELECT count(*) FROM mining_info)::text AS mining_info,
            (SELECT last_ingested_block::text FROM ingest_cursor WHERE id = 1) AS cursor
        `);
        const r = res.rows[0];
        return `cursor=${r.cursor ?? "missing"} blocks=${r.blocks} analytics=${r.supply_analytics} daily=${r.rollups_daily} mining=${r.mining_info}`;
      } finally {
        await client.end();
      }
    },
  },
];

async function main(): Promise<void> {
  let failed = 0;
  for (const check of checks) {
    try {
      ok(check.name, await check.run());
    } catch (err) {
      failed++;
      bad(check.name, err);
    }
  }
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
