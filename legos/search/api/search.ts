/** Search handlers — search lego. Framework-agnostic. */
import type { HandlerContext, HandlerResult } from "./_lib/handler";
import { ok, err } from "./_lib/handler";
import type { DbRow } from "./_lib/db";

/** GET /api/search?q=&type= — candidate retrieval (ILIKE over title/body/keywords). */
export async function handleSearch(
  ctx: HandlerContext,
  query: { q?: string; entity_type?: string; limit?: number },
): Promise<HandlerResult> {
  const q = (query.q ?? "").trim();
  if (!q) return err(400, "q is required");
  const limit = Math.max(1, Math.min(50, query.limit ?? 20));
  const like = `%${q}%`;
  const params: unknown[] = [like, q.toLowerCase()];
  let typeClause = "";
  if (query.entity_type) {
    params.push(query.entity_type);
    typeClause = ` AND entity_type = $${params.length}`;
  }
  params.push(limit);
  const rows = await ctx.db.query<DbRow>(
    `SELECT id, entity_type, entity_id, title, body, category, url
     FROM search_index
     WHERE (title ILIKE $1 OR body ILIKE $1 OR $2 = ANY(keywords))${typeClause}
     ORDER BY updated_at DESC LIMIT $${params.length}`,
    ...params,
  );
  await ctx.events.publish(rows.length ? "search.performed" : "search.zero_results", { q });
  return ok({ results: rows, count: rows.length });
}

/** POST /api/search/saved — save a search for a user. */
export async function handleSaveSearch(
  ctx: HandlerContext,
  body: { user_id?: string; name?: string; query?: string; facets?: Record<string, unknown> },
): Promise<HandlerResult> {
  if (!body.user_id || !body.name || !body.query) {
    return err(400, "user_id, name, query required");
  }
  const rows = await ctx.db.query<DbRow>(
    `INSERT INTO saved_searches (user_id, name, query, facets)
     VALUES ($1, $2, $3, $4::jsonb) RETURNING id`,
    body.user_id, body.name, body.query, JSON.stringify(body.facets ?? {}),
  );
  return ok({ saved_search_id: rows[0].id }, 201);
}

/** GET /api/search/saved?user_id= — list a user's saved searches. */
export async function handleListSavedSearches(
  ctx: HandlerContext,
  userId: string,
): Promise<HandlerResult> {
  if (!userId) return err(400, "user_id is required");
  const rows = await ctx.db.query<DbRow>(
    `SELECT id, name, query, facets, created_at FROM saved_searches
     WHERE user_id = $1 ORDER BY created_at DESC`,
    userId,
  );
  return ok({ saved_searches: rows, count: rows.length });
}
