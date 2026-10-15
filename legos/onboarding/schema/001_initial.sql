-- Onboarding lego — initial schema migration. Forward-only; no destructive ops.

CREATE TABLE IF NOT EXISTS onboarding_progress (
    id           UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL,
    step_key     TEXT        NOT NULL,
    status       TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
    completed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT onboarding_progress_pkey PRIMARY KEY (id),
    CONSTRAINT onboarding_progress_unique UNIQUE (user_id, step_key)
);
CREATE INDEX IF NOT EXISTS idx_onboarding_progress_user ON onboarding_progress(user_id, status);

CREATE TABLE IF NOT EXISTS onboarding_sample_data_runs (
    id           UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL,
    status       TEXT        NOT NULL DEFAULT 'requested'
                            CHECK (status IN ('requested', 'provisioned', 'failed')),
    detail       JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT onboarding_sample_data_runs_pkey PRIMARY KEY (id)
);
