/**
 * Feedback (CSAT) handler — support-and-help lego.
 *
 * Backs the after_ticket_resolved_hook CSAT request + a standalone feedback
 * form. Ratings are 1–5; an optional free-text comment.
 */

import type { HandlerContext, HandlerResult } from "./_lib/handler";
import { ok, err } from "./_lib/handler";
import type { DbRow } from "./_lib/db";

/** POST /api/support/feedback — submit a CSAT rating (+ optional comment). */
export async function handleSubmitFeedback(
  ctx: HandlerContext,
  body: { ticket_id?: string; user_id?: string; rating?: number; comment?: string },
): Promise<HandlerResult> {
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return err(400, "rating must be an integer 1–5");
  }
  const rows = await ctx.db.query<DbRow>(
    `INSERT INTO support_feedback (ticket_id, user_id, rating, comment)
     VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
    body.ticket_id ?? null,
    body.user_id ?? null,
    rating,
    (body.comment ?? "").trim() || null,
  );
  await ctx.events.publish("support.feedback_submitted", {
    feedback_id: rows[0].id,
    ticket_id: body.ticket_id ?? null,
    rating,
  });
  return ok({ feedback_id: rows[0].id }, 201);
}
