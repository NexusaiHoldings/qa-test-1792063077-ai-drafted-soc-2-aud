/**
 * Feedback capture + admin triage/action handlers (feedback-to-build-loop-001).
 *
 * Framework-agnostic: each handler takes a HandlerContext (db + events) plus
 * parsed params and returns a HandlerResult. The substrate route shims
 * (apps/web/app/api/feedback/*) build the context, gate auth, and translate the
 * result. Events are forwarded to the portfolio-runtime by buildEventBus().
 *
 *   POST /feedback                — submit (any signed-in user)
 *   GET  /feedback                — list (admin)
 *   POST /feedback/:id/action     — Build / Revise / Discuss / Decline (admin)
 *   POST /feedback/:id/answer     — answer the pipeline's clarifying question (admin)
 *   PATCH /feedback/:id           — Nexus sync write path (runtime-token gated)
 *
 * Status lifecycle is READ-ONLY in the UI; it reflects the pipeline:
 *   new -> triaged -> building -> done   (+ declined for passed-on items)
 * Discuss leaves an item `triaged` (discussion ongoing, not closed).
 */

import { err, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";

// ── domain constants ───────────────────────────────────────────────────────

export const FEEDBACK_TYPES = ["bug", "edit", "idea"] as const;
export const FEEDBACK_STATUSES = ["new", "triaged", "discuss", "building", "declined", "done"] as const;
export const FEEDBACK_ACTIONS = ["build", "revise", "discuss", "decline"] as const;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number];
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export type FeedbackAction = (typeof FEEDBACK_ACTIONS)[number];

// Lego event subjects (must match the substrate runtime-events.ts allow-list).
export const EVENT_SUBMITTED = "feedback.submitted";
export const EVENT_ACTION = "feedback.action";
export const EVENT_ANSWER = "feedback.answer";

