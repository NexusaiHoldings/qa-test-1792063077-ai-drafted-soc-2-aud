-- Identity & Access lego — OAuth providers + account deletion
-- Sprint 2.3; forward-only per spec §4.3
-- No DROP / TRUNCATE / DELETE-without-WHERE in this file.

CREATE TABLE IF NOT EXISTS oauth_identities (
    id               UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id          UUID        NOT NULL,
    provider         TEXT        NOT NULL
                                 CHECK (provider IN ('google', 'github')),
    provider_user_id TEXT        NOT NULL,
    email            TEXT,
    profile_data     JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT oi_pkey             PRIMARY KEY (id),
    CONSTRAINT oi_provider_uq      UNIQUE (provider, provider_user_id),
    CONSTRAINT oi_user_fk          FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_oauth_user
    ON oauth_identities(user_id);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deletion_grace_until  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_deletion_pending
    ON users(deletion_grace_until)
    WHERE deletion_requested_at IS NOT NULL AND status != 'deleted';

CREATE TABLE IF NOT EXISTS login_history (
    id             UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id        UUID        NOT NULL,
    login_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address     INET,
    user_agent     TEXT,
    method         TEXT        CHECK (method IN (
                                   'password', 'oauth_google', 'oauth_github', 'recovery_code')),
    success        BOOLEAN     NOT NULL,
    failure_reason TEXT,
    CONSTRAINT lh_pkey    PRIMARY KEY (id),
    CONSTRAINT lh_user_fk FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_login_history_user
    ON login_history(user_id, login_at DESC);
