-- Feedback lego — initial schema migration (feedback-to-build-loop-001)
-- Lives in the COMPANY's own Neon DB (the substrate's packages/db/migrate.ts
-- applies every legos/<lego>/schema/*.sql at deploy). Forward-only per spec §4.3.
-- No DROP / TRUNCATE / DELETE-without-WHERE in this file.

-- One row per piece of in-app feedback. Submitted by any signed-in user via the
-- FAB; triaged by Nexus (recommendation written back into `triage`); the company
-- admin acts on it (Build/Revise/Discuss/Decline) from /admin/feedback. `status`
-- is READ-ONLY in the UI — it reflects what the coding pipeline did:
--   new        — just submitted, awaiting triage
--   triaged    — Nexus produced a recommendation; admin can act (Discuss leaves it here)
--   building   — a Build/Revise was approved and the change-request pipeline is running
--   declined   — admin passed on it (terminal, re-actionable)
--   done       — the change was merged + deployed (deploy-monitor live_verified)
CREATE TABLE IF NOT EXISTS feedback (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    type            TEXT        NOT NULL DEFAULT 'idea'
                                CHECK (type IN ('bug', 'edit', 'idea')),
    description     TEXT        NOT NULL,
    page            TEXT,
    status          TEXT        NOT NULL DEFAULT 'new'
                                CHECK (status IN ('new', 'triaged', 'discuss', 'building', 'declined', 'done')),
    -- submitter (identity-and-access). Nullable so anonymous capture degrades
    -- gracefully, though the FAB only shows for signed-in users.
    user_id         UUID,
    user_name       TEXT,
    user_email      TEXT,
    -- Nexus triage result: { recommendation, scores{complexity,fit,value},
    -- summary, sourceRef, requiresChairman, riskAreas[] }. Written back by the
    -- runtime sync path (PATCH /api/feedback/:id).
    triage          JSONB       NOT NULL DEFAULT '{}'::jsonb,
    -- Append-only audit timeline: [{ ts, kind, detail, actor }].
    history         JSONB       NOT NULL DEFAULT '[]'::jsonb,
    -- The admin's last requested action (build|revise|discuss|decline) + note.
    requested_action TEXT,
    action_note     TEXT,
    -- Idempotency latch — only one in-flight action per item:
    --   idle | in_flight | done | declined
    action_state    TEXT        NOT NULL DEFAULT 'idle',
    -- Clarifying-question round-trip with the pipeline.
    pending_question TEXT,
    pending_answer  TEXT,
    -- Who acted + when (admin email).
    actioned_by     TEXT,
    actioned_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT feedback_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_status
    ON feedback(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_user
    ON feedback(user_id);
