-- Identity & Access lego — password reset + MFA migration
-- Sprint 2.2; forward-only per spec §4.3
-- No DROP / TRUNCATE / DELETE-without-WHERE in this file.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id                    UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id               UUID        NOT NULL,
    token_hash            TEXT        NOT NULL,
    expires_at            TIMESTAMPTZ NOT NULL,
    used_at               TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    requesting_ip         INET,
    requesting_user_agent TEXT,
    CONSTRAINT prt_pkey    PRIMARY KEY (id),
    CONSTRAINT prt_tok_uq  UNIQUE (token_hash),
    CONSTRAINT prt_user_fk FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pwreset_user_unused
    ON password_reset_tokens(user_id, expires_at DESC)
    WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS mfa_factors (
    id               UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id          UUID        NOT NULL,
    factor_type      TEXT        NOT NULL
                                 CHECK (factor_type IN ('totp', 'sms', 'email', 'passkey')),
    secret_encrypted BYTEA,
    label            TEXT,
    enrolled_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at     TIMESTAMPTZ,
    status           TEXT        NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active', 'revoked')),
    CONSTRAINT mfa_factors_pkey    PRIMARY KEY (id),
    CONSTRAINT mfa_factors_user_fk FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mfa_user_active
    ON mfa_factors(user_id)
    WHERE status = 'active';

CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
    id           UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL,
    code_hash    TEXT        NOT NULL,
    used_at      TIMESTAMPTZ,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT mrc_pkey    PRIMARY KEY (id),
    CONSTRAINT mrc_code_uq UNIQUE (code_hash),
    CONSTRAINT mrc_user_fk FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
);
