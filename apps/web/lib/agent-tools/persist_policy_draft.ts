/**
 * Company-local agent tool: `persist_policy_draft`.
 *
 * Confirm-gated mutation. After the agent drafts a SOC 2 policy (evidence-
 * anchored, structured JSON from the Nexus gateway) the draft is routed through
 * the cross-boundary approval bridge. Because autonomy is `confirm`, by the time
 * this handler runs a human reviewer has already approved the write.
 *
 * Effect (all organization_id-scoped, per @nexus/organizations-and-teams):
 *   1. Insert ONE immutable `soc2_policy_versions` row (the draft snapshot).
 *   2. Insert N `soc2_policy_clause_anchors` rows binding clauses of that
 *      version to the Trust Services Criteria / evidence artifacts they cite.
 *   3. Flip the owning `soc2_policy_documents` row to `status = 'in_review'`
 *      and point `current_version_id` at the new version.
 *
 * Signature matches the lego handler shape DOMAIN_DISPATCH expects:
 *   (ctx: HandlerContext, args: Args) => Promise<HandlerResult>
 *
 * All writes use parameterized SQL ($1, $2, ...) — never interpolation — and
 * UUID primary keys only.
 */

import type { HandlerContext, HandlerResult } from "@nexus/identity-and-access";
import { randomUUID } from "node:crypto";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type Args = {
  organization_id?: unknown;
  policy_document_id?: unknown;
  title?: unknown;
  body_markdown?: unknown;
  summary?: unknown;
  model?: unknown;
  source_run_id?: unknown;
  draft_metadata?: unknown;
  clause_anchors?: unknown;
};

