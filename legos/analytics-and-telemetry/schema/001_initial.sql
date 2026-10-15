-- Analytics & Telemetry lego — initial schema migration. Forward-only; no destructive ops.

CREATE TABLE IF NOT EXISTS analytics_events (
    id           UUID        NOT NULL DEFAULT gen_random_uuid(),
    name         TEXT        NOT NULL,
    user_id      UUID,
    properties   JSONB       NOT NULL DEFAULT '{}'::jsonb,
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT analytics_events_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON analytics_events(name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events(user_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS analytics_funnels (
    id           UUID        NOT NULL DEFAULT gen_random_uuid(),
    name         TEXT        NOT NULL,
    steps        TEXT[]      NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT analytics_funnels_pkey PRIMARY KEY (id),
    CONSTRAINT analytics_funnels_name_unique UNIQUE (name)
);
