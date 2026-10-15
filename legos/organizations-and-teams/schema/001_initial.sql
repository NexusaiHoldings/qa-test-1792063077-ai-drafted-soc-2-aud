-- Organizations & Teams lego — initial schema migration
-- organizations-and-teams-buildout-001 foundation slice; forward-only per spec §4.3
-- No DROP / TRUNCATE / DELETE-without-WHERE in this file.

CREATE TABLE IF NOT EXISTS organizations (
    id            UUID        NOT NULL DEFAULT gen_random_uuid(),
    name          TEXT        NOT NULL,
    slug          TEXT        NOT NULL,
    owner_user_id UUID        NOT NULL,
    plan          TEXT        NOT NULL DEFAULT 'free',
    seat_limit    INTEGER     NOT NULL DEFAULT 5,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT organizations_pkey PRIMARY KEY (id),
    CONSTRAINT organizations_slug_unique UNIQUE (slug)
);

CREATE TABLE IF NOT EXISTS org_members (
    id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    org_id      UUID        NOT NULL,
    user_id     UUID        NOT NULL,
    role        TEXT        NOT NULL DEFAULT 'member'
                            CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ,
    CONSTRAINT org_members_pkey PRIMARY KEY (id),
    CONSTRAINT org_members_unique UNIQUE (org_id, user_id),
    CONSTRAINT org_members_org_fk FOREIGN KEY (org_id)
        REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_org_members_org ON org_members(org_id, role);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id);

CREATE TABLE IF NOT EXISTS org_invitations (
    id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    org_id      UUID        NOT NULL,
    email       TEXT        NOT NULL,
    role        TEXT        NOT NULL DEFAULT 'member'
                            CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    token       TEXT        NOT NULL,
    status      TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
    invited_by  UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL,
    CONSTRAINT org_invitations_pkey PRIMARY KEY (id),
    CONSTRAINT org_invitations_token_unique UNIQUE (token),
    CONSTRAINT org_invitations_org_fk FOREIGN KEY (org_id)
        REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_org
    ON org_invitations(org_id, status);

CREATE TABLE IF NOT EXISTS org_audit_log (
    id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    org_id      UUID        NOT NULL,
    actor_id    UUID,
    actor_type  TEXT        NOT NULL DEFAULT 'human'
                            CHECK (actor_type IN ('human', 'agent', 'system')),
    action      TEXT        NOT NULL,
    detail      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT org_audit_log_pkey PRIMARY KEY (id),
    CONSTRAINT org_audit_log_org_fk FOREIGN KEY (org_id)
        REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_org_audit_org
    ON org_audit_log(org_id, created_at DESC);
