# Quai Supply Tracker

A Next.js dashboard tracking QUAI and Qi token emissions on the Quai Network
`cyprus1` zone. Combines a live Postgres-backed ingest worker (in tail mode
the cursor stays within ~3 seconds of chain head) with a charting frontend
that surfaces realized circulating supply, SOAP burn, mining issuance, and
the eventual maximum-supply trajectory vs. Bitcoin.

> Single zone, single chain, single source of truth. The realized-supply
> math lives in a Postgres view (`v_supply_*`) so chart code never has to
> reconcile gross-vs-net or worry about the SOAP-burn-already-subtracted
> footgun documented in `docs/emissions-full-picture.md`.

---

## Quick start

```bash
# 1. install
npm install

# 2. start local Postgres, then configure environment
npm run db:up
cp .env.local.example .env.local
$EDITOR .env.local        # set DATABASE_URL; RPC defaults are usable
npm run validate:env

# 3. apply schema (eight migrations, idempotent, transaction-wrapped)
npm run migrate

# 4. first-run smoke test, then start the ingest worker
npm run backfill:smoke    # bounded 1,000-block DB/RPC sanity check
npm run doctor            # verifies env, RPC, DB, migrations, and table counts
npm run ingest            # backfill from genesis, then tail head with 3s polling

# 5. in another terminal, run the dashboard
npm run dev
# → http://localhost:3000/dashboard
```

The dev server only needs the ingest to have written *some* rollups for charts
to render meaningfully — you don't have to wait for full backfill. The
home page hero will show real numbers as soon as the first daily rollup
covers the SOAP-active period.

---

## Requirements

- **Node 20+** (Next.js 16 requires it; the `tsx` runner used by the ingest
  scripts works the same)
- **Postgres 14+** with `numeric(78,0)` support — basically any modern build.
  Managed services tested: Supabase, Neon, AWS RDS. Use `?sslmode=require`
  in the connection string for managed providers.
- **A Quai zone RPC** — `https://rpc.quai.network/cyprus1` works for the
  current tip; `https://debug.rpc.quai.network/cyprus1` adds support for
  PR 2696's historical `quai_getMiningInfo` (needed for full backfill of
  the SOAP-era `mining_info` table).

---

## Environment variables

| var | required | default | purpose |
|---|---|---|---|
| `DATABASE_URL` | **yes** | — | Postgres connection string. Used by migrations, ingest worker, and route handlers. |
| `QUAI_ZONE_RPC` | no | `https://rpc.quai.network/${NEXT_PUBLIC_QUAI_ZONE}` | Single zone JSON-RPC endpoint for ingest/backfill calls. Use the debug endpoint when historical `quai_getMiningInfo(block, false)` is needed. |
| `QUAI_PUBLIC_RPC` | no | `https://rpc.quai.network/${NEXT_PUBLIC_QUAI_ZONE}` | Public/current-tip RPC for live dashboard KPIs. May be set to `https://rpc.quai.network` or a zone URL. |
| `NEXT_PUBLIC_QUAI_ZONE` | no | `cyprus1` | Zone slug — also used by the URL fallback above and surfaced in the UI. |
| `NEXT_PUBLIC_ROLLUPS_ENABLED` | no | `false` | Gate flag for the rollup chart grid on `/dashboard/history`. Set to `true` once `/api/rollups` is healthy. |

The example file (`.env.local.example`) is the canonical reference. The
`.env.local` you create from it is gitignored along with every other
`.env*` variant; only `.env*.example` files are tracked.

---

## Available scripts

| command | what it does |
|---|---|
| `npm run db:up` | Start the local Postgres container from `docker-compose.yml` on host port 5433. |
| `npm run db:down` | Stop the local Docker compose stack. |
| `npm run validate:env` | Validate `.env.local` values and fail on placeholder or malformed `DATABASE_URL`. |
| `npm run doctor` | Check Node version, env, RPC connectivity, DB connectivity, applied migrations, and key table counts. |
| `npm run dev` | Next.js dev server with Turbopack (port 3000). |
| `npm run build` | Production build. |
| `npm run start` | Serve the production build. |
| `npm run typecheck` | `tsc --noEmit` across the entire repo. |
| `npm run migrate` | Validate env, take a Postgres advisory lock, then apply pending SQL migrations from `migrations/` in filename order. Tracked in `schema_migrations`; idempotent. |
| `npm run reset:db` | **Destructive** — drops and recreates everything. Local-only convenience for full re-backfill. |
| `npm run ingest` | Unified backfill + tail worker. Backfills from genesis to `(head − FINALITY_BUFFER)` in 10k-block chunks, then enters tail mode polling every 3 s. |
| `npm run backfill` | Backfill-only worker (does not enter tail). Accepts `--limit=N` and `--chunk=N`. |
| `npm run backfill:smoke` | Backfill-only smoke test capped at 1,000 blocks. Use this before starting the long-running ingest on a fresh VM. |
| `npm run rollup` | Full rebuild of `rollups_daily/weekly/monthly`. Normally run automatically on each tail tick — invoke manually only if a column changes or you suspect drift. |
| `npm run deploy:check` | Production host checklist for systemd service status, nginx config, and local `/api/health`. |

