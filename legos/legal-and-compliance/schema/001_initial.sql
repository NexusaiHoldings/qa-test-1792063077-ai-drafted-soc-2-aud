-- Legal & Compliance lego — initial schema
-- Applies at portfolio-company install time, not platform deploy time (ADR 0007 Decision 1).
-- All DDL is idempotent (IF NOT EXISTS / ON CONFLICT). No DROP / TRUNCATE / DELETE-without-WHERE.

-- ── Documents ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legal_documents (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_type        TEXT        NOT NULL
                        CHECK (doc_type IN (
                            'terms_of_service', 'privacy_policy',
                            'cookie_policy', 'accessibility_statement'
                        )),
    version         TEXT        NOT NULL,
    jurisdiction    TEXT        NOT NULL,
    content_html    TEXT        NOT NULL,
    content_summary TEXT,
    effective_at    TIMESTAMPTZ NOT NULL,
    published_by    UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (doc_type, version, jurisdiction)
);

CREATE INDEX IF NOT EXISTS idx_legal_docs_active
    ON legal_documents (doc_type, jurisdiction, effective_at DESC);

-- ── Acknowledgments ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legal_acknowledgments (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL,
    doc_id          UUID        NOT NULL REFERENCES legal_documents(id),
    acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address      INET,
    user_agent      TEXT,
    UNIQUE (user_id, doc_id)
);

CREATE INDEX IF NOT EXISTS idx_legal_ack_user
    ON legal_acknowledgments (user_id, acknowledged_at DESC);

-- ── Cookie Consents ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cookie_consents (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID,
    anonymous_id TEXT,
    decision     TEXT        NOT NULL
                     CHECK (decision IN ('accepted_all', 'rejected_all', 'custom')),
    categories   JSONB       DEFAULT '{}',
    given_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address   INET,
    expires_at   TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cookie_user
    ON cookie_consents (user_id, given_at DESC)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cookie_anon
    ON cookie_consents (anonymous_id, given_at DESC)
    WHERE anonymous_id IS NOT NULL;
