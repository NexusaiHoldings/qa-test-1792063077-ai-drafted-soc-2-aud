-- Social & Engagement lego — initial schema migration. Forward-only; no destructive ops.

CREATE TABLE IF NOT EXISTS social_comments (
    id           UUID        NOT NULL DEFAULT gen_random_uuid(),
    entity_type  TEXT        NOT NULL,
    entity_id    UUID        NOT NULL,
    author_id    UUID,
    body         TEXT        NOT NULL,
    status       TEXT        NOT NULL DEFAULT 'visible'
                            CHECK (status IN ('visible', 'hidden', 'pending', 'spam')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT social_comments_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_social_comments_entity ON social_comments(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_comments_status ON social_comments(status);

CREATE TABLE IF NOT EXISTS social_reactions (
    id           UUID        NOT NULL DEFAULT gen_random_uuid(),
    entity_type  TEXT        NOT NULL,
    entity_id    UUID        NOT NULL,
    user_id      UUID        NOT NULL,
    kind         TEXT        NOT NULL DEFAULT 'like',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT social_reactions_pkey PRIMARY KEY (id),
    CONSTRAINT social_reactions_unique UNIQUE (entity_type, entity_id, user_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_social_reactions_entity ON social_reactions(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS social_referrals (
    id            UUID        NOT NULL DEFAULT gen_random_uuid(),
    referrer_id   UUID        NOT NULL,
    referred_email TEXT,
    code          TEXT        NOT NULL,
    status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'converted', 'rewarded', 'expired')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT social_referrals_pkey PRIMARY KEY (id),
    CONSTRAINT social_referrals_code_unique UNIQUE (code)
);
CREATE INDEX IF NOT EXISTS idx_social_referrals_referrer ON social_referrals(referrer_id, status);
