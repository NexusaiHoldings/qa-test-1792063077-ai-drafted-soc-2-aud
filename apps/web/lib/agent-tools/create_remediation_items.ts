/**
 * Company-local agent tool: `create_remediation_items`.
 *
 * Confirm-gated mutation. After a SOC 2 gap report is generated, the agent
 * proposes remediation items for the new gap findings (severity, suggested
 * owner, fix text). Because autonomy is `confirm`, the substrate routes this
 * handler through the cross-boundary approval bridge before it runs — by the
 * time this executes the human has already approved the write.
 *
 * Signature matches the lego handler shape the DOMAIN_DISPATCH map expects:
 *   (ctx: HandlerContext, args: Args) => Promise<HandlerResult>
 *
 * Every row is organization_id-scoped (per @nexus/organizations-and-teams) and
 * written to soc2_remediation_items via parameterized SQL — no interpolation,
 * UUID primary keys only.
 */

import type { HandlerContext, HandlerResult } from "@nexus/identity-and-access";
import { randomUUID } from "node:crypto";

type Args = {
  organization_id?: unknown;
  findings?: unknown;
};

type RemediationFinding = {
  finding_id: string | null;
  title: string | null;
  severity: string | null;
  suggested_owner: string | null;
  fix_text: string | null;
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
      severity: normalizeString(obj.severity),
      suggested_owner: normalizeString(obj.suggested_owner),
      fix_text: normalizeString(obj.fix_text),
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
      status: 400,
      body: "organization_id is required",
    };
  }

  const findings = toFindings(args.findings);

  if (findings.length === 0) {
    return {
      status: 200,
      body: { autonomy: "confirm", inserted: 0, skipped: 0, item_ids: [] },
    };
  }

  const itemIds: string[] = [];
  let skipped = 0;

  for (const finding of findings) {
    const title = finding.title;
    const fixText = finding.fix_text;

    // A remediation item is meaningless without something to fix and how.
    if (!title || !fixText) {
      skipped += 1;
      continue;
    }

    const id = randomUUID();
    const severity = normalizeSeverity(finding.severity);

    try {
      await ctx.db.execute(
        `INSERT INTO soc2_remediation_items
           (id, organization_id, finding_id, title, severity,
            suggested_owner, fix_text, status, created_at, updated_at)
         VALUES
           ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, 'open', NOW(), NOW())`,
        id,
        organizationId,
        finding.finding_id,
        title,
        severity,
        finding.suggested_owner,
        fixText,
      );
    } catch {
      return { status: 500, body: "failed to persist remediation items" };
    }

    itemIds.push(id);
  }

  await ctx.events.publish("soc2.remediation_items_created", {
    organization_id: organizationId,
    inserted: itemIds.length,
    skipped,
  });

  return {
    status: 200,
    body: {
      autonomy: "confirm",
      inserted: itemIds.length,
      skipped,
      item_ids: itemIds,
    },
  };
}