type ClauseAnchor = {
  clause_key: string | null;
  criterion_code: string | null;
  evidence_artifact_id: string | null;
  evidence_snippet: string | null;
  rationale: string | null;
  confidence: number | null;
  metadata: Record<string, JsonValue>;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asJsonObject(value: unknown): Record<string, JsonValue> {
  const obj = asObject(value);
  return obj ? (obj as Record<string, JsonValue>) : {};
}

function orgIdFromContext(ctx: HandlerContext): string | null {
  const maybeCtx = ctx as unknown as Record<string, unknown>;

  const direct = normalizeString(maybeCtx.organization_id);
  if (direct) return direct;

  const org = asObject(maybeCtx.organization);
  if (org) {
    const orgId = normalizeString(org.id);
    if (orgId) return orgId;
  }

  const session = asObject(maybeCtx.session);
  if (session) {
    const sessionOrgId = normalizeString(session.organization_id);
    if (sessionOrgId) return sessionOrgId;
    const sessionOrg = asObject(session.organization);
    if (sessionOrg) {
      const nested = normalizeString(sessionOrg.id);
      if (nested) return nested;
    }
  }

  return null;
}

/**
 * Parse + normalize the clause-anchor array. An anchor is only meaningful when
 * it names what it anchors to (a clause key or a criterion code); anything
 * emptier than that is dropped.
 */
function toClauseAnchors(value: unknown): { anchors: ClauseAnchor[]; skipped: number } {
  if (!Array.isArray(value)) {
    return { anchors: [], skipped: 0 };
  }

  const anchors: ClauseAnchor[] = [];
  let skipped = 0;

  for (const item of value) {
    const obj = asObject(item);
    if (!obj) {
      skipped += 1;
      continue;
    }

    const clauseKey = normalizeString(obj.clause_key);
    const criterionCode = normalizeString(obj.criterion_code);
    if (!clauseKey && !criterionCode) {
      skipped += 1;
      continue;
    }

    const rawConfidence = obj.confidence;
    const confidence =
      typeof rawConfidence === "number" && Number.isFinite(rawConfidence)
        ? Math.min(1, Math.max(0, rawConfidence))
        : null;

    anchors.push({
      clause_key: clauseKey,
      criterion_code: criterionCode,
      evidence_artifact_id: normalizeString(obj.evidence_artifact_id),
      evidence_snippet: normalizeString(obj.evidence_snippet),
      rationale: normalizeString(obj.rationale),
      confidence,
      metadata: asJsonObject(obj.metadata),
    });
  }

  return { anchors, skipped };
}

export async function handlePersistPolicyDraft(
  ctx: HandlerContext,
  args: Args,
): Promise<HandlerResult> {
  const organizationId =
    normalizeString(args.organization_id) ?? orgIdFromContext(ctx);
  if (!organizationId) {
    return { status: 400, body: "organization_id is required" };
  }

  const policyDocumentId = normalizeString(args.policy_document_id);
  if (!policyDocumentId) {
    return { status: 400, body: "policy_document_id is required" };
  }

  const title = normalizeString(args.title);
  const bodyMarkdown =
    typeof args.body_markdown === "string" && args.body_markdown.trim().length > 0
      ? args.body_markdown
      : null;
  if (!title || !bodyMarkdown) {
    return { status: 400, body: "title and body_markdown are required" };
  }

  const summary = normalizeString(args.summary);
  const model = normalizeString(args.model);
  const sourceRunId = normalizeString(args.source_run_id);
  const draftMetadata = asJsonObject(args.draft_metadata);
  const { anchors, skipped } = toClauseAnchors(args.clause_anchors);

  // Guard: the document must exist and belong to this tenant before we snapshot
  // a version against it — prevents orphan versions and cross-tenant writes.
  let documentRows: Array<{ id: string }>;
  try {
    documentRows = await ctx.db.query<{ id: string }>(
      `SELECT id
         FROM soc2_policy_documents
        WHERE id = $1::uuid
          AND organization_id = $2::uuid`,
      policyDocumentId,
      organizationId,
    );
  } catch {
    return { status: 500, body: "failed to load policy document" };
  }

  if (documentRows.length === 0) {
    return { status: 404, body: "policy document not found" };
  }

  const versionId = randomUUID();

  try {
    await ctx.db.execute(
      `INSERT INTO soc2_policy_versions
         (id, organization_id, policy_document_id, title, body_markdown,
          summary, model, source_run_id, status, metadata, created_at)
       VALUES
         ($1::uuid, $2::uuid, $3::uuid, $4, $5,
          $6, $7, $8, 'in_review', $9::jsonb, NOW())`,
      versionId,
      organizationId,
      policyDocumentId,
      title,
      bodyMarkdown,
      summary,
      model,
      sourceRunId,
      JSON.stringify(draftMetadata),
    );

    for (const anchor of anchors) {
      await ctx.db.execute(
        `INSERT INTO soc2_policy_clause_anchors
           (id, organization_id, policy_document_id, policy_version_id,
            clause_key, criterion_code, evidence_artifact_id, evidence_snippet,
            rationale, confidence, metadata, created_at)
         VALUES
           ($1::uuid, $2::uuid, $3::uuid, $4::uuid,
            $5, $6, $7, $8,
            $9, $10, $11::jsonb, NOW())`,
        randomUUID(),
        organizationId,
        policyDocumentId,
        versionId,
        anchor.clause_key,
        anchor.criterion_code,
        anchor.evidence_artifact_id,
        anchor.evidence_snippet,
        anchor.rationale,
        anchor.confidence,
        JSON.stringify(anchor.metadata),
      );
    }

    const updatedRows = await ctx.db.query<{ id: string }>(
      `UPDATE soc2_policy_documents
          SET status = 'in_review',
              current_version_id = $3::uuid,
              updated_at = NOW()
        WHERE id = $1::uuid
          AND organization_id = $2::uuid
      RETURNING id`,
      policyDocumentId,
      organizationId,
      versionId,
    );

    if (updatedRows.length === 0) {
      // The document vanished between the guard read and this update.
      return { status: 404, body: "policy document not found" };
    }
  } catch {
    return { status: 500, body: "failed to persist policy draft" };
  }

  await ctx.events.publish("soc2.policy_draft_persisted", {
    organization_id: organizationId,
    policy_document_id: policyDocumentId,
    policy_version_id: versionId,
    status: "in_review",
    anchors_persisted: anchors.length,
    anchors_skipped: skipped,
  });

  return {
    status: 200,
    body: {
      autonomy: "confirm",
      policy_document_id: policyDocumentId,
      policy_version_id: versionId,
      status: "in_review",
      anchors_persisted: anchors.length,
      anchors_skipped: skipped,
    },
  };
}
