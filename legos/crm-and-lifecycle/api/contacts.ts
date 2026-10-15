/**
 * Contact + lead handlers — crm-and-lifecycle lego. Framework-agnostic.
 */

import type { HandlerContext, HandlerResult } from "./_lib/handler";
import { ok, err } from "./_lib/handler";
import type { DbRow } from "./_lib/db";

const VALID_STAGE = new Set(["new", "contacted", "qualified", "proposal", "won", "lost"]);

/** POST /api/crm/leads — capture a lead (slot: lead_capture_form). */
export async function handleCaptureLead(
  ctx: HandlerContext,
  body: { name?: string; email?: string; company?: string; source?: string; owner_user_id?: string },
): Promise<HandlerResult> {
  const name = (body.name ?? "").trim();
  if (!name) return err(400, "name is required");
  const rows = await ctx.db.query<DbRow>(
    `INSERT INTO crm_contacts (owner_user_id, name, email, company, source, stage)
     VALUES ($1, $2, $3, $4, $5, 'new')
     RETURNING id, stage, lead_score`,
    body.owner_user_id ?? null,
    name,
    body.email ?? null,
    body.company ?? null,
    body.source ?? "lead_form",
  );
  const contactId = rows[0].id as string;
  // email + name ride on the event so the control plane can enroll the lead
  // in the welcome sequence without a cross-DB lookup (email-lead-bridge-001;
  // contact_id alone is unresolvable outside this company's own DB).
  await ctx.events.publish("lead.captured", {
    contact_id: contactId,
    email: body.email ?? null,
    name,
    source: body.source ?? "lead_form",
  });
  return ok({ contact_id: contactId, stage: "new" }, 201);
}

/** GET /api/crm/contacts — list contacts (stage filter, score-ordered). */
export async function handleListContacts(
  ctx: HandlerContext,
  query: { stage?: string; owner_user_id?: string; limit?: number },
): Promise<HandlerResult> {
  const limit = Math.max(1, Math.min(200, query.limit ?? 50));
  const params: unknown[] = [];
  const where: string[] = [];
  if (query.stage && VALID_STAGE.has(query.stage)) {
    params.push(query.stage);
    where.push(`stage = $${params.length}`);
  }
  if (query.owner_user_id) {
    params.push(query.owner_user_id);
    where.push(`owner_user_id = $${params.length}`);
  }
  params.push(limit);
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await ctx.db.query<DbRow>(
    `SELECT id, name, email, company, source, stage, lead_score, is_hot, tags, updated_at
     FROM crm_contacts ${clause}
     ORDER BY is_hot DESC, lead_score DESC, updated_at DESC LIMIT $${params.length}`,
    ...params,
  );
  return ok({ contacts: rows, count: rows.length });
}

/** GET /api/crm/contacts/{id} — contact detail + interaction history. */
export async function handleGetContact(
  ctx: HandlerContext,
  contactId: string,
): Promise<HandlerResult> {
  if (!contactId) return err(400, "contact id is required");
  const contacts = await ctx.db.query<DbRow>(
    `SELECT * FROM crm_contacts WHERE id = $1`,
    contactId,
  );
  if (contacts.length === 0) return err(404, "contact not found");
  const interactions = await ctx.db.query<DbRow>(
    `SELECT id, kind, direction, body, actor_type, created_at
     FROM crm_interactions WHERE contact_id = $1 ORDER BY created_at DESC LIMIT 100`,
    contactId,
  );
  return ok({ contact: contacts[0], interactions });
}

/** POST /api/crm/contacts/{id}/interactions — log an interaction. */
export async function handleLogInteraction(
  ctx: HandlerContext,
  contactId: string,
  body: { kind?: string; direction?: string; body?: string; actor_type?: string; actor_id?: string },
): Promise<HandlerResult> {
  if (!contactId) return err(400, "contact id is required");
  const kind = body.kind ?? "note";
  if (!["note", "email", "call", "meeting", "stage_change", "outreach"].includes(kind)) {
    return err(400, "invalid kind");
  }
  const exists = await ctx.db.query<DbRow>(`SELECT id FROM crm_contacts WHERE id = $1`, contactId);
  if (exists.length === 0) return err(404, "contact not found");
  const rows = await ctx.db.query<DbRow>(
    `INSERT INTO crm_interactions (contact_id, kind, direction, body, actor_type, actor_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
    contactId, kind, body.direction ?? null, body.body ?? null,
    ["human", "agent", "system"].includes(body.actor_type ?? "") ? body.actor_type : "human",
    body.actor_id ?? null,
  );
  await ctx.db.execute(`UPDATE crm_contacts SET updated_at = NOW() WHERE id = $1`, contactId);
  await ctx.events.publish("contact.interaction_logged", { contact_id: contactId, kind });
  return ok({ interaction_id: rows[0].id }, 201);
}

/**
 * POST /api/crm/contacts/{id}/score — apply the agent's score_lead result.
 * The runtime calls this after score_lead computes; it persists score + hot flag.
 */
export async function handleApplyScore(
  ctx: HandlerContext,
  contactId: string,
  body: { score?: number; hot_threshold?: number },
): Promise<HandlerResult> {
  if (!contactId) return err(400, "contact id is required");
  const score = Math.max(0, Math.min(100, Math.round(Number(body.score) || 0)));
  const isHot = score >= (body.hot_threshold ?? 70);
  const rows = await ctx.db.query<DbRow>(
    `UPDATE crm_contacts SET lead_score = $2, is_hot = $3, updated_at = NOW()
     WHERE id = $1 RETURNING id, lead_score, is_hot`,
    contactId, score, isHot,
  );
  if (rows.length === 0) return err(404, "contact not found");
  return ok({ contact_id: contactId, lead_score: score, is_hot: isHot });
}

/**
 * POST /api/crm/contacts/{id}/advance — move pipeline stage.
 * Server-side mutation behind the advance_contact_stage agent tool (the agent
 * tool routes through approval; on confirm the runtime/app calls this).
 */
export async function handleAdvanceStage(
  ctx: HandlerContext,
  contactId: string,
  body: { to_stage?: string; reason?: string },
): Promise<HandlerResult> {
  if (!contactId) return err(400, "contact id is required");
  const toStage = body.to_stage ?? "";
  if (!VALID_STAGE.has(toStage)) return err(400, "invalid to_stage");
  const rows = await ctx.db.query<DbRow>(
    `UPDATE crm_contacts SET stage = $2, updated_at = NOW() WHERE id = $1 RETURNING id, stage`,
    contactId, toStage,
  );
  if (rows.length === 0) return err(404, "contact not found");
  await ctx.db.execute(
    `INSERT INTO crm_interactions (contact_id, kind, actor_type, body)
     VALUES ($1, 'stage_change', 'agent', $2)`,
    contactId, `Advanced to ${toStage}${body.reason ? `: ${body.reason}` : ""}`,
  );
  await ctx.events.publish("contact.stage_changed", { contact_id: contactId, stage: toStage });
  return ok({ contact_id: contactId, stage: toStage });
}
