-- Search lego — initial schema migration. Forward-only; no destructive ops.

CREATE TABLE IF NOT EXISTS search_index (
    id            UUID        NOT NULL DEFAULT gen_random_uuid(),
    entity_type   TEXT        NOT NULL,
    entity_id     UUID        NOT NULL,
    title         TEXT        NOT NULL,
    body          TEXT,
    category      TEXT,
    keywords      TEXT[]      NOT NULL DEFAULT '{}',
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT search_index_pkey PRIMARY KEY (id),
    CONSTRAINT search_index_entity_unique UNIQUE (entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_search_index_type ON search_index(entity_type, category);

CREATE TABLE IF NOT EXISTS saved_searches (
    id            UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL,
    name          TEXT        NOT NULL,
    query         TEXT        NOT NULL,
    facets        JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT saved_searches_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches(user_id, created_at DESC);
