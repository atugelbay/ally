-- Raw inbound webhook events (for audit/replay)
CREATE TABLE IF NOT EXISTS raw_events (
    id BIGSERIAL PRIMARY KEY,
    provider TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    body JSONB NOT NULL,
    signature_valid BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_raw_events_received_at ON raw_events (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_events_provider ON raw_events (provider);


