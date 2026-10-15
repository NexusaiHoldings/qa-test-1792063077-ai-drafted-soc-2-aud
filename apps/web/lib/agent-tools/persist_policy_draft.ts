import type { HandlerContext, HandlerResult } from "@nexus/identity-and-access";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type Args = {
  organizationId?: string;
  policyDocumentId?: string;
  title?: string;
  bodyMarkdown?: string;
  summary?: string;
  model?: string;
  sourceRunId?: string;
  draftMetadata?: Record<string, JsonValue>;
  clauseAnchors?: Array<{
    clauseKey?: string;
    criterionCode?: string;
    evidenceArtifactId?: string;
    evidenceSnippet?: string;
    rationale?: string;
    confidence?: number;
    metadata?: Record<string, JsonValue>;
  }>;
};

type DbExecResult = {
  rows?: Array<Record<string, unknown>>;
  rowCount?: number;
};

type DbLike = {
  query: (sql: string, params?: unknown[]) => Promise<DbExecResult>;
};

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function toDb(ctx: HandlerContext): DbLike | null {
  const maybeDb = asObject(ctx).db;
  if (maybeDb && typeof (maybeDb as DbLike).query === "function") {
    return maybeDb as DbLike;
  }
  return null;
}

function pickOrganizationId(ctx: HandlerContext, args: Args): string | null {
  if (typeof args.organizationId === "string" && args.organizationId.trim().length > 0) {
    return args.organizationId.trim();
  }
  const c = asObject(ctx);
  const direct =
    c.organizationId ??
    c.orgId ??
    asObject(c.session).organizationId ??
    asObject(c.session).orgId ??
    asObject(asObject(c.session).user).organizationId ??
    asObject(asObject(c.session).user).orgId;

  return typeof direct === "string" && direct.trim().length > 0 ? direct.trim() : null;
}

function badRequest(message: string): HandlerResult {
  return {
    ok: false,
    error: { code: "bad_request", message },
  } as HandlerResult;
}

function serverError(message: string): HandlerResult {
  return {
    ok: false,
    error: { code: "internal_error", message },
  } as HandlerResult;
}

export async function handlePersistPolicyDraft(
  ctx: HandlerContext,
  args: Args,
): Promise<HandlerResult> {
  const db = toDb(ctx);
  if (!db) {
    return serverError("Database client unavailable on handler context.");
  }

  const organizationId = pickOrganizationId(ctx, args);
  if (!organizationId) {
    return badRequest("organizationId is required.");
  }

  const policyDocumentId =
    typeof args.policyDocumentId === "string" ? args.policyDocumentId.trim() : "";
  if (!policyDocumentId) {
    return badRequest("policyDocumentId is required.");
  }

  const title = typeof args.title === "string" ? args.title.trim() : "";
  const bodyMarkdown = typeof args.bodyMarkdown === "string" ? args.bodyMarkdown : "";
  if (!title || !bodyMarkdown) {
    return badRequest("title and bodyMarkdown are required.");
  }

  const summary = typeof args.summary === "string" ? args.summary : null;
  const model = typeof args.model === "string" ? args.model : null;
  const sourceRunId = typeof args.sourceRunId === "string" ? args.sourceRunId : null;
  const draftMetadata = args.draftMetadata ?? {};
  const clauseAnchors = Array.isArray(args.clauseAnchors) ? args.clauseAnchors : [];

  await db.query("BEGIN");
  try {
    const insertedVersion = await db.query(
      `
      INSERT INTO soc2_policy_versions (
        organization_id,
        policy_document_id,
        title,
        body_markdown,
        summary,
        model,
        source_run_id,
        metadata,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
      RETURNING id
      `,
      [
        organizationId,
        policyDocumentId,
        title,
        bodyMarkdown,
        summary,
        model,
        sourceRunId,
        JSON.stringify(draftMetadata),
      ],
    );

    const versionId = insertedVersion.rows?.[0]?.id;
    if (typeof versionId !== "string" || versionId.length === 0) {
      throw new Error("Failed to create policy version.");
    }

    for (const anchor of clauseAnchors) {
      if (!anchor || typeof anchor !== "object") continue;

      const clauseKey = typeof anchor.clauseKey === "string" ? anchor.clauseKey : null;
      const criterionCode =
        typeof anchor.criterionCode === "string" ? anchor.criterionCode : null;
      const evidenceArtifactId =
        typeof anchor.evidenceArtifactId === "string" ? anchor.evidenceArtifactId : null;
      const evidenceSnippet =
        typeof anchor.evidenceSnippet === "string" ? anchor.evidenceSnippet : null;
      const rationale = typeof anchor.rationale === "string" ? anchor.rationale : null;
      const confidence =
        typeof anchor.confidence === "number" && Number.isFinite(anchor.confidence)
          ? anchor.confidence
          : null;
      const metadata = anchor.metadata ?? {};

      await db.query(
        `
        INSERT INTO soc2_policy_clause_anchors (
          organization_id,
          policy_document_id,
          policy_version_id,
          clause_key,
          criterion_code,
          evidence_artifact_id,
          evidence_snippet,
          rationale,
          confidence,
          metadata,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW())
        `,
        [
          organizationId,
          policyDocumentId,
          versionId,
          clauseKey,
          criterionCode,
          evidenceArtifactId,
          evidenceSnippet,
          rationale,
          confidence,
          JSON.stringify(metadata),
        ],
      );
    }

    await db.query(
      `
      UPDATE soc2_policy_documents
      SET
        status = 'in_review',
        current_version_id = $3,
        updated_at = NOW()
      WHERE organization_id = $1
        AND id = $2
      `,
      [organizationId, policyDocumentId, versionId],
    );

    await db.query("COMMIT");

    return {
      ok: true,
      data: {
        policyDocumentId,
        policyVersionId: versionId,
        status: "in_review",
        anchorsPersisted: clauseAnchors.length,
      },
    } as HandlerResult;
  } catch (error: unknown) {
    await db.query("ROLLBACK");
    return {
      ok: false,
      error: {
        code: "internal_error",
        message: error instanceof Error ? error.message : "Failed to persist policy draft.",
      },
    } as HandlerResult;
  }
}
