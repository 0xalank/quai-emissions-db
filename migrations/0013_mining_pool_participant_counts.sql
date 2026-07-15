CREATE TABLE mining_pool_participant_counts (
  algo              text PRIMARY KEY CHECK (algo IN ('sha', 'scrypt', 'kawpow')),
  miners            integer NOT NULL CHECK (miners >= 0),
  workers           integer NOT NULL DEFAULT -1 CHECK (workers >= -1),
  pool_count        integer NOT NULL CHECK (pool_count >= 0),
  source_updated_at timestamptz NOT NULL,
  fetched_at        timestamptz NOT NULL DEFAULT now()
);
