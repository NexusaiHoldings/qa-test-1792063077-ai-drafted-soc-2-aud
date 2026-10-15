/**
 * Outreach-draft handlers — crm-and-lifecycle lego.
 *
 * Stores agent-generated outreach drafts pending salesperson approval
 * (config.outreach.require_approval), then approve/send/discard.
 */

import type { HandlerContext, HandlerResult } from "./_lib/handler";
import { ok, err } from "./_lib/handler";
import type { DbRow } from "./_lib/db";

/** POST /api/crm/contacts/{id}/outreach — store an agent-drafted message. */
export async function handleCreateOutreachDraft(
  ctx: HandlerContext,
  contactId: string,
  body: { channel?: string; subject?: string; body?: string },
): Promise<HandlerResult> {
  if (!contactId) return err(400, "contact id is required");
  const draftBody = (body.body ?? "").trim();
  if (!draftBody) return err(400, "body is required");
  const channel = ["email", "sms", "linkedin"].includes(body.channel ?? "") ? body.channel! : "email";
  const exists = await ctx.db.query<DbRow>(`SELECT id FROM crm_contacts WHERE id = $1`, contactId);
  if (exists.length === 0) return err(404, "contact not found");
  const rows = await ctx.db.query<DbRow>(
    `INSERT INTO crm_outreach_drafts (contact_id, channel, subject, body, status)
     VALUES ($1, $2, $3, $4, 'draft') RETURNING id, status`,
    contactId, channel, body.subject ?? null, draftBody,
  );
  return ok({ draft_id: rows[0].id, status: "draft" }, 201);
}

/** GET /api/crm/outreach?status=draft — list outreach drafts. */
export async function handleListOutreachDrafts(
  ctx: HandlerContext,
  query: { status?: string; limit?: number },
): Promise<HandlerResult> {
  const limit = Math.max(1, Math.min(100, query.limit ?? 50));
  const params: unknown[] = [];
  let clause = "";
  if (query.status) {
    params.push(query.status);
    clause = `WHERE status = $${params.length}`;
  }
  params.push(limit);
  const rows = await ctx.db.query<DbRow>(
    `SELECT id, contact_id, channel, subject, body, status, created_at, sent_at
     FROM crm_outreach_drafts ${clause}
     ORDER BY created_at DESC LIMIT $${params.length}`,
    ...params,
  );
  return ok({ drafts: rows, count: rows.length });
}

/** POST /api/crm/outreach/{id}/approve — approve a draft for sending. */
export async function handleApproveOutreach(
  ctx: HandlerContext,
  draftId: string,
): Promise<HandlerResult> {
  if (!draftId) return err(400, "draft id is required");
  const rows = await ctx.db.query<DbRow>(
    `UPDATE crm_outreach_drafts SET status = 'approved'
     WHERE id = $1 AND status = 'draft' RETURNING id, status`,
    draftId,
  );
  if (rows.length === 0) return err(404, "draft not found or not in draft state");
  return ok({ draft_id: draftId, status: "approved" });
}

/** POST /api/crm/outreach/{id}/sent — mark an approved draft as sent. */
export async function handleMarkOutreachSent(
  ctx: HandlerContext,
  draftId: string,
): Promise<HandlerResult> {
  if (!draftId) return err(400, "draft id is required");
  const rows = await ctx.db.query<DbRow>(
    `UPDATE crm_outreach_drafts SET status = 'sent', sent_at = NOW()
     WHERE id = $1 AND status = 'approved' RETURNING id, contact_id`,
    draftId,
  );
  if (rows.length === 0) return err(404, "draft not found or not approved");
  await ctx.events.publish("outreach.sent", {
    draft_id: draftId, contact_id: rows[0].contact_id,
  });
  return ok({ draft_id: draftId, status: "sent" });
}
