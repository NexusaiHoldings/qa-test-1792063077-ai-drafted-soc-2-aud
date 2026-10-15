-- Identity & Access lego — initial schema migration
-- Sprint 2.1 foundation slice; forward-only per spec §4.3
-- No DROP / TRUNCATE / DELETE-without-WHERE in this file.

CREATE TABLE IF NOT EXISTS users (
    id            UUID        NOT NULL DEFAULT gen_random_uuid(),
    email         TEXT        NOT NULL,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    status        TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'disabled', 'deleted')),
    CONSTRAINT users_pkey  PRIMARY KEY (id),
    CONSTRAINT users_email_unique UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS sessions (
    id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL,
    token_hash  TEXT        NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address  INET,
    user_agent  TEXT,
    CONSTRAINT sessions_pkey    PRIMARY KEY (id),
    CONSTRAINT sessions_user_fk FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user
    ON sessions(user_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_email
    ON users(LOWER(email));
