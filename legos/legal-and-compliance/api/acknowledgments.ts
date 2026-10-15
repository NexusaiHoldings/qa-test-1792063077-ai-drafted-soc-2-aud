/**
 * Legal acknowledgments API.
 *
 * Ported 2026-05-12 from api/acknowledgments.py.
 *   POST /api/legal/acknowledge               — persist acknowledgment (auth required)
 *   GET  /api/legal/acknowledgments/me        — user's full ack history
 *   GET  /api/legal/acknowledgments/missing/me — currently-effective docs NOT yet acked
 *
 * Publishes: legal.user_acknowledged.
 */

import { randomUUID } from "node:crypto";
import { err, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";

/**
 * User identity comes from the substrate's auth-protected route shim — the
 * substrate's middleware resolves the session-cookie / Bearer-token to a user_id
 * before calling this lego. Handlers receive userId directly.
 */

export interface AcknowledgeInput {
  readonly userId: string | null;
  readonly body: { doc_id?: string };
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly ctx: HandlerContext;
}

export async function handleAcknowledge({
  userId,
  body,
  ipAddress,
  userAgent,
  ctx,
}: AcknowledgeInput): Promise<HandlerResult> {
  if (!userId) return err(401, "authentication required");
  const docId = body.doc_id;
  if (!docId) return err(400, "missing doc_id");

  let docRows: Array<{ id: string; doc_type: string; version: string }>;
  try {
    docRows = await ctx.db.query(
      "SELECT id, doc_type, version FROM legal_documents WHERE id = $1",
      docId,
    );
  } catch {
    return err(500, "internal error");
  }
  if (docRows.length === 0) return err(404, "document not found");

  const doc = docRows[0];
  try {
    await ctx.db.execute(
      "INSERT INTO legal_acknowledgments (id, user_id, doc_id, ip_address, user_agent) " +
        "VALUES ($1, $2, $3, $4, $5) " +
        "ON CONFLICT (user_id, doc_id) DO NOTHING",
      randomUUID(),
      userId,
      docId,
      ipAddress,
      userAgent,
    );
  } catch {
    return err(500, "internal error");
  }

  await ctx.events.publish("legal.user_acknowledged", {
    user_id: userId,
    doc_id: docId,
    doc_type: doc.doc_type,
    version: doc.version,
  });

  return ok({ status: "acknowledged", doc_id: docId });
}

// ── handler: my acknowledgments history ────────────────────────────────────

export interface MyAcknowledgmentsInput {
  readonly userId: string | null;
  readonly ctx: HandlerContext;
}

interface AckRow {
  id: string;
  doc_id: string;
  doc_type: string;
  version: string;
  jurisdiction: string;
  acknowledged_at: string;
}

export async function handleMyAcknowledgments({
  userId,
  ctx,
}: MyAcknowledgmentsInput): Promise<HandlerResult> {
  if (!userId) return err(401, "authentication required");
  try {
    const rows = await ctx.db.query<AckRow>(
      "SELECT la.id, la.doc_id, la.acknowledged_at, " +
        "ld.doc_type, ld.version, ld.jurisdiction " +
        "FROM legal_acknowledgments la " +
        "JOIN legal_documents ld ON ld.id = la.doc_id " +
        "WHERE la.user_id = $1 ORDER BY la.acknowledged_at DESC",
      userId,
    );
    return ok({
      acknowledgments: rows.map((r) => ({
        id: r.id,
        doc_id: r.doc_id,
        doc_type: r.doc_type,
        version: r.version,
        jurisdiction: r.jurisdiction,
        acknowledged_at: r.acknowledged_at,
      })),
    });
  } catch {
    return err(500, "internal error");
  }
}

// ── handler: missing acknowledgments ───────────────────────────────────────

export interface MissingAcknowledgmentsInput {
  readonly userId: string | null;
  readonly query: { jurisdiction?: string };
  readonly ctx: HandlerContext;
}

interface MissingRow {
  id: string;
  doc_type: string;
  version: string;
  jurisdiction: string;
  effective_at: string;
}

export async function handleMissingAcknowledgments({
  userId,
  query,
  ctx,
}: MissingAcknowledgmentsInput): Promise<HandlerResult> {
  if (!userId) return err(401, "authentication required");
  const jurisdiction = query.jurisdiction || "us";

  try {
    const rows = await ctx.db.query<MissingRow>(
      "SELECT DISTINCT ON (ld.doc_type) " +
        "ld.id, ld.doc_type, ld.version, ld.jurisdiction, ld.effective_at " +
        "FROM legal_documents ld " +
        "WHERE ld.jurisdiction = $1 AND ld.effective_at <= NOW() " +
        "AND NOT EXISTS (" +
        "  SELECT 1 FROM legal_acknowledgments la " +
        "  WHERE la.user_id = $2 AND la.doc_id = ld.id" +
        ") " +
        "ORDER BY ld.doc_type, ld.effective_at DESC",
      jurisdiction,
      userId,
    );
    return ok({
      missing: rows.map((r) => ({
        doc_id: r.id,
        doc_type: r.doc_type,
        version: r.version,
        jurisdiction: r.jurisdiction,
        effective_at: r.effective_at,
      })),
      count: rows.length,
    });
  } catch {
    return err(500, "internal error");
  }
}
