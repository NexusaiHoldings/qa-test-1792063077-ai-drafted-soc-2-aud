import type { HandlerContext, HandlerResult } from "@nexus/identity-and-access";
import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db";

type Args = {
  organizationId?: unknown;
  policyVersionId?: unknown;
  policyVersionNumber?: unknown;
  auditorFirm?: unknown;
  outcome?: unknown;
  revisionNotes?: unknown;
  acceptedByUserId?: unknown;
};

type DbResultRow = Record<string, unknown>;

const ALLOWED_OUTCOMES = new Set(["accepted", "rejected", "needs_revision"]);

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toErrorResult(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): HandlerResult {
  return {
    ok: false,
    code,
    message,
    ...(details ? { details } : {}),
  };
}

export async function handleRecordAuditorAcceptance(
  ctx: HandlerContext,
  args: Args,
): Promise<HandlerResult> {
  const organizationId =
    asNonEmptyString(args.organizationId) ??
    asNonEmptyString((ctx as { organizationId?: unknown }).organizationId);

  const policyVersionId = asNonEmptyString(args.policyVersionId);
  const policyVersionNumber = asNullableString(args.policyVersionNumber);
  const auditorFirm = asNonEmptyString(args.auditorFirm);
  const outcome = asNonEmptyString(args.outcome)?.toLowerCase() ?? null;
  const revisionNotes = asNullableString(args.revisionNotes);

  const acceptedByUserId =
    asNonEmptyString(args.acceptedByUserId) ??
    asNonEmptyString((ctx as { userId?: unknown }).userId);

  if (!organizationId) {
    return toErrorResult("invalid_args", "organizationId is required");
  }

  if (!policyVersionId) {
    return toErrorResult("invalid_args", "policyVersionId is required");
  }

  if (!auditorFirm) {
    return toErrorResult("invalid_args", "auditorFirm is required");
  }

  if (!outcome || !ALLOWED_OUTCOMES.has(outcome)) {
    return toErrorResult(
      "invalid_args",
      "outcome must be one of: accepted, rejected, needs_revision",
    );
  }

  if (!acceptedByUserId) {
    return toErrorResult(
      "invalid_args",
      "acceptedByUserId is required (or must be present in ctx.userId)",
    );
  }

  try {
    const policyVersionRows = (await sql<DbResultRow[]>`
      SELECT id, organization_id
      FROM soc2_policy_versions
      WHERE id = ${policyVersionId}
        AND organization_id = ${organizationId}
      LIMIT 1
    `) as DbResultRow[];

    if (!Array.isArray(policyVersionRows) || policyVersionRows.length === 0) {
      return toErrorResult(
        "not_found",
        "Policy version not found for organization",
        { policyVersionId, organizationId },
      );
    }

    const acceptanceRecordId = randomUUID();

    await sql`
      INSERT INTO soc2_auditor_acceptance_records (
        id,
        organization_id,
        policy_version_id,
        policy_version_number,
        auditor_firm,
        outcome,
        revision_notes,
        accepted_by_user_id
      ) VALUES (
        ${acceptanceRecordId},
        ${organizationId},
        ${policyVersionId},
        ${policyVersionNumber},
        ${auditorFirm},
        ${outcome},
        ${revisionNotes},
        ${acceptedByUserId}
      )
    `;

    const acceptanceStatus = outcome === "accepted" ? "accepted" : "needs_revision";

    await sql`
      UPDATE soc2_policy_versions
      SET
        auditor_acceptance_status = ${acceptanceStatus},
        auditor_acceptance_outcome = ${outcome},
        auditor_acceptance_notes = ${revisionNotes},
        auditor_firm = ${auditorFirm},
        auditor_accepted_by_user_id = ${acceptedByUserId},
        auditor_accepted_at = NOW(),
        updated_at = NOW()
      WHERE id = ${policyVersionId}
        AND organization_id = ${organizationId}
    `;

    return {
      ok: true,
      data: {
        acceptanceRecordId,
        policyVersionId,
        organizationId,
        outcome,
        acceptanceStatus,
      },
    };
  } catch (error) {
    return toErrorResult("internal_error", "Failed to record auditor acceptance", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }
}
