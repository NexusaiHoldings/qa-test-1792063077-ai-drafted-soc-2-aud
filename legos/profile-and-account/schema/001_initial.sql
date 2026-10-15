-- Profile & Account lego — initial schema migration
-- profile-and-account-buildout-001 foundation slice; forward-only per spec §4.3
-- No DROP / TRUNCATE / DELETE-without-WHERE in this file.

-- Extended profile for a user (identity-and-access owns the users table).
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id            UUID        NOT NULL,
    display_name       TEXT,
    avatar_url         TEXT,
    bio                TEXT,
    timezone           TEXT,
    preferences        JSONB       NOT NULL DEFAULT '{}'::jsonb,
    completion_score   INTEGER     NOT NULL DEFAULT 0 CHECK (completion_score BETWEEN 0 AND 100),
    last_active_at     TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_profiles_pkey PRIMARY KEY (user_id)
);

-- Connected identity providers (OAuth/passkey links) for a user.
CREATE TABLE IF NOT EXISTS connected_accounts (
    id            UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL,
    provider      TEXT        NOT NULL,
    external_id   TEXT        NOT NULL,
    email         TEXT,
    connected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT connected_accounts_pkey PRIMARY KEY (id),
    CONSTRAINT connected_accounts_unique UNIQUE (user_id, provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_connected_accounts_user
    ON connected_accounts(user_id);

-- GDPR data-export requests. status tracks the export job; the agent's
-- request_account_export tool (confirm-gated) creates these.
CREATE TABLE IF NOT EXISTS account_export_requests (
    id            UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL,
    format        TEXT        NOT NULL DEFAULT 'json'
                              CHECK (format IN ('json', 'csv')),
    status        TEXT        NOT NULL DEFAULT 'requested'
                              CHECK (status IN ('requested', 'processing', 'ready', 'expired', 'failed')),
    download_url  TEXT,
    requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at  TIMESTAMPTZ,
    expires_at    TIMESTAMPTZ,
    CONSTRAINT account_export_requests_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_account_export_user
    ON account_export_requests(user_id, requested_at DESC);