---

## Routes

The dashboard lives entirely under `/dashboard`. Legacy `/history`
redirects (308) to `/dashboard/history` with query strings preserved.
The root `/` redirects to `/dashboard`.

| route | audience | content |
|---|---|---|
| `/dashboard` | holders | Hero (6 KPIs) · SOAP + Singularity callouts · supply story · Qi cumulative · mining-issuance-since-SOAP · QUAI vs Bitcoin emission curves to 2050 |
| `/dashboard/mining` | miners | Hero (4 KPIs) · per-algorithm composition flagship · QUAI rewarded per algorithm · hashrate · block reward · top coinbases (last 7d) |
| `/dashboard/history` | analysts | URL-state-driven period × range slicer with the legacy 8-chart grid |

---

## API

Internal-stable. Documented for transparency, not contract.

| endpoint | purpose | cache |
|---|---|---|
| `/api/health` | head block, ingest cursor lag, backfill flag | 5 s |
| `/api/stats` | live `quai_getMiningInfo` + supply analytics from store | 30 s |
| `/api/emissions?limit=N` | per-block emissions joined with analytics | 15 s |
| `/api/rollups?period=&from=&to=` | period aggregates from `rollups_*` | 30 s + 5 m SWR |
| `/api/rollups/meta` | rollup date bounds and row counts | 60 s |
| `/api/supply?period=&from=&to=&include=qi,burn,genesis` | realized-circulating math from `v_supply_*` views | 60 s + 5 m SWR |
| `/api/coinbase-leaderboard?days=&limit=` | top coinbases by blocks won | 5 m |

---

## Architecture cheat sheet

### Ingest

`scripts/ingest/run.ts` runs in two modes back-to-back:

- **Backfill** — discrete 10k-block chunks. Each chunk fetches headers
  (parallel batches of 2 000), supply analytics (one batch of up to 10 000),
  the `0x0050AF…` SOAP-burn balance per block, and — every 60th block —
  full block bodies for workshare classification + a `mining_info` row.
  Backfill samples 1:60 by design (≈ 288 samples/day; <2% stddev on
  extrapolated columns).
- **Tail** — every block dense, polled every 3 s. Reorg detection compares
  hashes of the last 10 blocks; mismatches log to `reorg_log` and rewind.

After each chunk (backfill) or tick (tail), incremental rollup queries
re-aggregate the affected periods only.

### Schema

8 migrations in `migrations/` (see `migrations/README.md` for conventions):

- `0001_init.sql` — `blocks`, `supply_analytics`, `ingest_cursor`
- `0002_rollups.sql` — `rollups_daily/weekly/monthly`
- `0003_reorg_log.sql` — append-only audit
- `0004_avg_block_time.sql` — per-period block-time column
- `0005_soap_mining.sql` — per-algorithm columns + `mining_info` table
- `0006_supply_views.sql` + `0008_supply_views_fix.sql` — realized-supply views
- `0007_coinbase_index.sql` — `(primary_coinbase, ts DESC)` index

### Sampling

Critical reading before adding a chart that touches per-algo data:
[`docs/sampling.md`](./docs/sampling.md). Summary: dense columns (workshare
totals, EMA uncled, base block reward, exchange rate, conversion flow) are
exact; sampled columns (per-algo workshare counts during backfill,
per-algo hashrate/difficulty averages) are extrapolated or averaged at
period level. Never sum a sampled per-block column directly during the
backfill window — use the rollup's pre-computed `*_sum` field, which
applies the correct extrapolation formula.

### Supply reconciliation

The single most-likely-to-be-wrong number on the dashboard is realized
circulating supply. Three rules to live by:

1. `quaiSupplyTotal` from the RPC is **already net** of the SOAP burn at
   `0x0050AF…`. Do **not** subtract the burn balance again client-side.
2. `quaiSupplyAdded` and `quaiSupplyRemoved` are **gross** flows — every
   transfer A→B credits both. Don't read either as "minted" or "burned."
3. The Singularity Fork (2026-03-19, Prime block 1,530,500) eliminated
   ~1.667 B QUAI of *future* unlocks. Those allocations were never minted
   into `quaiSupplyTotal`, so there is **nothing to subtract** from any
   curve to "account for" Singularity. The fork shows up as a
   `<ProtocolEventLines>` annotation only.

[`docs/emissions-full-picture.md`](./docs/emissions-full-picture.md) has
the full source-verified treatment with go-quai pointers.

---

## Project layout

