-- Exact coinbase reward index.
--
-- The SOAP mining chart should not infer mined QUAI from reward parameters or
-- sampled workshare counts. go-quai emits actual CoinbaseType outbound ETXs;
-- those ETXs carry the recipient ledger, raw reward value, and lockup byte.
-- This table stores one exact summary row per indexed block.

CREATE TABLE coinbase_rewards (
  block_number              bigint PRIMARY KEY
    REFERENCES blocks(block_number) ON DELETE CASCADE,
  quai_base_reward          numeric(78,0) NOT NULL,
  quai_locked_reward        numeric(78,0) NOT NULL,
  qi_reward                 numeric(78,0) NOT NULL,
  coinbase_etx_count        int NOT NULL,
  quai_coinbase_etx_count   int NOT NULL,
  qi_coinbase_etx_count     int NOT NULL,
  indexed_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX coinbase_rewards_indexed_at_idx ON coinbase_rewards (indexed_at DESC);

ALTER TABLE rollups_daily
  ADD COLUMN coinbase_quai_base_reward_sum     numeric(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN coinbase_quai_locked_reward_sum   numeric(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN coinbase_qi_reward_sum            numeric(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN coinbase_reward_indexed_count     int NOT NULL DEFAULT 0;

ALTER TABLE rollups_weekly
  ADD COLUMN coinbase_quai_base_reward_sum     numeric(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN coinbase_quai_locked_reward_sum   numeric(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN coinbase_qi_reward_sum            numeric(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN coinbase_reward_indexed_count     int NOT NULL DEFAULT 0;

ALTER TABLE rollups_monthly
  ADD COLUMN coinbase_quai_base_reward_sum     numeric(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN coinbase_quai_locked_reward_sum   numeric(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN coinbase_qi_reward_sum            numeric(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN coinbase_reward_indexed_count     int NOT NULL DEFAULT 0;
