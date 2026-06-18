#!/usr/bin/env tsx

import { existsSync, readFileSync } from "node:fs";

const PLACEHOLDER_RE = /CHANGE_ME|<|>|\byour-|example\.com/i;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

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

function fail(message: string): never {
  console.error(`[env] ${message}`);
  process.exit(1);
}

function warn(message: string): void {
  console.warn(`[env] warning: ${message}`);
}

function requireUrl(name: string, raw: string | undefined): URL {
  if (!raw) fail(`${name} is not set. Copy .env.local.example to .env.local and fill it in.`);
  if (PLACEHOLDER_RE.test(raw)) fail(`${name} still contains a placeholder value.`);

  try {
    return new URL(raw);
  } catch {
    fail(`${name} is not a valid URL.`);
  }
}

loadLocalEnv();

const db = requireUrl("DATABASE_URL", process.env.DATABASE_URL);
if (!["postgres:", "postgresql:"].includes(db.protocol)) {
  fail("DATABASE_URL must use postgres:// or postgresql://.");
}
if (!db.username) fail("DATABASE_URL must include a username.");
if (["user", "username"].includes(decodeURIComponent(db.username).toLowerCase())) {
  fail("DATABASE_URL still contains a placeholder username.");
}
if (!db.hostname) fail("DATABASE_URL must include a host.");
if (["host", "db-host"].includes(db.hostname.toLowerCase())) {
  fail("DATABASE_URL still contains a placeholder host.");
}
if (!db.pathname || db.pathname === "/") fail("DATABASE_URL must include a database name.");
if (!db.password && !LOCAL_HOSTS.has(db.hostname)) {
  warn("DATABASE_URL has no password for a non-local host.");
}
if (!LOCAL_HOSTS.has(db.hostname) && db.searchParams.get("sslmode") !== "require") {
  warn("managed Postgres usually needs ?sslmode=require.");
}

const rpcRaw =
  process.env.QUAI_ZONE_RPC ??
  `https://rpc.quai.network/${process.env.NEXT_PUBLIC_QUAI_ZONE ?? "cyprus1"}`;
const rpc = requireUrl("QUAI_ZONE_RPC", rpcRaw);
if (!["http:", "https:"].includes(rpc.protocol)) {
  fail("QUAI_ZONE_RPC must use http:// or https://.");
}

const publicRpcRaw =
  process.env.QUAI_PUBLIC_RPC ??
  `https://rpc.quai.network/${process.env.NEXT_PUBLIC_QUAI_ZONE ?? "cyprus1"}`;
const publicRpc = requireUrl("QUAI_PUBLIC_RPC", publicRpcRaw);
if (!["http:", "https:"].includes(publicRpc.protocol)) {
  fail("QUAI_PUBLIC_RPC must use http:// or https://.");
}

const zone = process.env.NEXT_PUBLIC_QUAI_ZONE ?? "cyprus1";
if (!/^[a-z0-9-]+$/i.test(zone)) {
  fail("NEXT_PUBLIC_QUAI_ZONE must be a simple zone slug such as cyprus1.");
}

const rollups = process.env.NEXT_PUBLIC_ROLLUPS_ENABLED;
if (rollups !== undefined && !["true", "false"].includes(rollups)) {
  fail("NEXT_PUBLIC_ROLLUPS_ENABLED must be true or false when set.");
}

console.log(
  `[env] ok: db=${db.hostname}${db.port ? `:${db.port}` : ""}${db.pathname}` +
    ` rpc=${rpc.href} publicRpc=${publicRpc.href}`,
);
