import type { HandlerContext, HandlerResult } from "@nexus/identity-and-access";
import { Pool } from "pg";
import crypto from "node:crypto";

type Args = {
  organization_id?: unknown;
  policy_version_id?: unknown;
  firm?: unknown;
  outcome?: unknown;
  revision_notes?: unknown;
  accepted_at?: unknown;
};

type DbRow = {
  acceptance_status: string | null;
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseIsoDate(value: unknown): Date | null {
  if (value == null) {
    return new Date();
  }
  if (typeof value !== "string") {
    return null;
  }
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function buildError(message: string): HandlerResult {
  return {
    ok: false,
    error: message,
  } as HandlerResult;
}

export async function handleRecordAuditorAcceptance(
  ctx: HandlerContext,
  args: Args,
): Promise<HandlerResult> {
  const organizationId =
    asNonEmptyString(args.organization_id) ??
    asNonEmptyString((ctx as { organizationId?: unknown }).organizationId);
  const policyVersionId = asNonEmptyString(args.policy_version_id);
  const firm = asNonEmptyString(args.firm);
  const outcome = asNonEmptyString(args.outcome);
  const revisionNotes =
    typeof args.revision_notes === "string" ? args.revision_notes.trim() : "";
  const acceptedAt = parseIsoDate(args.accepted_at);

  if (!organizationId) {
    return buildError("organization_id is required");
  }
  if (!policyVersionId) {
    return buildError("policy_version_id is required");
  }
  if (!firm) {
    return buildError("firm is required");
  }
  if (!outcome) {
    return buildError("outcome is required");
  }
  if (!acceptedAt) {
    return buildError("accepted_at must be a valid ISO datetime when provided");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const versionLookup = await client.query<DbRow>(
      `
        SELECT acceptance_status
        FROM soc2_policy_versions
        WHERE id = $1 AND organization_id = $2
        LIMIT 1
      `,
      [policyVersionId, organizationId],
    );

    if (versionLookup.rowCount === 0) {
      await client.query("ROLLBACK");
      return buildError("policy_version not found for organization");
    }

    const acceptanceId = crypto.randomUUID();

    await client.query(
      `
        INSERT INTO soc2_auditor_acceptance_records (
          id,
          organization_id,
          policy_version_id,
          firm,
          outcome,
          revision_notes,
          accepted_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        acceptanceId,
        organizationId,
        policyVersionId,
        firm,
        outcome,
        revisionNotes,
        acceptedAt.toISOString(),
      ],
    );

    await client.query(
      `
        UPDATE soc2_policy_versions
        SET
          acceptance_status = $1,
          updated_at = NOW()
        WHERE id = $2 AND organization_id = $3
      `,
      [outcome, policyVersionId, organizationId],
    );

    await client.query("COMMIT");

    return {
      ok: true,
      data: {
        acceptance_record_id: acceptanceId,
        organization_id: organizationId,
        policy_version_id: policyVersionId,
        acceptance_status: outcome,
      },
    } as HandlerResult;
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    const message =
      error instanceof Error ? error.message : "unknown database error";
    return buildError(`failed_to_record_auditor_acceptance: ${message}`);
  } finally {
    client.release();
  }
}
