-- Support & Help lego — initial schema migration
-- support-and-help-buildout-001 foundation slice; forward-only per spec §4.3
-- No DROP / TRUNCATE / DELETE-without-WHERE in this file.

-- Knowledge base articles. The agent's suggest_kb_article tool searches these;
-- AI deflection grounds answers in published articles.
CREATE TABLE IF NOT EXISTS kb_articles (
    id            UUID        NOT NULL DEFAULT gen_random_uuid(),
    slug          TEXT        NOT NULL,
    title         TEXT        NOT NULL,
    body          TEXT        NOT NULL,
    category      TEXT,
    tags          TEXT[]      NOT NULL DEFAULT '{}',
    status        TEXT        NOT NULL DEFAULT 'published'
                              CHECK (status IN ('draft', 'published', 'archived')),
    view_count    INTEGER     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT kb_articles_pkey PRIMARY KEY (id),
    CONSTRAINT kb_articles_slug_unique UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_kb_articles_status
    ON kb_articles(status, category);

-- Support tickets. Attributed to a user (identity-and-access). The agent's
-- triage_incoming_ticket tool sets priority + category; escalate_to_human
-- flips assignee_type to 'human'.
CREATE TABLE IF NOT EXISTS support_tickets (
    id             UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id        UUID,
    subject        TEXT        NOT NULL,
    status         TEXT        NOT NULL DEFAULT 'open'
                               CHECK (status IN ('open', 'pending', 'resolved', 'closed')),
    priority       TEXT        NOT NULL DEFAULT 'normal'
                               CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    category       TEXT,
    assignee_type  TEXT        NOT NULL DEFAULT 'agent'
                               CHECK (assignee_type IN ('agent', 'human', 'unassigned')),
    escalated_at   TIMESTAMPTZ,
    resolved_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT support_tickets_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status
    ON support_tickets(status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user
    ON support_tickets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_queue
    ON support_tickets(assignee_type, status) WHERE status IN ('open', 'pending');

-- Per-ticket message thread. author_type distinguishes the requesting user,
-- the AI agent's drafted/sent responses, and human operators.
CREATE TABLE IF NOT EXISTS support_messages (
    id            UUID        NOT NULL DEFAULT gen_random_uuid(),
    ticket_id     UUID        NOT NULL,
    author_type   TEXT        NOT NULL
                              CHECK (author_type IN ('user', 'agent', 'human')),
    author_id     UUID,
    body          TEXT        NOT NULL,
    is_internal   BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT support_messages_pkey PRIMARY KEY (id),
    CONSTRAINT support_messages_ticket_fk FOREIGN KEY (ticket_id)
        REFERENCES support_tickets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket
    ON support_messages(ticket_id, created_at ASC);

-- CSAT / feedback rows, optionally tied to a resolved ticket.
CREATE TABLE IF NOT EXISTS support_feedback (
    id            UUID        NOT NULL DEFAULT gen_random_uuid(),
    ticket_id     UUID,
    user_id       UUID,
    rating        INTEGER     NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment       TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT support_feedback_pkey PRIMARY KEY (id),
    CONSTRAINT support_feedback_ticket_fk FOREIGN KEY (ticket_id)
        REFERENCES support_tickets(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_support_feedback_ticket
    ON support_feedback(ticket_id);
