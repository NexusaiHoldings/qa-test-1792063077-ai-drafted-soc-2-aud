import { randomUUID } from "node:crypto";
import type { HandlerContext, HandlerResult } from "@nexus/identity-and-access";

type Args = {
  organization_id?: string;
  gap_report_id?: string;
  findings?: unknown;
};

type RemediationFinding = {
  finding_id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  suggested_owner: string | null;
  fix_text: string;
};

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed: string = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSeverity(value: unknown): RemediationFinding["severity"] {
  const raw: string = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "critical" || raw === "high" || raw === "medium" || raw === "low") {
    return raw;
  }
  return "medium";
}

function parseFindings(value: unknown): RemediationFinding[] {
  if (!Array.isArray(value)) return [];

  const findings: RemediationFinding[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object") continue;
    const obj: Record<string, unknown> = item as Record<string, unknown>;

    const finding_id: string =
      asNonEmptyString(obj.finding_id) ??
      asNonEmptyString(obj.gap_id) ??
      randomUUID();

    const title: string | null = asNonEmptyString(obj.title) ?? asNonEmptyString(obj.gap_title);
    const fix_text: string | null =
      asNonEmptyString(obj.fix_text) ??
      asNonEmptyString(obj.remediation) ??
      asNonEmptyString(obj.recommended_fix);

    if (!title || !fix_text) continue;

    findings.push({
      finding_id,
      title,
      severity: normalizeSeverity(obj.severity),
      suggested_owner: asNonEmptyString(obj.suggested_owner),
      fix_text,
    });
  }

  return findings;
}

function readOrgId(ctx: HandlerContext, args: Args): string | null {
  const explicit: string | null = asNonEmptyString(args.organization_id);
  if (explicit) return explicit;

  const fromCtx =
    (ctx as unknown as { organizationId?: unknown }).organizationId ??
    (ctx as unknown as { organization_id?: unknown }).organization_id;
  return asNonEmptyString(fromCtx);
}

async function getDbClient(ctx: HandlerContext): Promise<{
  query: (sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>;
}> {
  const candidate =
    (ctx as unknown as { db?: unknown }).db ??
    (ctx as unknown as { pool?: unknown }).pool ??
    (ctx as unknown as { pg?: unknown }).pg;
  if (
    candidate &&
    typeof candidate === "object" &&
    "query" in candidate &&
    typeof (candidate as { query?: unknown }).query === "function"
  ) {
    return candidate as {
      query: (sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>;
    };
  }

  throw new Error("Database client not available in handler context");
}

export async function handleCreateRemediationItems(
  ctx: HandlerContext,
  args: Args,
): Promise<HandlerResult> {
  const organizationId: string | null = readOrgId(ctx, args);
  const gapReportId: string | null = asNonEmptyString(args.gap_report_id);
  const findings: RemediationFinding[] = parseFindings(args.findings);

  if (!organizationId || !gapReportId) {
    return {
      ok: false,
      error: "invalid_args",
      message: "organization_id and gap_report_id are required",
    } as HandlerResult;
  }

  if (findings.length === 0) {
    return {
      ok: true,
      data: {
        created: 0,
        skipped: 0,
      },
    } as HandlerResult;
  }

  const db = await getDbClient(ctx);
  let created = 0;
  let skipped = 0;

  for (const finding of findings) {
    const existing = await db.query(
      `
      SELECT id
      FROM soc2_remediation_items
      WHERE organization_id = $1
        AND gap_report_id = $2
        AND finding_id = $3
      LIMIT 1
      `,
      [organizationId, gapReportId, finding.finding_id],
    );

    if (Array.isArray(existing.rows) && existing.rows.length > 0) {
      skipped += 1;
      continue;
    }

    const remediationId: string = randomUUID();
    await db.query(
      `
      INSERT INTO soc2_remediation_items (
        id,
        organization_id,
        gap_report_id,
        finding_id,
        title,
        severity,
        suggested_owner,
        fix_text,
        status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', NOW(), NOW())
      `,
      [
        remediationId,
        organizationId,
        gapReportId,
        finding.finding_id,
        finding.title,
        finding.severity,
        finding.suggested_owner,
        finding.fix_text,
      ],
    );
    created += 1;
  }

  return {
    ok: true,
    data: {
      created,
      skipped,
      autonomy: "confirm",
    },
  } as HandlerResult;
}
