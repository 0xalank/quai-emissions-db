-- Parent-chain blocks found through SOAP, indexed locally for pool-directory
-- integrations. The dashboard API reads only this table; soap.qu.ai is an
-- ingest source and is never queried on a MiningPoolStats request.

CREATE TABLE soap_parent_blocks (
  chain         text NOT NULL
    CHECK (chain IN ('bcash', 'litecoin', 'dogecoin', 'ravencoin')),
  block_height  bigint NOT NULL,
  block_hash    bytea NOT NULL,
  block_time    timestamptz NOT NULL,
  reward        numeric(38, 8) NOT NULL,
  coinbase_txid bytea NOT NULL,
  price_usd     numeric(38, 12),
  indexed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain, block_hash)
);

CREATE INDEX soap_parent_blocks_chain_time_idx
  ON soap_parent_blocks (chain, block_time DESC, block_height DESC);

CREATE INDEX soap_parent_blocks_chain_height_idx
  ON soap_parent_blocks (chain, block_height DESC);

CREATE TABLE soap_parent_block_sync (
  chain              text PRIMARY KEY
    CHECK (chain IN ('bcash', 'litecoin', 'dogecoin', 'ravencoin')),
  source_total_count bigint NOT NULL DEFAULT 0,
  last_synced_at     timestamptz NOT NULL DEFAULT now()
);
