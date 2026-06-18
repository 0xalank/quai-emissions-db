# Deploy: Ubuntu + systemd + nginx

Production layout this directory targets:

```
                                ┌──────────────────────────┐
   internet ──→ nginx :443 ──→  │  Next.js  :3029          │  (systemd: quai-emissions-dashboard)
                                └──────────────────────────┘
                                            │
                                            ▼
                                ┌──────────────────────────┐
                                │  Postgres                │  (managed or local)
                                └──────────────────────────┘
                                            ▲
                                            │
                                ┌──────────────────────────┐
                                │  Ingest worker           │  (systemd: quai-emissions-ingest)
                                │  backfill → tail @3s     │
                                └──────────────────────────┘
```

Files in this directory:

| file | purpose |
|---|---|
| `quai-emissions-ingest.service` | systemd unit for the long-lived ingest worker |
| `quai-emissions-dashboard.service` | systemd unit for `next start` |
| `nginx-quai-emissions.conf` | nginx site (HTTPS reverse proxy → :3029) |

---

## One-time host setup

```bash
# 1. Node 20 (NodeSource keeps /usr/bin/npm, which our unit files reference)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx

# 2. Unprivileged user + deploy directory
sudo useradd --system --create-home --home-dir /srv/quai-emissions-db --shell /bin/bash quai
# (or `useradd --system --no-create-home` if /srv/quai-emissions-db will live elsewhere)
```

If you're putting the checkout under `/home/<you>/...` instead of `/srv/...`,
edit each `.service` file and remove the `ProtectHome=true` line — it
prevents the service from reading `/home`.

---

## App setup

```bash
# As the deploy user, in the deploy directory:
git clone https://github.com/your-org/quai-emissions-db.git /srv/quai-emissions-db
cd /srv/quai-emissions-db
sudo chown -R quai:quai /srv/quai-emissions-db

sudo -u quai cp .env.local.example .env.local
sudo -u quai $EDITOR .env.local              # set DATABASE_URL etc.

sudo -u quai npm ci
sudo -u quai npm run validate:env             # fails on placeholders / malformed DATABASE_URL
sudo -u quai npm run migrate                  # apply schema
sudo -u quai npm run backfill:smoke           # bounded DB/RPC sanity check
sudo -u quai npm run doctor                   # env + RPC + DB + table counts
sudo -u quai npm run build                    # required before next start
```

---

## Install services

```bash
sudo cp deploy/quai-emissions-ingest.service /etc/systemd/system/
sudo cp deploy/quai-emissions-dashboard.service /etc/systemd/system/
sudo systemctl daemon-reload

# Start ingest first so the dashboard has data when it boots
sudo systemctl enable --now quai-emissions-ingest
sudo systemctl enable --now quai-emissions-dashboard

# Verify
systemctl status quai-emissions-ingest quai-emissions-dashboard
journalctl -u quai-emissions-ingest -f       # tail ingest logs
journalctl -u quai-emissions-dashboard -f    # tail dashboard logs
cd /srv/quai-emissions-db && sudo -u quai npm run deploy:check
```

The ingest unit uses `Restart=on-failure` with backoff (5 failures in 5
minutes → stop) so RPC blips self-heal but a structural break stops
restart-storms. The dashboard uses `Restart=always` because Next.js
shouldn't exit cleanly in production.

---

## Install nginx + TLS

```bash
sudo cp deploy/nginx-quai-emissions.conf /etc/nginx/sites-available/quai-emissions
sudo ln -s /etc/nginx/sites-available/quai-emissions /etc/nginx/sites-enabled/

# Edit the file to set your real server_name before reloading:
sudo $EDITOR /etc/nginx/sites-available/quai-emissions

sudo nginx -t                                 # syntax check
sudo systemctl reload nginx

# TLS via Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d dashboard.example.com
# certbot rewrites the file in place; diff its result before accepting
```

`nginx-quai-emissions.conf` ships with:

- HTTP → HTTPS 301 (preserves the ACME `/.well-known/acme-challenge/` path)
- HTTP/2, TLS 1.2 + 1.3
- HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy headers
- Aggressive cache for `/_next/static/*` (1 year, immutable — Next.js
  fingerprints these)
- Short cache for `/_next/image` (60 minutes)
- gzip for JSON, JS, CSS, SVG, HTML
- Standard reverse-proxy headers (`X-Forwarded-Proto`, `Host`,
  `X-Real-IP`, etc.)

---

## Updating

```bash
cd /srv/quai-emissions-db
sudo -u quai git pull
sudo -u quai npm ci                          # install new deps
sudo -u quai npm run migrate                 # any new migrations are idempotent
sudo -u quai npm run build                   # rebuild
sudo systemctl restart quai-emissions-dashboard
# Ingest only needs a restart if scripts/ingest/* changed
sudo systemctl restart quai-emissions-ingest
sudo -u quai npm run deploy:check
```

The migration runner is idempotent and transaction-wrapped — running it on
every deploy is safe even if there are no new migrations. Old migrations
are skipped with a `skip <version>` log line.

---

## Troubleshooting

**Dashboard service won't start, journal says `next start: cannot find .next/`**
→ You forgot `npm run build` after the last update. Run it as the deploy user.

**Ingest restarts forever with `ECONNREFUSED` to Postgres**
→ DB host is unreachable. Check `DATABASE_URL` in `.env.local` and confirm
the managed-Postgres firewall allows the deploy host's IP. The unit's
`StartLimitBurst=5 / StartLimitIntervalSec=300` will eventually stop
retrying — `systemctl reset-failed quai-emissions-ingest` to retry.

**`502 Bad Gateway` from nginx**
→ Either the dashboard service is down (`systemctl status
quai-emissions-dashboard`) or it's bound to a different port (check
`Environment=PORT=3029` in the unit file matches the nginx `proxy_pass`).

**Nginx loads but charts are empty**
→ Confirm `NEXT_PUBLIC_ROLLUPS_ENABLED=true` is set in `.env.local` *and*
that `npm run build` ran AFTER setting it (this is a `NEXT_PUBLIC_*` var so
it's baked in at build time).

**Ingest is slow on first backfill**
→ Expected. Backfill from genesis touches every block in 10 k-block chunks.
On a typical managed Postgres + the public RPC, full historical backfill
takes a few hours and is bottlenecked by RPC throughput, not DB writes.
Once cursor catches up to head, tail mode polls every 3 seconds.

**ProtectHome=true breaks the service when deploy is under /home**
→ Edit the unit, drop the `ProtectHome=true` line, `daemon-reload`, and
`restart` the service.
