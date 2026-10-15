-- legos/memory-and-knowledge/schema/001_memory_namespace.sql
-- SS0c: Per-portfolio-company memory namespace + tier model + GDPR support.
-- Idempotent. Safe to run repeatedly.

-- ─── Per-company namespacing on existing memory tables ──────────────────────
-- memory_items + portfolio_learnings already carry company_id, but Nexus's
-- companies table is NEXUS portfolio (legacy). Portfolio-runtime introduces
-- a separate portfolio_companies registry per spec §13. Add the new column
-- + back-compat dual-key (legacy company_id || portfolio_company_id).

ALTER TABLE memory_items
    ADD COLUMN IF NOT EXISTS portfolio_company_id UUID;

ALTER TABLE portfolio_learnings
    ADD COLUMN IF NOT EXISTS portfolio_company_id UUID;

CREATE INDEX IF NOT EXISTS idx_memory_items_portfolio_company
    ON memory_items(portfolio_company_id) WHERE portfolio_company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_portfolio_learnings_portfolio_company
    ON portfolio_learnings(portfolio_company_id) WHERE portfolio_company_id IS NOT NULL;

-- ─── Memory tier column (spec §5.6) ─────────────────────────────────────────
-- Tier classification: short_term=0 (in-context only, never persists here),
-- working=1, long_term=2, shared=3.  Default 'long_term' for migration safety.
ALTER TABLE memory_items
    ADD COLUMN IF NOT EXISTS memory_tier TEXT NOT NULL DEFAULT 'long_term';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'memory_items_memory_tier_check'
    ) THEN
        ALTER TABLE memory_items
            ADD CONSTRAINT memory_items_memory_tier_check
            CHECK (memory_tier IN ('working', 'long_term', 'shared'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_memory_items_tier
    ON memory_items(memory_tier);

-- ─── Last-retrieved tracking for low-utility demotion (spec §5.6) ───────────
ALTER TABLE memory_items
    ADD COLUMN IF NOT EXISTS last_retrieved_at TIMESTAMPTZ;

ALTER TABLE memory_items
    ADD COLUMN IF NOT EXISTS retrieval_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE memory_items
    ADD COLUMN IF NOT EXISTS contradiction_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_memory_items_last_retrieved
    ON memory_items(last_retrieved_at);

-- ─── User-attribution for GDPR right-to-be-forgotten ────────────────────────
-- Memory rows can be tied to a portfolio user. forget_user nukes ALL rows
-- for that user across long_term + working tiers.
ALTER TABLE memory_items
    ADD COLUMN IF NOT EXISTS portfolio_user_id UUID;

CREATE INDEX IF NOT EXISTS idx_memory_items_portfolio_user
    ON memory_items(portfolio_user_id) WHERE portfolio_user_id IS NOT NULL;

-- ─── Working-tier storage table ─────────────────────────────────────────────
-- Spec §5.6: working memory is "active task and goal state, persists across
-- turns within a workflow", storage=redis with 7d_idle TTL. Postgres mirror
-- exists for replayability + audit (Spec §9.2). Redis is the fast path; this
-- table is the source of truth.
CREATE TABLE IF NOT EXISTS portfolio_runtime_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_company_id UUID NOT NULL,
    portfolio_user_id UUID,
    workflow_id UUID,                        -- ties memory to one runtime workflow
    memory_kind TEXT NOT NULL CHECK (memory_kind IN (
        'active_goal',
        'in_flight_task',
        'pending_approval',
        'planned_action',
        'tool_call_history'
    )),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pr_memory_company
    ON portfolio_runtime_memory(portfolio_company_id);
CREATE INDEX IF NOT EXISTS idx_pr_memory_user
    ON portfolio_runtime_memory(portfolio_user_id) WHERE portfolio_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pr_memory_workflow
    ON portfolio_runtime_memory(workflow_id) WHERE workflow_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pr_memory_expires
    ON portfolio_runtime_memory(expires_at);
CREATE INDEX IF NOT EXISTS idx_pr_memory_kind
    ON portfolio_runtime_memory(memory_kind);

-- ─── GDPR forget audit log ──────────────────────────────────────────────────
-- Every forget_user call is auditable. Stored separately so the audit row
-- itself is never deleted by a follow-up forget call.
CREATE TABLE IF NOT EXISTS portfolio_memory_forget_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_company_id UUID NOT NULL,
    portfolio_user_id UUID NOT NULL,
    requested_by_user_id UUID,                -- self vs admin-driven
    reason TEXT,
    rows_deleted_memory_items INTEGER NOT NULL DEFAULT 0,
    rows_deleted_runtime_memory INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pr_forget_log_company
    ON portfolio_memory_forget_log(portfolio_company_id);
CREATE INDEX IF NOT EXISTS idx_pr_forget_log_user
    ON portfolio_memory_forget_log(portfolio_user_id);

-- ─── Knowledge compiler run log ─────────────────────────────────────────────
-- Per-company debounce + observability for the compiler runs.
CREATE TABLE IF NOT EXISTS portfolio_knowledge_compiler_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_company_id UUID NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    rows_processed INTEGER NOT NULL DEFAULT 0,
    patterns_extracted INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'complete', 'failed')),
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_compiler_runs_company
    ON portfolio_knowledge_compiler_runs(portfolio_company_id, started_at DESC);
