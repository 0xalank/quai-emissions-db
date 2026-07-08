-- Daily network-activity primitives.
--
-- Full blocks are already fetched for exact CoinbaseType outbound-ETX rewards.
-- Reuse those responses to index non-coinbase transaction counts and address
-- participation, then aggregate daily active addresses and wallet growth from
-- these normalized rows.

CREATE TABLE block_activity (
  block_number      bigint PRIMARY KEY
    REFERENCES blocks(block_number) ON DELETE CASCADE,
  tx_count          int NOT NULL,
  indexed_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX block_activity_tx_count_idx
  ON block_activity (tx_count);

CREATE TABLE block_active_addresses (
  block_number      bigint NOT NULL
    REFERENCES blocks(block_number) ON DELETE CASCADE,
  address           bytea NOT NULL,
  PRIMARY KEY (block_number, address)
);

CREATE INDEX block_active_addresses_address_idx
  ON block_active_addresses (address);

CREATE TABLE address_first_seen (
  address           bytea PRIMARY KEY,
  first_seen_block  bigint NOT NULL,
  first_seen_date   date NOT NULL,
  first_seen_at     timestamptz NOT NULL
);

CREATE INDEX address_first_seen_date_idx
  ON address_first_seen (first_seen_date);

CREATE INDEX address_first_seen_block_idx
  ON address_first_seen (first_seen_block);
