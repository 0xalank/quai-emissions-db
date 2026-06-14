-- Daily QUAI market prices and Qi/QUAI conversion quotes.
--
-- Prices are stored separately from rollups so the chain indexer can refresh
-- market data without rewriting block-derived aggregates. Qi quotes are one
-- row per daily rollup close block, using quai_qiToQuai(1000 qits, block) so
-- the dashboard displays the chain's own quote for 1 QI.

CREATE TABLE market_prices_daily (
  source                text          NOT NULL,
  symbol                text          NOT NULL,
  quote_currency        text          NOT NULL,
  period_start          date          NOT NULL,
  open                  numeric(38,18) NOT NULL,
  high                  numeric(38,18) NOT NULL,
  low                   numeric(38,18) NOT NULL,
  close                 numeric(38,18) NOT NULL,
  volume                numeric(38,18),
  quote_volume          numeric(38,18),
  source_open_time_ms   bigint,
  source_close_time_ms  bigint,
  fetched_at            timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (source, symbol, quote_currency, period_start)
);

CREATE INDEX market_prices_daily_period_idx
  ON market_prices_daily (period_start DESC);

CREATE TABLE qi_daily_quotes (
  period_start           date          PRIMARY KEY,
  block_number           bigint        NOT NULL
    REFERENCES blocks(block_number) ON DELETE CASCADE,
  qi_amount_qits         numeric(78,0) NOT NULL,
  quai_amount_wei        numeric(78,0) NOT NULL,
  indexed_at             timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX qi_daily_quotes_block_idx
  ON qi_daily_quotes (block_number DESC);
