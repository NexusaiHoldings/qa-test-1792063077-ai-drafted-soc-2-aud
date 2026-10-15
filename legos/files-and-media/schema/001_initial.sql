-- Files & Media lego — initial schema migration. Forward-only; no destructive ops.

CREATE TABLE IF NOT EXISTS files (
    id            UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id       UUID,
    filename      TEXT        NOT NULL,
    mime_type     TEXT        NOT NULL,
    size_bytes    BIGINT      NOT NULL DEFAULT 0,
    storage_key   TEXT        NOT NULL,
    category      TEXT,
    scan_status   TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (scan_status IN ('pending', 'clean', 'infected', 'skipped')),
    status        TEXT        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'quarantined', 'deleted')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT files_pkey PRIMARY KEY (id),
    CONSTRAINT files_storage_key_unique UNIQUE (storage_key)
);
CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_status ON files(status, scan_status);

CREATE TABLE IF NOT EXISTS file_extractions (
    id            UUID        NOT NULL DEFAULT gen_random_uuid(),
    file_id       UUID        NOT NULL,
    kind          TEXT        NOT NULL DEFAULT 'structured_data',
    extracted     JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT file_extractions_pkey PRIMARY KEY (id),
    CONSTRAINT file_extractions_file_fk FOREIGN KEY (file_id)
        REFERENCES files(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_file_extractions_file ON file_extractions(file_id);
