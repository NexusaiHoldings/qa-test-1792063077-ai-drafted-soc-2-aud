/**
 * Legal documents API.
 *
 * Ported 2026-05-12 from api/documents.py.
 *   GET  /api/legal/documents              — currently-effective doc(s) for doc_type + jurisdiction
 *   GET  /api/legal/documents/{id}         — single doc detail
 *   POST /api/legal/documents/publish      — admin only (X-Admin-Token); create new version
 *
 * Publishes: legal.document_published
 */

import { randomUUID } from "node:crypto";
import { err, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";

const VALID_DOC_TYPES = new Set([
  "terms_of_service",
  "privacy_policy",
  "cookie_policy",
  "accessibility_statement",
]);

const VALID_JURISDICTIONS = new Set(["us", "eu", "uk", "ca", "au", "global"]);

interface DocRow {
  id: string;
  doc_type: string;
  version: string;
  jurisdiction: string;
  content_html: string;
  content_summary: string | null;
  effective_at: string;
  published_by: string | null;
  created_at: string;
}

function serializeDoc(row: DocRow): Record<string, unknown> {
  return {
    id: row.id,
    doc_type: row.doc_type,
    version: row.version,
    jurisdiction: row.jurisdiction,
    content_html: row.content_html,
    content_summary: row.content_summary,
    effective_at: row.effective_at,
    published_by: row.published_by,
    created_at: row.created_at,
  };
}

function checkAdminAuth(
  adminTokenHeader: string | null,
  adminToken: string | undefined,
): boolean {
  const expected = (adminToken || "").trim();
  const provided = (adminTokenHeader || "").trim();
  return expected.length > 0 && provided === expected;
}

// ── handler: list documents ────────────────────────────────────────────────

export interface ListDocumentsInput {
  readonly query: { doc_type?: string; jurisdiction?: string };
  readonly ctx: HandlerContext;
}

export async function handleListDocuments({
  query,
  ctx,
}: ListDocumentsInput): Promise<HandlerResult> {
  const docType = query.doc_type;
  const jurisdiction = query.jurisdiction || "us";

  try {
    const rows = docType
      ? await ctx.db.query<DocRow>(
          "SELECT id, doc_type, version, jurisdiction, content_html, " +
            "content_summary, effective_at, published_by, created_at " +
            "FROM legal_documents WHERE doc_type = $1 AND jurisdiction = $2 " +
            "AND effective_at <= NOW() ORDER BY effective_at DESC LIMIT 1",
          docType,
          jurisdiction,
        )
      : await ctx.db.query<DocRow>(
          "SELECT DISTINCT ON (doc_type, jurisdiction) " +
            "id, doc_type, version, jurisdiction, content_html, " +
            "content_summary, effective_at, published_by, created_at " +
            "FROM legal_documents WHERE jurisdiction = $1 AND effective_at <= NOW() " +
            "ORDER BY doc_type, jurisdiction, effective_at DESC",
          jurisdiction,
        );
    return ok({ documents: rows.map(serializeDoc) });
  } catch {
    return err(500, "internal error");
  }
}

// ── handler: list ALL document versions (admin) ────────────────────────────

export interface ListAllDocumentsInput {
  readonly query: { doc_type?: string; jurisdiction?: string };
  readonly ctx: HandlerContext;
}

/**
 * Admin: list EVERY version of every legal document (not just the
 * currently-effective one that handleListDocuments returns), newest first, so
 * the admin Legal page can show full version history per doc_type. Optional
 * doc_type / jurisdiction filters. content_html is omitted from the list to keep
 * the payload light — fetch a single doc via handleGetDocument for the body.
 */
export async function handleListAllDocuments({
  query,
  ctx,
}: ListAllDocumentsInput): Promise<HandlerResult> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (query.doc_type) {
    params.push(query.doc_type);
    where.push(`doc_type = $${params.length}`);
  }
  if (query.jurisdiction) {
    params.push(query.jurisdiction);
    where.push(`jurisdiction = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  try {
    const rows = await ctx.db.query<Omit<DocRow, "content_html">>(
      "SELECT id, doc_type, version, jurisdiction, content_summary, " +
        "effective_at, published_by, created_at, " +
        "(effective_at <= NOW()) AS is_effective " +
        `FROM legal_documents ${whereSql} ` +
        "ORDER BY doc_type, jurisdiction, effective_at DESC",
      ...params,
    );
    return ok({ documents: rows });
  } catch {
    return err(500, "internal error");
  }
}

// ── handler: get one document ──────────────────────────────────────────────

export interface GetDocumentInput {
  readonly docId: string;
  readonly ctx: HandlerContext;
}

export async function handleGetDocument({
  docId,
  ctx,
}: GetDocumentInput): Promise<HandlerResult> {
  try {
    const rows = await ctx.db.query<DocRow>(
      "SELECT id, doc_type, version, jurisdiction, content_html, " +
        "content_summary, effective_at, published_by, created_at " +
        "FROM legal_documents WHERE id = $1",
      docId,
    );
    if (rows.length === 0) return err(404, "document not found");
    return ok({ document: serializeDoc(rows[0]) });
  } catch {
    return err(500, "internal error");
  }
}

// ── handler: publish document (admin only) ─────────────────────────────────

export interface PublishDocumentInput {
  readonly adminTokenHeader: string | null;
  readonly adminToken: string | undefined;
  readonly body: {
    doc_type?: string;
    version?: string;
    jurisdiction?: string;
    content_html?: string;
    content_summary?: string;
    effective_at?: string;
    published_by?: string;
    force_reacknowledge?: boolean;
  };
  readonly ctx: HandlerContext;
}

export async function handlePublishDocument({
  adminTokenHeader,
  adminToken,
  body,
  ctx,
}: PublishDocumentInput): Promise<HandlerResult> {
  if (!checkAdminAuth(adminTokenHeader, adminToken)) {
    return err(403, "admin access required");
  }

  const required: Array<keyof typeof body> = [
    "doc_type",
    "version",
    "jurisdiction",
    "content_html",
    "effective_at",
  ];
  const missing = required.filter((f) => !body[f]);
  if (missing.length > 0) return err(400, `missing fields: ${missing.join(",")}`);

  if (!VALID_DOC_TYPES.has(body.doc_type!)) {
    return err(400, `invalid doc_type; must be one of ${[...VALID_DOC_TYPES].sort().join(",")}`);
  }
  if (!VALID_JURISDICTIONS.has(body.jurisdiction!)) {
    return err(400, `invalid jurisdiction; must be one of ${[...VALID_JURISDICTIONS].sort().join(",")}`);
  }

  const docId = randomUUID();
  const forceReack = body.force_reacknowledge === true;

  try {
    await ctx.db.execute(
      "INSERT INTO legal_documents " +
        "(id, doc_type, version, jurisdiction, content_html, content_summary, effective_at, published_by) " +
        "VALUES ($1, $2, $3, $4, $5, $6, $7, $8) " +
        "ON CONFLICT (doc_type, version, jurisdiction) DO NOTHING",
      docId,
      body.doc_type,
      body.version,
      body.jurisdiction,
      body.content_html,
      body.content_summary || null,
      body.effective_at,
      body.published_by || null,
    );
    if (forceReack) {
      await ctx.db.execute(
        "DELETE FROM legal_acknowledgments WHERE doc_id = $1",
        docId,
      );
    }
  } catch {
    return err(500, "internal error");
  }

  await ctx.events.publish("legal.document_published", {
    doc_id: docId,
    doc_type: body.doc_type,
    version: body.version,
    jurisdiction: body.jurisdiction,
    force_reacknowledge: forceReack,
  });

  return ok({ status: "published", doc_id: docId }, 201);
}
