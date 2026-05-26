# Migrations

Plain-SQL migrations, applied in filename order by `scripts/migrate.ts`. One-way (up only). New changes = new numbered file; to revert, write a new file that does the reversal.

## Usage

```bash
# From the project root. Requires DATABASE_URL in .env.local.
npm run migrate
```

The runner takes a Postgres advisory lock for the migration session, then tracks applied versions in a `schema_migrations` table (created on first run). Already-applied migrations are skipped. Each migration runs inside a transaction — on error, the whole file is rolled back and the runner exits non-zero.

## Conventions

- **Filename**: `NNNN_description.sql`, zero-padded 4-digit sequence. Description is lowercase-snake.
- **Atomicity**: every file must be safely wrappable in `BEGIN; … COMMIT;`. Don't use commands that can't run inside a transaction (e.g. `CREATE INDEX CONCURRENTLY`, `VACUUM`) — if you need one, add a separate migration with a `-- NOT TRANSACTIONAL` header and the runner will skip the implicit transaction for it. (Not needed yet.)
- **Idempotency**: not required. The tracking table guards against double-apply.
- **No down migrations.** To reverse `0006_add_foo.sql`, write `0007_drop_foo.sql`. Keeps history linear.

## Current migrations

- `0001_init.sql` — `blocks`, `supply_analytics` (with `soap_burn_balance`), `ingest_cursor`.
- `0002_rollups.sql` — `rollups_daily`, `rollups_weekly`, `rollups_monthly`.
