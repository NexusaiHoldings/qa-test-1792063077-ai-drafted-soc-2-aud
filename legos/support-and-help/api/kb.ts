/**
 * Knowledge-base handlers — support-and-help lego.
 *
 * Backs the help center + the suggest_kb_article agent tool's data source.
 * Search is a simple ILIKE-over-title+body+tags ranker (substrate-portable,
 * no pgvector dependency); the agent's suggest_kb_article tool does the
 * semantic relevance scoring on top of these candidate rows.
 */

import type { HandlerContext, HandlerResult } from "./_lib/handler";
import { ok, err } from "./_lib/handler";
import type { DbRow } from "./_lib/db";

/** GET /api/support/kb — list published articles (optionally by category). */
export async function handleListArticles(
  ctx: HandlerContext,
  query: { category?: string; limit?: number },
): Promise<HandlerResult> {
  const limit = Math.max(1, Math.min(100, query.limit ?? 50));
  const params: unknown[] = [];
  let clause = `WHERE status = 'published'`;
  if (query.category) {
    params.push(query.category);
    clause += ` AND category = $${params.length}`;
  }
  params.push(limit);
  const rows = await ctx.db.query<DbRow>(
    `SELECT id, slug, title, category, tags, view_count, updated_at
     FROM kb_articles ${clause}
     ORDER BY view_count DESC, updated_at DESC LIMIT $${params.length}`,
    ...params,
  );
  return ok({ articles: rows, count: rows.length });
}

/** GET /api/support/kb/{slug} — fetch one article + bump view_count. */
export async function handleGetArticle(
  ctx: HandlerContext,
  slug: string,
): Promise<HandlerResult> {
  if (!slug) return err(400, "slug is required");
  const rows = await ctx.db.query<DbRow>(
    `SELECT id, slug, title, body, category, tags, view_count, updated_at
     FROM kb_articles WHERE slug = $1 AND status = 'published'`,
    slug,
  );
  if (rows.length === 0) return err(404, "article not found");
  await ctx.db.execute(
    `UPDATE kb_articles SET view_count = view_count + 1 WHERE id = $1`,
    rows[0].id,
  );
  await ctx.events.publish("kb.article_viewed", { article_id: rows[0].id, slug });
  return ok({ article: rows[0] });
}

/**
 * GET /api/support/kb/search?q= — candidate retrieval for AI deflection.
 * Returns published articles matching the query across title/body/tags. The
 * suggest_kb_article agent tool scores relevance on these candidates.
 */
export async function handleSearchArticles(
  ctx: HandlerContext,
  query: { q?: string; limit?: number },
): Promise<HandlerResult> {
  const q = (query.q ?? "").trim();
  if (!q) return err(400, "q is required");
  const limit = Math.max(1, Math.min(20, query.limit ?? 5));
  const like = `%${q}%`;
  const rows = await ctx.db.query<DbRow>(
    `SELECT id, slug, title, body, category, tags
     FROM kb_articles
     WHERE status = 'published'
       AND (title ILIKE $1 OR body ILIKE $1 OR $2 = ANY(tags))
     ORDER BY view_count DESC LIMIT $3`,
    like,
    q.toLowerCase(),
    limit,
  );
  return ok({ candidates: rows, count: rows.length });
}
