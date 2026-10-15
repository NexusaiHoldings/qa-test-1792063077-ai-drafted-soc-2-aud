-- CRM & Lifecycle lego — initial schema migration
-- crm-and-lifecycle-buildout-001 foundation slice; forward-only per spec §4.3
-- No DROP / TRUNCATE / DELETE-without-WHERE in this file.

-- Contacts / leads. owner_user_id ties to identity-and-access. stage tracks
-- the pipeline; lead_score is set by the agent's score_lead tool.
CREATE TABLE IF NOT EXISTS crm_contacts (
    id            UUID        NOT NULL DEFAULT gen_random_uuid(),
    owner_user_id UUID,
    name          TEXT        NOT NULL,
    email         TEXT,
    company       TEXT,
    source        TEXT,
    stage         TEXT        NOT NULL DEFAULT 'new'
                              CHECK (stage IN ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost')),
    lead_score    INTEGER     NOT NULL DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100),
    is_hot        BOOLEAN     NOT NULL DEFAULT FALSE,
    tags          TEXT[]      NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT crm_contacts_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_stage
    ON crm_contacts(stage, lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_owner
    ON crm_contacts(owner_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_email
    ON crm_contacts(LOWER(email)) WHERE email IS NOT NULL;

-- Per-contact interaction history (calls, emails, notes, stage changes).
-- The agent's summarize_contact_history + propose_next_action read these.
CREATE TABLE IF NOT EXISTS crm_interactions (
    id            UUID        NOT NULL DEFAULT gen_random_uuid(),
    contact_id    UUID        NOT NULL,
    kind          TEXT        NOT NULL
                              CHECK (kind IN ('note', 'email', 'call', 'meeting', 'stage_change', 'outreach')),
    direction     TEXT        CHECK (direction IN ('inbound', 'outbound')),
    body          TEXT,
    actor_type    TEXT        NOT NULL DEFAULT 'human'
                              CHECK (actor_type IN ('human', 'agent', 'system')),
    actor_id      UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT crm_interactions_pkey PRIMARY KEY (id),
    CONSTRAINT crm_interactions_contact_fk FOREIGN KEY (contact_id)
        REFERENCES crm_contacts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crm_interactions_contact
    ON crm_interactions(contact_id, created_at DESC);

-- Outreach drafts produced by the agent's generate_outreach_draft tool,
-- pending salesperson approval before send (config.outreach.require_approval).
CREATE TABLE IF NOT EXISTS crm_outreach_drafts (
    id            UUID        NOT NULL DEFAULT gen_random_uuid(),
    contact_id    UUID        NOT NULL,
    channel       TEXT        NOT NULL DEFAULT 'email'
                              CHECK (channel IN ('email', 'sms', 'linkedin')),
    subject       TEXT,
    body          TEXT        NOT NULL,
    status        TEXT        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'approved', 'sent', 'discarded')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at       TIMESTAMPTZ,
    CONSTRAINT crm_outreach_drafts_pkey PRIMARY KEY (id),
    CONSTRAINT crm_outreach_drafts_contact_fk FOREIGN KEY (contact_id)
        REFERENCES crm_contacts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crm_outreach_status
    ON crm_outreach_drafts(status, created_at DESC);
