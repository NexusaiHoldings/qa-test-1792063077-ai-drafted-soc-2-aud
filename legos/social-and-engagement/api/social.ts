/** Social handlers — social-and-engagement lego. Framework-agnostic. */
import type { HandlerContext, HandlerResult } from "./_lib/handler";
import { ok, err } from "./_lib/handler";
import type { DbRow } from "./_lib/db";

/** POST /api/social/comments — post a comment (status pending/visible per config). */
export async function handlePostComment(
  ctx: HandlerContext,
  body: { entity_type?: string; entity_id?: string; author_id?: string; body?: string; require_approval?: boolean },
): Promise<HandlerResult> {
  if (!body.entity_type || !body.entity_id || !body.body) {
    return err(400, "entity_type, entity_id, body required");
  }
  const status = body.require_approval ? "pending" : "visible";
  const rows = await ctx.db.query<DbRow>(
    `INSERT INTO social_comments (entity_type, entity_id, author_id, body, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, status`,
    body.entity_type, body.entity_id, body.author_id ?? null, body.body, status,
  );
  await ctx.events.publish("comment.posted", { comment_id: rows[0].id, entity_type: body.entity_type });
  return ok({ comment_id: rows[0].id, status }, 201);
}

/** GET /api/social/comments?entity_type=&entity_id= — visible comments for an entity. */
export async function handleListComments(
  ctx: HandlerContext,
  query: { entity_type?: string; entity_id?: string },
): Promise<HandlerResult> {
  if (!query.entity_type || !query.entity_id) return err(400, "entity_type and entity_id required");
  const rows = await ctx.db.query<DbRow>(
    `SELECT id, author_id, body, status, created_at FROM social_comments
     WHERE entity_type = $1 AND entity_id = $2 AND status = 'visible' ORDER BY created_at ASC`,
    query.entity_type, query.entity_id,
  );
  return ok({ comments: rows, count: rows.length });
}

/** POST /api/social/reactions — add/toggle a reaction. */
export async function handleReact(
  ctx: HandlerContext,
  body: { entity_type?: string; entity_id?: string; user_id?: string; kind?: string },
): Promise<HandlerResult> {
  if (!body.entity_type || !body.entity_id || !body.user_id) {
    return err(400, "entity_type, entity_id, user_id required");
  }
  await ctx.db.execute(
    `INSERT INTO social_reactions (entity_type, entity_id, user_id, kind)
     VALUES ($1, $2, $3, $4) ON CONFLICT (entity_type, entity_id, user_id, kind) DO NOTHING`,
    body.entity_type, body.entity_id, body.user_id, body.kind ?? "like",
  );
  const rows = await ctx.db.query<DbRow>(
    `SELECT COUNT(*) AS n FROM social_reactions WHERE entity_type = $1 AND entity_id = $2`,
    body.entity_type, body.entity_id,
  );
  return ok({ count: Number(rows[0].n) });
}

/**
 * POST /api/social/comments/{id}/hide — hide a comment.
 * Server-side mutation behind the hide_comment agent tool (confirm).
 */
export async function handleHideComment(
  ctx: HandlerContext,
  commentId: string,
  body: { reason?: string },
): Promise<HandlerResult> {
  if (!commentId) return err(400, "comment id is required");
  const rows = await ctx.db.query<DbRow>(
    `UPDATE social_comments SET status = 'hidden' WHERE id = $1 AND status <> 'hidden'
     RETURNING id, status`,
    commentId,
  );
  if (rows.length === 0) return err(404, "comment not found or already hidden");
  await ctx.events.publish("comment.hidden", { comment_id: commentId, reason: body.reason ?? null });
  return ok({ comment_id: commentId, status: "hidden" });
}
