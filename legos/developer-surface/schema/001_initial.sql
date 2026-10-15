-- Developer Surface lego — initial schema migration. Forward-only; no destructive ops.

CREATE TABLE IF NOT EXISTS api_keys (
    id           UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id      UUID,
    name         TEXT        NOT NULL,
    key_hash     TEXT        NOT NULL,
    prefix       TEXT        NOT NULL,
    status       TEXT        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'revoked')),
    last_used_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT api_keys_pkey PRIMARY KEY (id),
    CONSTRAINT api_keys_hash_unique UNIQUE (key_hash)
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id, status);

CREATE TABLE IF NOT EXISTS webhooks (
    id           UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id      UUID,
    url          TEXT        NOT NULL,
    events       TEXT[]      NOT NULL DEFAULT '{}',
    status       TEXT        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'paused', 'failing')),
    secret       TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT webhooks_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_webhooks_user ON webhooks(user_id, status);

CREATE TABLE IF NOT EXISTS api_request_log (
    id           UUID        NOT NULL DEFAULT gen_random_uuid(),
    api_key_id   UUID,
    method       TEXT        NOT NULL,
    path         TEXT        NOT NULL,
    status_code  INTEGER,
    ip_address   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT api_request_log_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_api_request_log_key ON api_request_log(api_key_id, created_at DESC);
