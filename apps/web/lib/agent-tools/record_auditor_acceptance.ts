/**
 * Company-local agent tool: `record_auditor_acceptance`.
 *
 * Confirm-gated mutation. Called from the operator Auditor Acceptance console
 * after an external audit firm reviews a drafted SOC 2 policy version. Because
 * autonomy is `confirm`, the substrate routes this handler through the
 * cross-boundary approval bridge before it runs — by the time this executes the
 * human operator has already approved the write.
 *
 * Effect (all organization_id-scoped, per @nexus/organizations-and-teams):
 *   1. Insert ONE immutable `soc2_auditor_acceptance_records` row capturing the
 *      policy version, audit firm, outcome and any revision notes.
 *   2. Mark the owning `soc2_policy_versions` row's `acceptance_status` so the
 *      console and downstream gap reports reflect the auditor's decision.
 *
 * Signature matches the lego handler shape the DOMAIN_DISPATCH map expects:
 *   (ctx: HandlerContext, args: Args) => Promise<HandlerResult>
 *
 * Every write uses parameterized SQL ($1, $2, ...) — never interpolation — and
 * UUID primary keys only.
 */

import type { HandlerContext, HandlerResult } from "@nexus/identity-and-access";
import { randomUUID } from "node:crypto";

type Args = {
  organization_id?: unknown;
  policy_version_id?: unknown;
  firm?: unknown;
  outcome?: unknown;
  revision_notes?: unknown;
  accepted_at?: unknown;
};

/**
 * Auditor outcomes recognized by the console. Kept as an explicit allow-list so
 * the downstream `acceptance_status` on the policy version stays a small, known
 * vocabulary (no free-form status creep).
 */
const VALID_OUTCOMES = new Set([
  "accepted",
  "accepted_with_revisions",
  "revisions_requested",
  "rejected",
]);

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

/**
 * Parse an optional ISO-8601 acceptance timestamp. Absent / null → "now".
 * A present-but-unparseable value is an explicit error so callers don't
 * silently record the wrong date.
 */
function parseAcceptedAt(value: unknown): { iso: string } | { error: string } {
  if (value == null) {
    return { iso: new Date().toISOString() };
  }
  if (typeof value !== "string") {
    return { error: "accepted_at must be an ISO-8601 datetime string" };
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { error: "accepted_at must be a valid ISO-8601 datetime" };
  }
  return { iso: parsed.toISOString() };
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

export async function handleRecordAuditorAcceptance(
  ctx: HandlerContext,
  args: Args,
): Promise<HandlerResult> {
  const organizationId =
    normalizeString(args.organization_id) ?? orgIdFromContext(ctx);
  if (!organizationId) {
    return { status: 400, body: "organization_id is required" };
  }

  const policyVersionId = normalizeString(args.policy_version_id);
  if (!policyVersionId) {
    return { status: 400, body: "policy_version_id is required" };
  }

  const firm = normalizeString(args.firm);
  if (!firm) {
    return { status: 400, body: "firm is required" };
  }

  const outcome = normalizeString(args.outcome)?.toLowerCase() ?? null;
  if (!outcome) {
    return { status: 400, body: "outcome is required" };
  }
  if (!VALID_OUTCOMES.has(outcome)) {
    return {
      status: 400,
      body: `outcome must be one of: ${[...VALID_OUTCOMES].join(", ")}`,
    };
  }

  const revisionNotes =
    typeof args.revision_notes === "string" ? args.revision_notes.trim() : "";

  const acceptedAt = parseAcceptedAt(args.accepted_at);
  if ("error" in acceptedAt) {
    return { status: 400, body: acceptedAt.error };
  }

  // Guard: the policy version must exist and belong to this tenant before we
  // record an auditor decision against it — prevents orphan records and
  // cross-tenant writes.
  let versionRows: Array<{ id: string }>;
  try {
    versionRows = await ctx.db.query<{ id: string }>(
      `SELECT id
         FROM soc2_policy_versions
        WHERE id = $1::uuid
          AND organization_id = $2::uuid`,
      policyVersionId,
      organizationId,
    );
  } catch {
    return { status: 500, body: "failed to load policy version" };
  }

  if (versionRows.length === 0) {
    return { status: 404, body: "policy version not found" };
  }

  const acceptanceId = randomUUID();

  try {
    await ctx.db.execute(
      `INSERT INTO soc2_auditor_acceptance_records
         (id, organization_id, policy_version_id, firm, outcome,
          revision_notes, accepted_at, created_at)
       VALUES
         ($1::uuid, $2::uuid, $3::uuid, $4, $5,
          $6, $7::timestamptz, NOW())`,
      acceptanceId,
      organizationId,
      policyVersionId,
      firm,
      outcome,
      revisionNotes,
      acceptedAt.iso,
    );

    const updatedRows = await ctx.db.query<{ id: string }>(
      `UPDATE soc2_policy_versions
          SET acceptance_status = $3,
              updated_at = NOW()
        WHERE id = $1::uuid
          AND organization_id = $2::uuid
      RETURNING id`,
      policyVersionId,
      organizationId,
      outcome,
    );

    if (updatedRows.length === 0) {
      // The version vanished between the guard read and this update.
      return { status: 404, body: "policy version not found" };
    }
  } catch {
    return { status: 500, body: "failed to record auditor acceptance" };
  }

  await ctx.events.publish("soc2.auditor_acceptance_recorded", {
    organization_id: organizationId,
    policy_version_id: policyVersionId,
    acceptance_record_id: acceptanceId,
    firm,
    outcome,
    accepted_at: acceptedAt.iso,
  });

  return {
    status: 200,
    body: {
      autonomy: "confirm",
      acceptance_record_id: acceptanceId,
      policy_version_id: policyVersionId,
      firm,
      outcome,
      acceptance_status: outcome,
      accepted_at: acceptedAt.iso,
    },
  };
}
