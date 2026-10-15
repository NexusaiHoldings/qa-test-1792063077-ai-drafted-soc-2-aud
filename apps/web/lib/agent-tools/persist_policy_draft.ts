import crypto from "node:crypto";
import type { HandlerContext, HandlerResult } from "@nexus/identity-and-access";

type JsonRecord = Record<string, unknown>;

type ClauseAnchorInput = {
  criterionCode: string;
  evidenceArtifactId?: string | null;
  evidenceExcerpt?: string | null;
  rationale?: string | null;
  confidence?: number | null;
};

type Args = {
  organization_id?: string;
  policy_document_id?: string;
  title?: string | null;
  body_markdown?: string;
  model_name?: string | null;
  model_version?: string | null;
  draft_summary?: string | null;
  change_notes?: string | null;
  clause_anchors?: ClauseAnchorInput[] | null;
  approval_token?: string;
  actor_user_id?: string | null;
  metadata?: JsonRecord | null;
};

type QueryableClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
};

function asClient(ctx: HandlerContext): QueryableClient {
  const maybeDb = (ctx as unknown as { db?: QueryableClient }).db;
  if (!maybeDb || typeof maybeDb.query !== "function") {
    throw new Error("handler_context_missing_db_query");
  }
  return maybeDb;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeAnchors(value: unknown): ClauseAnchorInput[] {
  if (!Array.isArray(value)) return [];
  const out: ClauseAnchorInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const criterionCode = asString(obj.criterionCode);
    if (!criterionCode) continue;
    out.push({
      criterionCode,
      evidenceArtifactId: asString(obj.evidenceArtifactId),
      evidenceExcerpt: asString(obj.evidenceExcerpt),
      rationale: asString(obj.rationale),
      confidence: asNumber(obj.confidence),
    });
  }
  return out;
}

function ensureConfirmGate(args: Args): void {
  const token = asString(args.approval_token);
  if (!token) {
    throw new Error("confirm_required_missing_approval_token");
  }
}

export async function handlePersistPolicyDraft(
  ctx: HandlerContext,
  args: Args,
): Promise<HandlerResult> {
  try {
    ensureConfirmGate(args);

    const organizationId = asString(args.organization_id);
    const policyDocumentId = asString(args.policy_document_id);
    const bodyMarkdown = asString(args.body_markdown);

    if (!organizationId) throw new Error("organization_id_required");
    if (!policyDocumentId) throw new Error("policy_document_id_required");
    if (!bodyMarkdown) throw new Error("body_markdown_required");

    const title = asString(args.title);
    const modelName = asString(args.model_name);
    const modelVersion = asString(args.model_version);
    const draftSummary = asString(args.draft_summary);
    const changeNotes = asString(args.change_notes);
    const actorUserId = asString(args.actor_user_id);
    const metadata = args.metadata && typeof args.metadata === "object" ? args.metadata : {};
    const anchors = normalizeAnchors(args.clause_anchors);

    const db = asClient(ctx);

    await db.query("BEGIN");

    const documentCheck = await db.query(
      `
      SELECT id
      FROM soc2_policy_documents
      WHERE id = $1 AND organization_id = $2
      LIMIT 1
      `,
      [policyDocumentId, organizationId],
    );

    if (documentCheck.rows.length === 0) {
      throw new Error("policy_document_not_found");
    }

    const policyVersionId = crypto.randomUUID();

    await db.query(
      `
      INSERT INTO soc2_policy_versions (
        id,
        organization_id,
        policy_document_id,
        title,
        body_markdown,
        draft_summary,
        change_notes,
        model_name,
        model_version,
        created_by_user_id,
        created_at,
        metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11::jsonb
      )
      `,
      [
        policyVersionId,
        organizationId,
        policyDocumentId,
        title,
        bodyMarkdown,
        draftSummary,
        changeNotes,
        modelName,
        modelVersion,
        actorUserId,
        JSON.stringify(metadata),
      ],
    );

    for (const anchor of anchors) {
      await db.query(
        `
        INSERT INTO soc2_policy_clause_anchors (
          id,
          organization_id,
          policy_version_id,
          criterion_code,
          evidence_artifact_id,
          evidence_excerpt,
          rationale,
          confidence,
          created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, NOW()
        )
        `,
        [
          crypto.randomUUID(),
          organizationId,
          policyVersionId,
          anchor.criterionCode,
          anchor.evidenceArtifactId ?? null,
          anchor.evidenceExcerpt ?? null,
          anchor.rationale ?? null,
          anchor.confidence ?? null,
        ],
      );
    }

    await db.query(
      `
      UPDATE soc2_policy_documents
      SET status = 'in_review',
          current_draft_version_id = $1,
          updated_at = NOW()
      WHERE id = $2 AND organization_id = $3
      `,
      [policyVersionId, policyDocumentId, organizationId],
    );

    await db.query("COMMIT");

    return {
      ok: true,
      tool: "persist_policy_draft",
      data: {
        organization_id: organizationId,
        policy_document_id: policyDocumentId,
        policy_version_id: policyVersionId,
        anchor_count: anchors.length,
        document_status: "in_review",
      },
    } as HandlerResult;
  } catch (error) {
    try {
      const db = asClient(ctx);
      await db.query("ROLLBACK");
    } catch {
      // no-op rollback fallback
    }

    const message = error instanceof Error ? error.message : "persist_policy_draft_failed";
    return {
      ok: false,
      tool: "persist_policy_draft",
      error: {
        code: "persist_policy_draft_failed",
        message,
      },
    } as HandlerResult;
  }
}
