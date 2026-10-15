-- Admin Console lego — 001_initial.sql
-- Forward-only migration: no DROP / TRUNCATE / DELETE-without-WHERE.

CREATE TABLE IF NOT EXISTS admin_sections (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    lego_name     TEXT        NOT NULL,
    section_name  TEXT        NOT NULL,
    section_order INT         NOT NULL,
    permissions   TEXT[]      NOT NULL,
    routes        TEXT[]      NOT NULL,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (lego_name, section_name)
);

CREATE TABLE IF NOT EXISTS feature_flags (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    key             TEXT        UNIQUE NOT NULL,
    enabled         BOOLEAN     NOT NULL DEFAULT FALSE,
    description     TEXT,
    rollout_percent INT         CHECK (rollout_percent BETWEEN 0 AND 100) DEFAULT 0,
    target_segments JSONB       NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_config (
    key        TEXT        PRIMARY KEY,
    value      JSONB       NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID        NOT NULL,
    action        TEXT        NOT NULL,
    target_type   TEXT,
    target_id     TEXT,
    payload       JSONB,
    performed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address    INET
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_admin
    ON admin_audit_log (admin_user_id, performed_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_target
    ON admin_audit_log (target_type, target_id, performed_at DESC)
    WHERE target_type IS NOT NULL;