```
app/
  api/          route handlers (health, stats, rollups, supply, …)
  dashboard/    home + mining + history pages, with shared layout
  layout.tsx    root layout (theme provider + top nav + react-query)
components/
  dashboard/
    home/       home-page charts and callouts (Soap/Singularity)
    mining/     mining-page charts and tables
    history/    legacy v1 chart components reused across history surfaces
    shared/     HeroStrip, FreshnessLabel, SamplingFootnote, TimeframeToggle, DashboardSubNav
  ui/           Card, ThemeToggle, InfoPopover
  layout/       TopNav
lib/
  comparisons/  Bitcoin schedule, Quai cap projection
  quai/         protocol constants, types, format, store, conversion math
  format.ts     human-readable formatters
  hooks.ts      React Query hooks (useStats, useRollups, useSupply, …)
migrations/     SQL migrations — see migrations/README.md
scripts/
  ingest/       run.ts (unified worker) + backfill.ts + rollup.ts + helpers
  migrate.ts    apply pending migrations
  reset-db.ts   destructive local reset
deploy/         systemd units + nginx config for Ubuntu self-host
docs/           design + reasoning docs (read these before redesigning)
```

---

## Production deploy

### Ubuntu + systemd + nginx (recommended for self-hosting)

The [`deploy/`](./deploy) directory ships ready-to-use systemd units and an
nginx reverse-proxy config:

| file | purpose |
|---|---|
| [`deploy/quai-emissions-ingest.service`](./deploy/quai-emissions-ingest.service) | systemd unit for the long-lived ingest worker (`Restart=on-failure` with backoff) |
| [`deploy/quai-emissions-dashboard.service`](./deploy/quai-emissions-dashboard.service) | systemd unit for `next start` (`Restart=always`) |
| [`deploy/nginx-quai-emissions.conf`](./deploy/nginx-quai-emissions.conf) | nginx site — HTTPS reverse proxy → `:3029`, HTTP/2, HSTS, immutable cache for `/_next/static`, gzip |
| [`deploy/README.md`](./deploy/README.md) | step-by-step install + Let's Encrypt + updates + troubleshooting |

Quick path for a fresh Ubuntu host:

```bash
# Node 20 + nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx

# Deploy user + checkout
sudo useradd --system --create-home --home-dir /srv/quai-emissions-db --shell /bin/bash quai
sudo git clone https://github.com/your-org/quai-emissions-db.git /srv/quai-emissions-db
sudo chown -R quai:quai /srv/quai-emissions-db
cd /srv/quai-emissions-db
sudo -u quai cp .env.local.example .env.local
sudo -u quai $EDITOR .env.local
sudo -u quai npm ci
sudo -u quai npm run validate:env
sudo -u quai npm run migrate
sudo -u quai npm run backfill:smoke
sudo -u quai npm run doctor
sudo -u quai npm run build

# Services + nginx
sudo cp deploy/quai-emissions-{ingest,dashboard}.service /etc/systemd/system/
sudo cp deploy/nginx-quai-emissions.conf /etc/nginx/sites-available/quai-emissions
sudo ln -s /etc/nginx/sites-available/quai-emissions /etc/nginx/sites-enabled/
sudo $EDITOR /etc/nginx/sites-available/quai-emissions     # set server_name
sudo systemctl daemon-reload
sudo systemctl enable --now quai-emissions-ingest quai-emissions-dashboard
sudo nginx -t && sudo systemctl reload nginx
npm run deploy:check

# TLS
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d dashboard.example.com
```

[`deploy/README.md`](./deploy/README.md) has the full details, including
which lines to substitute, the updates workflow (`git pull && npm ci &&
npm run migrate && npm run build && systemctl restart …`), and a
troubleshooting table.

### Other hosting paths

- **Vercel** works out of the box for the frontend. Set the same env vars
  in the Vercel project. The `next.config.mjs` redirects survive
  serverless without configuration. The ingest worker still needs a
  separate long-lived host.
- **The ingest worker is not serverless-friendly.** Run it as a
  long-lived process — the systemd unit above, a Render Worker, a
  Railway service, etc. It expects to be the only writer to `blocks`,
  `supply_analytics`, `mining_info`, and `rollups_*` tables.
- **Postgres connection pool**: `lib/db.ts` uses `max: 10` per Next.js
  instance. With managed Postgres + a serverless deploy, prefer the
  pooled connection URL (Supabase pooler, Neon pooled URL, etc.) so the
  ingest worker and dashboard processes don't fight for connections.

---

## Background reading

- [`docs/dashboard-proposal.md`](./docs/dashboard-proposal.md) — design
  spec for the current dashboard layout (audiences, page-by-page intent,
  data contracts).
- [`docs/emissions-full-picture.md`](./docs/emissions-full-picture.md) —
  authoritative reconciliation of QUAI and Qi supply mechanics, including
  go-quai source pointers.
- [`docs/sampling.md`](./docs/sampling.md) — dense vs. sampled column
  ownership and accuracy guarantees.
- [`docs/phase3-soap-dashboard.md`](./docs/phase3-soap-dashboard.md) —
  rationale for the SOAP-era data model in `migrations/0005`.
