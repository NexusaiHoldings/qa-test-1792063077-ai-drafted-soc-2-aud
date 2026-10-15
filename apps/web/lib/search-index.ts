/**
 * search-index — substrate indexer for @nexus/search (substrate-lego-wiring-001
 * search gap-fill). Nothing populated `search_index`, so the CommandPalette
 * returned nothing. This indexes the universal content source present in every
 * company — the support lego's published KB articles — into `search_index`
 * with a navigable url (/help/<slug>).
 *
 * v1 indexes KB articles. Extend `reindexAll` with additional sources
 * (company content, CRM, etc.) as needed — the palette + shims don't change.
 */
import { buildDb } from "@/lib/db";

/** Re-index published KB articles into search_index. Returns the kb_article row count. */
export async function reindexKbArticles(): Promise<number> {
  const db = buildDb();
  await db.execute(
    `INSERT INTO search_index (entity_type, entity_id, title, body, category, keywords, url, updated_at)
     SELECT 'kb_article', id, title, body, category, tags, '/help/' || slug, now()
       FROM kb_articles
      WHERE status = 'published'
     ON CONFLICT (entity_type, entity_id) DO UPDATE SET
        title = EXCLUDED.title,
        body = EXCLUDED.body,
        category = EXCLUDED.category,
        keywords = EXCLUDED.keywords,
        url = EXCLUDED.url,
        updated_at = now()`,
  );
  const rows = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM search_index WHERE entity_type = 'kb_article'`,
  );
  return Number(rows[0]?.n ?? 0);
}

/** True when the search index has no rows yet (drives lazy first-search reindex). */
export async function searchIndexIsEmpty(): Promise<boolean> {
  const db = buildDb();
  const rows = await db.query(`SELECT 1 FROM search_index LIMIT 1`);
  return rows.length === 0;
}

/** Full reindex across all known sources (v1: KB articles only). */
export async function reindexAll(): Promise<{ kb_articles: number }> {
  return { kb_articles: await reindexKbArticles() };
}