interface FeedbackRow {
  id: string;
  type: string;
  description: string;
  page: string | null;
  status: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  triage: unknown;
  history: unknown;
  requested_action: string | null;
  action_note: string | null;
  action_state: string;
  pending_question: string | null;
  pending_answer: string | null;
  actioned_by: string | null;
  actioned_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface FeedbackUser {
  id?: string | null;
  name?: string | null;
  email?: string | null;
}

/** asyncpg returns jsonb already parsed; pg may return a string. Normalize. */
function asObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Shape a DB row into the camelCase API object the UI consumes. */
function serialize(r: FeedbackRow): Record<string, unknown> {
  return {
    id: r.id,
    type: r.type,
    description: r.description,
    page: r.page,
    status: r.status,
    user: { id: r.user_id, name: r.user_name, email: r.user_email },
    triage: asObject(r.triage),
    history: asArray(r.history),
    requestedAction: r.requested_action,
    actionNote: r.action_note,
    actionState: r.action_state,
    pendingQuestion: r.pending_question,
    pendingAnswer: r.pending_answer,
    actionedBy: r.actioned_by,
    actionedAt: r.actioned_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** A single-element JSON array suitable for `history || $x::jsonb` append. */
function historyEntry(kind: string, detail: string, actor: string | null): string {
  return JSON.stringify([
    { ts: new Date().toISOString(), kind, detail: detail.slice(0, 1000), actor: actor || null },
  ]);
}

async function loadRow(ctx: HandlerContext, id: string): Promise<FeedbackRow | null> {
  const rows = await ctx.db.query<FeedbackRow>(
    "SELECT * FROM feedback WHERE id = $1 LIMIT 1",
    id,
  );
  return rows[0] ?? null;
}

// ── handlers ────────────────────────────────────────────────────────────────

/** POST /feedback — submit feedback. Any signed-in user. */
export async function handleSubmitFeedback(
  ctx: HandlerContext,
  params: { type?: string; description?: string; page?: string; user?: FeedbackUser },
): Promise<HandlerResult> {
  const type = String(params.type || "idea").toLowerCase();
  const description = String(params.description || "").trim();
  const page = params.page ? String(params.page).slice(0, 500) : null;
  const user = params.user || {};

  if (!FEEDBACK_TYPES.includes(type as FeedbackType)) {
    return err(400, `type must be one of ${FEEDBACK_TYPES.join(", ")}`);
  }
  if (!description) {
    return err(400, "description is required");
  }

  const rows = await ctx.db.query<{ id: string; created_at: string }>(
    "INSERT INTO feedback (type, description, page, user_id, user_name, user_email, " +
      "history) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) " +
      "RETURNING id, created_at",
    type,
    description,
    page,
    user.id || null,
    user.name || null,
    user.email || null,
    historyEntry("created", "feedback submitted", user.email || null),
  );
  const created = rows[0];
  if (!created) return err(500, "insert failed");

  // Forward to Nexus for triage (resolved company_id from the bearer token at
  // the runtime ingress). Fire-and-forget.
  await ctx.events.publish(EVENT_SUBMITTED, {
    feedback_id: created.id,
    type,
    description,
    page,
    user_id: user.id || null,
    user_name: user.name || null,
    user_email: user.email || null,
    created_at: created.created_at,
  });

  return ok({ feedback_id: created.id, status: "new" }, 201);
}

/** GET /feedback — list feedback (admin). */
export async function handleListFeedback(
  ctx: HandlerContext,
  params: { status?: string; limit?: number } = {},
): Promise<HandlerResult> {
  const limit = Math.min(Math.max(Number(params.limit) || 200, 1), 500);
  const status = params.status && FEEDBACK_STATUSES.includes(params.status as FeedbackStatus)
    ? params.status
    : null;

  const rows = status
    ? await ctx.db.query<FeedbackRow>(
        "SELECT * FROM feedback WHERE status = $1 ORDER BY created_at DESC LIMIT $2",
        status,
        limit,
      )
    : await ctx.db.query<FeedbackRow>(
        "SELECT * FROM feedback ORDER BY created_at DESC LIMIT $1",
        limit,
      );

  return ok({ feedback: rows.map(serialize) });
}

/**
 * POST /feedback/:id/action — admin acts on a feedback item.
 *
 * build/revise → fire the change-request pipeline (status `building`).
 * decline      → terminal `declined` (re-actionable).
 * discuss      → leaves `triaged`, records a note.
 *
 * High-risk items (triage.requiresChairman) require isChairman === true to
 * Build/Revise. Idempotent: one in-flight action per item.
 */
export async function handleFeedbackAction(
  ctx: HandlerContext,
  params: {
    id: string;
    action?: string;
    note?: string;
    actor?: string;
    isChairman?: boolean;
  },
): Promise<HandlerResult> {
  const action = String(params.action || "").toLowerCase();
  const note = params.note ? String(params.note).trim() : "";
  const actor = params.actor || null;

  if (!FEEDBACK_ACTIONS.includes(action as FeedbackAction)) {
    return err(400, `action must be one of ${FEEDBACK_ACTIONS.join(", ")}`);
  }

  const row = await loadRow(ctx, params.id);
  if (!row) return err(404, "feedback not found");

  const triage = asObject(row.triage);
  const requiresChairman = triage.requiresChairman === true;

  if (action === "build" || action === "revise") {
    if (action === "revise" && !note) {
      return err(400, "a note is required to revise");
    }
    if (requiresChairman && params.isChairman !== true) {
      return err(403, "requires_chairman");
    }
    if (row.action_state === "in_flight") {
      return err(409, "an action is already in flight for this item");
    }

    await ctx.db.execute(
      "UPDATE feedback SET status = 'building', action_state = 'in_flight', " +
        "requested_action = $2, action_note = $3, actioned_by = $4, " +
        "actioned_at = NOW(), updated_at = NOW(), " +
        "history = history || $5::jsonb WHERE id = $1",
      params.id,
      action,
      note || null,
      actor,
      historyEntry("action", `${action} approved${note ? `: ${note}` : ""}`, actor),
    );

    await ctx.events.publish(EVENT_ACTION, {
      feedback_id: params.id,
      action,
      note: note || null,
      actor,
      type: row.type,
      description: row.description,
      page: row.page,
      triage,
      requires_chairman: requiresChairman,
      chairman_approved: requiresChairman ? params.isChairman === true : false,
    });
  } else if (action === "decline") {
    await ctx.db.execute(
      "UPDATE feedback SET status = 'declined', action_state = 'declined', " +
        "requested_action = 'decline', action_note = $2, actioned_by = $3, " +
        "actioned_at = NOW(), updated_at = NOW(), " +
        "history = history || $4::jsonb WHERE id = $1",
      params.id,
      note || null,
      actor,
      historyEntry("action", `declined${note ? `: ${note}` : ""}`, actor),
    );
  } else {
    // discuss — leaves status triaged; records the admin's note.
    await ctx.db.execute(
      "UPDATE feedback SET requested_action = 'discuss', action_note = $2, " +
        "actioned_by = $3, actioned_at = NOW(), updated_at = NOW(), " +
        "history = history || $4::jsonb WHERE id = $1",
      params.id,
      note || null,
      actor,
      historyEntry("discuss", note || "discussion", actor),
    );
    await ctx.events.publish(EVENT_ACTION, {
      feedback_id: params.id,
      action,
      note: note || null,
      actor,
      type: row.type,
      description: row.description,
      page: row.page,
      triage,
    });
  }

  const updated = await loadRow(ctx, params.id);
  return ok({ feedback: updated ? serialize(updated) : null });
}

/** POST /feedback/:id/answer — admin answers the pipeline's clarifying question. */
export async function handleAnswer(
  ctx: HandlerContext,
  params: { id: string; answer?: string; actor?: string },
): Promise<HandlerResult> {
  const answer = String(params.answer || "").trim();
  const actor = params.actor || null;
  if (!answer) return err(400, "answer is required");

  const row = await loadRow(ctx, params.id);
  if (!row) return err(404, "feedback not found");

  await ctx.db.execute(
    "UPDATE feedback SET pending_answer = $2, pending_question = NULL, " +
      "updated_at = NOW(), history = history || $3::jsonb WHERE id = $1",
    params.id,
    answer,
    historyEntry("answer", answer, actor),
  );

  await ctx.events.publish(EVENT_ANSWER, {
    feedback_id: params.id,
    answer,
    actor,
  });

  const updated = await loadRow(ctx, params.id);
  return ok({ feedback: updated ? serialize(updated) : null });
}

/**
 * PATCH /feedback/:id — Nexus sync write path. The portfolio-runtime writes
 * triage results, status reconciliation, and clarifying questions back into the
 * company DB row. The ROUTE gates this with the per-company runtime token
 * (server-to-server); this handler just applies a whitelisted partial update.
 */
export async function handleSyncFeedback(
  ctx: HandlerContext,
  params: { id: string; patch?: Record<string, unknown> },
): Promise<HandlerResult> {
  const patch = params.patch || {};
  const row = await loadRow(ctx, params.id);
  if (!row) return err(404, "feedback not found");

  const sets: string[] = [];
  const values: unknown[] = [params.id];
  let n = 2;

  if (typeof patch.status === "string") {
    if (!FEEDBACK_STATUSES.includes(patch.status as FeedbackStatus)) {
      return err(400, `invalid status ${patch.status}`);
    }
    sets.push(`status = $${n++}`);
    values.push(patch.status);
  }
  if (patch.triage !== undefined && patch.triage !== null) {
    sets.push(`triage = $${n++}::jsonb`);
    values.push(JSON.stringify(patch.triage));
  }
  if (typeof patch.action_state === "string") {
    sets.push(`action_state = $${n++}`);
    values.push(patch.action_state);
  }
  if (patch.pending_question !== undefined) {
    sets.push(`pending_question = $${n++}`);
    values.push(patch.pending_question === null ? null : String(patch.pending_question));
  }
  if (typeof patch.requested_action === "string") {
    sets.push(`requested_action = $${n++}`);
    values.push(patch.requested_action);
  }

  const hasHistory = Array.isArray(patch.history);
  if (sets.length === 0 && !hasHistory) {
    return err(400, "no recognized fields to update");
  }

  // History assignment — EXACTLY ONE (Postgres rejects two assignments to the
  // same column in one UPDATE). When Nexus syncs the whole thread (its discussion
  // turns + the converged recommendation, control-plane-side), full-REPLACE with
  // it — that array already carries the complete audited history. Otherwise append
  // a lightweight sync audit entry.
  if (hasHistory) {
    sets.push(`history = $${n++}::jsonb`);
    values.push(JSON.stringify(patch.history));
  } else {
    sets.push(`history = history || $${n++}::jsonb`);
    values.push(historyEntry("sync", String(patch.note || "nexus sync"), "nexus"));
  }
  sets.push("updated_at = NOW()");

  await ctx.db.execute(
    `UPDATE feedback SET ${sets.join(", ")} WHERE id = $1`,
    ...values,
  );

  const updated = await loadRow(ctx, params.id);
  return ok({ feedback: updated ? serialize(updated) : null });
}
