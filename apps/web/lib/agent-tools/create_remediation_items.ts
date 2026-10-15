import type { HandlerContext, HandlerResult } from "@nexus/identity-and-access";
import { randomUUID } from "node:crypto";

type Args = {
  organization_id?: unknown;
  findings?: unknown;
};

type RemediationFinding = {
  finding_id?: string;
  title?: string;
  severity?: string;
  suggested_owner?: string;
  fix_text?: string;
};

const VALID_SEVERITIES = new Set(["low", "medium", "high", "critical"]);

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

function normalizeSeverity(value: unknown): string {
  const candidate = normalizeString(value)?.toLowerCase() ?? "medium";
  return VALID_SEVERITIES.has(candidate) ? candidate : "medium";
}

function toFindings(value: unknown): RemediationFinding[] {
  if (!Array.isArray(value)) return [];
  const results: RemediationFinding[] = [];
  for (const item of value) {
    const obj = asObject(item);
    if (!obj) continue;
    results.push({
      finding_id: normalizeString(obj.finding_id),
      title: normalizeString(obj.title),
      severity: normalizeString(obj.severity) ?? undefined,
      suggested_owner: normalizeString(obj.suggested_owner) ?? undefined,
      fix_text: normalizeString(obj.fix_text) ?? undefined,
    });
  }
  return results;
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

export async function handleCreateRemediationItems(
  ctx: HandlerContext,
  args: Args,
): Promise<HandlerResult> {
  const organizationId =
    normalizeString(args.organization_id) ?? orgIdFromContext(ctx);

  if (!organizationId) {
    return {
      ok: false,
      error: "missing_organization_id",
      autonomy: "confirm",
    } as HandlerResult;
  }

  const findings = toFindings(args.findings);

  if (findings.length === 0) {
    return {
      ok: true,
      autonomy: "confirm",
      data: {
        inserted: 0,
        skipped: 0,
      },
    } as HandlerResult;
  }

  const db = (ctx as unknown as { db?: { query?: (sql: string, params?: unknown[]) => Promise<unknown> } }).db;
  if (!db?.query) {
    return {
      ok: false,
      error: "db_unavailable",
      autonomy: "confirm",
    } as HandlerResult;
  }

  let inserted = 0;
  let skipped = 0;

  for (const finding of findings) {
    const title = normalizeString(finding.title);
    const fixText = normalizeString(finding.fix_text);

    if (!title || !fixText) {
      skipped += 1;
      continue;
    }

    const id = randomUUID();
    const severity = normalizeSeverity(finding.severity);
    const suggestedOwner = normalizeString(finding.suggested_owner);

    await db.query(
      `INSERT INTO soc2_remediation_items
         (id, organization_id, finding_id, title, severity, suggested_owner, fix_text, status, created_at, updated_at)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, 'open', NOW(), NOW())`,
      [
        id,
        organizationId,
        normalizeString(finding.finding_id),
        title,
        severity,
        suggestedOwner,
        fixText,
      ],
    );

    inserted += 1;
  }

  return {
    ok: true,
    autonomy: "confirm",
    data: {
      inserted,
      skipped,
    },
  } as HandlerResult;
}
