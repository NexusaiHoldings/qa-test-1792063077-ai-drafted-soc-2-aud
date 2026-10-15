-- Search — add a navigable URL to indexed rows (substrate-lego-wiring-001 search gap-fill)
-- search_index is THIS lego's own table (created in 001), so this ALTER is
-- safe on a fresh company DB. The substrate indexer writes url (e.g.
-- '/help/<slug>') so the command palette can navigate to a result, not just
-- display its title. Idempotent.

ALTER TABLE search_index
    ADD COLUMN IF NOT EXISTS url TEXT;
