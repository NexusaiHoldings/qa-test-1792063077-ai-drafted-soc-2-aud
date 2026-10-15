/**
 * Support ticket handlers — support-and-help lego.
 *
 * Framework-agnostic: each handler takes a HandlerContext (db + events) and a
 * parsed body, returns a HandlerResult the substrate route wrapper translates
 * to a Next.js Response. SQL uses $1,$2,... (asyncpg-compatible) per the Db
 * abstraction.
 */

import type { HandlerContext, HandlerResult } from "./_lib/handler";
import { ok, err } from "./_lib/handler";
import type { DbRow } from "./_lib/db";

const VALID_PRIORITY = new Set(["low", "normal", "high", "urgent"]);

/** POST /api/support/tickets — open a new ticket + first message. */
export async function handleCreateTicket(
  ctx: HandlerContext,
  body: {
    user_id?: string;
    subject?: string;
    message?: string;
    priority?: string;
    email?: string;
  },
): Promise<HandlerResult> {
  const subject = (body.subject ?? "").trim();
  const message = (body.message ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  if (!subject) return err(400, "subject is required");
  if (!message) return err(400, "message is required");
  const priority = VALID_PRIORITY.has(body.priority ?? "") ? body.priority! : "normal";

  const rows = await ctx.db.query<DbRow>(
    `INSERT INTO support_tickets (user_id, subject, priority, status, assignee_type)
     VALUES ($1, $2, $3, 'open', 'agent')
     RETURNING id, status, priority, created_at`,
    body.user_id ?? null,
    subject,
    priority,
  );
  const ticket = rows[0];
  const ticketId = ticket.id as string;

  await ctx.db.execute(
    `INSERT INTO support_messages (ticket_id, author_type, author_id, body)
     VALUES ($1, 'user', $2, $3)`,
    ticketId,
    body.user_id ?? null,
    message,
  );

  // email + message ride the event so the control plane can draft AND deliver
  // a reply without a cross-DB lookup (same pattern as lead.captured carrying
  // email+name — operations-os-truth-to-checklist-001 Phase 2).
  await ctx.events.publish("ticket.created", {
    ticket_id: ticketId,
    user_id: body.user_id ?? null,
    email: email || null,
    subject,
    message,
    priority,
  });

  return ok({ ticket_id: ticketId, status: ticket.status, priority: ticket.priority }, 201);
}

/** GET /api/support/tickets?user_id= — list a user's tickets (newest first). */
export async function handleListTickets(
  ctx: HandlerContext,
  query: { user_id?: string; status?: string; limit?: number },
): Promise<HandlerResult> {
  const limit = Math.max(1, Math.min(100, query.limit ?? 25));
  const params: unknown[] = [];
  const where: string[] = [];
  if (query.user_id) {
    params.push(query.user_id);
    where.push(`user_id = $${params.length}`);
  }
  if (query.status) {
    params.push(query.status);
    where.push(`status = $${params.length}`);
  }
  params.push(limit);
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await ctx.db.query<DbRow>(
    `SELECT id, subject, status, priority, category, assignee_type, created_at, updated_at
     FROM support_tickets ${clause}
     ORDER BY created_at DESC LIMIT $${params.length}`,
    ...params,
  );
  return ok({ tickets: rows, count: rows.length });
}

/** GET /api/support/tickets/{id} — ticket detail + message thread. */
export async function handleGetTicket(
  ctx: HandlerContext,
  ticketId: string,
): Promise<HandlerResult> {
  if (!ticketId) return err(400, "ticket id is required");
  const tickets = await ctx.db.query<DbRow>(
    `SELECT id, user_id, subject, status, priority, category, assignee_type,
            escalated_at, resolved_at, created_at, updated_at
     FROM support_tickets WHERE id = $1`,
    ticketId,
  );
  if (tickets.length === 0) return err(404, "ticket not found");
  const messages = await ctx.db.query<DbRow>(
    `SELECT id, author_type, author_id, body, is_internal, created_at
     FROM support_messages WHERE ticket_id = $1 ORDER BY created_at ASC`,
    ticketId,
  );
  return ok({ ticket: tickets[0], messages });
}

/** POST /api/support/tickets/{id}/messages — append a message to a thread. */
export async function handleAppendMessage(
  ctx: HandlerContext,
  ticketId: string,
  body: { author_type?: string; author_id?: string; message?: string; is_internal?: boolean },
): Promise<HandlerResult> {
  if (!ticketId) return err(400, "ticket id is required");
  const message = (body.message ?? "").trim();
  if (!message) return err(400, "message is required");
  const authorType = ["user", "agent", "human"].includes(body.author_type ?? "")
    ? body.author_type!
    : "user";

  const exists = await ctx.db.query<DbRow>(
    `SELECT id FROM support_tickets WHERE id = $1`,
    ticketId,
  );
  if (exists.length === 0) return err(404, "ticket not found");

  const rows = await ctx.db.query<DbRow>(
    `INSERT INTO support_messages (ticket_id, author_type, author_id, body, is_internal)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
    ticketId,
    authorType,
    body.author_id ?? null,
    message,
    body.is_internal ?? false,
  );
  await ctx.db.execute(
    `UPDATE support_tickets SET updated_at = NOW(),
        status = CASE WHEN status = 'resolved' THEN 'open' ELSE status END
     WHERE id = $1`,
    ticketId,
  );
  await ctx.events.publish("ticket.message_added", {
    ticket_id: ticketId,
    author_type: authorType,
  });
  return ok({ message_id: rows[0].id, created_at: rows[0].created_at }, 201);
}

/**
 * POST /api/support/tickets/{id}/escalate — flip a ticket to the human queue.
 * This is the server-side mutation behind the escalate_to_human agent tool;
 * the agent tool routes through the runtime approval queue and (on confirm)
 * the runtime calls this endpoint.
 */
export async function handleEscalateTicket(
  ctx: HandlerContext,
  ticketId: string,
  body: { reason?: string; priority_override?: string },
): Promise<HandlerResult> {
  if (!ticketId) return err(400, "ticket id is required");
  const reason = (body.reason ?? "").trim() || "escalated to human queue";

  const tickets = await ctx.db.query<DbRow>(
    `SELECT id, assignee_type FROM support_tickets WHERE id = $1`,
    ticketId,
  );
  if (tickets.length === 0) return err(404, "ticket not found");

  const priorityClause = VALID_PRIORITY.has(body.priority_override ?? "")
    ? `, priority = '${body.priority_override}'`
    : "";
  await ctx.db.execute(
    `UPDATE support_tickets
        SET assignee_type = 'human', escalated_at = NOW(), updated_at = NOW()${priorityClause}
     WHERE id = $1`,
    ticketId,
  );
  await ctx.db.execute(
    `INSERT INTO support_messages (ticket_id, author_type, body, is_internal)
     VALUES ($1, 'agent', $2, TRUE)`,
    ticketId,
    `Escalated to human: ${reason}`,
  );
  await ctx.events.publish("ticket.escalated", { ticket_id: ticketId, reason });
  return ok({ ticket_id: ticketId, escalated: true, assignee_type: "human" });
}

/** POST /api/support/tickets/{id}/resolve — mark a ticket resolved. */
export async function handleResolveTicket(
  ctx: HandlerContext,
  ticketId: string,
): Promise<HandlerResult> {
  if (!ticketId) return err(400, "ticket id is required");
  const rows = await ctx.db.query<DbRow>(
    `UPDATE support_tickets
        SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status <> 'closed'
     RETURNING id, status`,
    ticketId,
  );
  if (rows.length === 0) return err(404, "ticket not found or already closed");
  await ctx.events.publish("ticket.resolved", { ticket_id: ticketId });
  return ok({ ticket_id: ticketId, status: "resolved" });
}
