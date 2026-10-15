-- Files & Media — blob storage backend (substrate-lego-wiring-001 files gap-fill)
-- The lego stores file METADATA in `files` (with a storage_key referencing
-- external bytes) but ships no storage backend. This table is the substrate's
-- v1 storage: file bytes live in the company's own Neon DB, keyed by id; the
-- `files.storage_key` is this row's UUID. Size-capped at the API layer (10MB).
-- Production upgrade path: Vercel Blob / S3 signed-URL (swap lib/file-storage.ts).
-- Idempotent.

CREATE TABLE IF NOT EXISTS file_blobs (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type TEXT        NOT NULL DEFAULT 'application/octet-stream',
    byte_size    BIGINT      NOT NULL DEFAULT 0,
    bytes        BYTEA       NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
