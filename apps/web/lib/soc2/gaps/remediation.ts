/**
 * Remediation priority queue (F1-006, remediation.ts).
 *
 * The weekly re-scan upserts one soc2_remediation_items row per currently-failing
 * control with:
 *   - a severity   — critical for the three highest-liability misconfigurations
 *                    (public S3, root/IAM without MFA, CloudTrail off), then high
 *                    for the remaining access/change controls, else medium;
 *   - an owner     — a member drawn from @nexus/organizations-and-teams, spread
 *                    deterministically across the team so the queue isn't dumped
 *                    on one person;
 *   - a plain-English fix and a severity-driven due date.
 *
 * New owner assignments are announced via @nexus/notifications (best-effort —
 * notification failure never breaks the re-scan).
 *
 * The "Mark fixed" action NEVER auto-closes: it moves an item to
 * `fixed_pending_confirmation` and a distinct human confirmation reaches
 * `resolved`. That is the liability_assessor human_in_loop gate for
 * misconfigurations. Separately, when a re-scan observes a control is no longer
 * failing (evidence now found), the item is auto-resolved — the system clearing
 * its own finding, not a human asserting a fix.
 */

import { handleSendNotification, type HandlerContext } from "@nexus/notifications";
import { getControl } from "@/lib/soc2/tsc/seed";
import { isProblemStatus, type ControlStatus, type GapDb, type GapReport } from "@/lib/soc2/gaps/analyze";

export type Severity = "critical" | "high" | "medium" | "low";

export type RemediationStatus =
  | "open"
  | "in_progress"
  | "fixed_pending_confirmation"
  | "resolved"
  | "dismissed";

/** A member who can own a remediation item. */
export interface OrgMember {
  readonly userId: string;
  readonly email: string;
  readonly role: string;
}

/** A persisted soc2_remediation_items row (UI read model). */
export interface RemediationItem {
  readonly id: string;
  readonly organizationId: string;
  readonly controlCode: string;
  readonly title: string;
  readonly severity: Severity;
  readonly status: RemediationStatus;
  readonly ownerUserId: string | null;
  readonly ownerEmail: string | null;
  readonly suggestedFix: string;
  readonly rationale: string;
  readonly dueDate: string | null;
  readonly ownerNotifiedAt: string | null;
  readonly fixedRequestedAt: string | null;
  readonly resolvedAt: string | null;
  readonly updatedAt: string;
}

// ─── Severity classification ──────────────────────────────────────────────────

/**
 * The three highest-liability misconfigurations are critical: public S3 (C1.1),
 * missing MFA on root/IAM principals (CC6.6), and CloudTrail disabled (CC7.2).
 */
const CRITICAL_CONTROLS: ReadonlySet<string> = new Set(["C1.1", "CC6.6", "CC7.2"]);
/** Remaining access / change / monitoring controls default to high. */
const HIGH_CONTROLS: ReadonlySet<string> = new Set([
  "CC6.1",
  "CC6.2",
  "CC6.3",
  "CC6.7",
  "CC6.8",
  "CC7.1",
  "CC8.1",
]);

/** Map a failing control to a severity. needs_human_review is never critical. */
export function classifySeverity(controlCode: string, status: string): Severity {
  if (status === "needs_human_review") return "medium";
  if (CRITICAL_CONTROLS.has(controlCode)) return "critical";
  if (HIGH_CONTROLS.has(controlCode)) return "high";
  if (controlCode.startsWith("A1")) return "high"; // availability
  return "medium";
}

/** Severity drives how urgently the owner must act (days until due). */
const DUE_DAYS: Record<Severity, number> = {
  critical: 3,
  high: 7,
  medium: 14,
  low: 30,
};

/** Rank used to sort the queue (critical first). */
export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Compute a due date (YYYY-MM-DD) from the report date + the severity window. */
export function computeDueDate(generatedAtIso: string, severity: Severity): string {
  const base = Date.parse(generatedAtIso);
  const start = Number.isNaN(base) ? Date.now() : base;
  const due = new Date(start + DUE_DAYS[severity] * 24 * 60 * 60 * 1000);
  return due.toISOString().slice(0, 10);
}

// ─── Plain-English fixes ──────────────────────────────────────────────────────

const FIX_LIBRARY: Record<string, string> = {
  "C1.1":
    "Enable account-level S3 Block Public Access and remove any public bucket ACLs or policies so confidential data cannot be exposed to the internet.",
  "CC6.1":
    "Turn on encryption at rest for all data stores (RDS, EBS, S3) and enforce strong KMS key rotation to protect information assets.",
  "CC6.2":
    "Wire your HRIS offboarding so that access is revoked automatically when an employee leaves; reconcile active accounts against current staff.",
  "CC6.6":
    "Require multi-factor authentication for the root account and every IAM user. Enforce an MFA-required policy and remove long-lived access keys from privileged principals.",
  "CC6.8":
    "Enable malware / threat detection (GuardDuty) and act on its findings to prevent unauthorized or malicious software from running.",
  "CC7.1":
    "Turn on AWS Config recording and GitHub Dependabot so configuration drift and vulnerable dependencies are detected continuously.",
  "CC7.2":
    "Enable a multi-region CloudTrail trail with log file validation so security events are captured and anomalies can be detected across every region.",
  "CC8.1":
    "Protect your default branches: require pull-request reviews, status checks, and block force-pushes so changes are reviewed before they ship.",
  "A1.1":
    "Define and monitor capacity / availability targets, and set CloudWatch alarms so you are paged before you run out of headroom.",
  "A1.2":
    "Enable automated backups with a defined retention window on all databases, and periodically test that restores work.",
};

/** A plain-English fix for a control, with a sensible generic fallback. */
export function suggestedFix(controlCode: string): string {
  const specific = FIX_LIBRARY[controlCode];
  if (specific) return specific;
  const control = getControl(controlCode);
  if (control) {
    return `Collect and configure evidence for "${control.title}" (${control.policyDocument}). Review the criterion on the control detail page and remediate the underlying setting.`;
  }
  return "Review this control on the control detail page and configure the underlying system so Nexus can map evidence to it.";
}

// ─── Owner assignment ─────────────────────────────────────────────────────────

/** Load the org's members (with email for the avatar / notification). */
export async function loadMembers(db: GapDb, organizationId: string): Promise<OrgMember[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT m.user_id, u.email, m.role
       FROM org_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.org_id = $1::uuid
      ORDER BY
        CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
        m.joined_at ASC`,
    organizationId,
  );
  return rows.map((row) => ({
    userId: String(row.user_id),
    email: String(row.email ?? ""),
    role: String(row.role ?? "member"),
  }));
}

/** Stable, dependency-free string hash for deterministic round-robin. */
function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Pick an owner for a control, spreading items deterministically across the
 * team. Returns null when the org has no members.
 */
export function assignOwner(members: readonly OrgMember[], controlCode: string): OrgMember | null {
  if (members.length === 0) return null;
  const idx = hashCode(controlCode) % members.length;
  return members[idx];
}

// ─── Notifications ────────────────────────────────────────────────────────────

function notificationsConfig(): { default_channels: string[]; resend_from_email: string } {
  const from =
    process.env.EMAIL_FROM || `${process.env.COMPANY_SLUG || "no-reply"}@nexusaiholdings.com`;
  return { default_channels: ["email", "in_app"], resend_from_email: from };
}

/**
 * Notify an owner they were assigned a remediation item. Best-effort: any
 * failure is logged and swallowed so the re-scan never breaks on email.
 */
async function notifyOwnerAssigned(
  ctx: HandlerContext,
  item: {
    ownerUserId: string;
    ownerEmail: string | null;
    title: string;
    severity: Severity;
    dueDate: string | null;
    suggestedFix: string;
  },
): Promise<boolean> {
  try {
    const cfg = notificationsConfig();
    const html = [
      "<h2>You've been assigned a SOC 2 remediation item</h2>",
      `<p><strong>${item.title}</strong> was flagged in this week's gap scan.</p>`,
      `<p>Severity: <strong>{{severity}}</strong>${item.dueDate ? " · Due: <strong>{{due_date}}</strong>" : ""}</p>`,
      "<p>Suggested fix: {{suggested_fix}}</p>",
      "<p>Open the remediation queue in your dashboard to review and mark it fixed.</p>",
    ].join("\n");

    const result = await handleSendNotification({
      body: {
        user_id: item.ownerUserId,
        template_name: "soc2_remediation_assigned",
        category: "transactional",
        to_email: item.ownerEmail ?? undefined,
        html_template: html,
        variables: {
          severity: item.severity,
          due_date: item.dueDate ?? "",
          suggested_fix: item.suggestedFix,
        },
      },
      config: cfg,
      ctx,
    });
    return result.status < 400;
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        scope: "soc2.remediation",
        msg: "owner_notify_failed",
        error: String(err),
      }),
    );
    return false;
  }
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

function normalizeItem(row: Record<string, unknown>): RemediationItem {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    controlCode: String(row.control_code),
    title: String(row.title ?? ""),
    severity: (row.severity as Severity) ?? "medium",
    status: (row.status as RemediationStatus) ?? "open",
    ownerUserId: (row.owner_user_id as string | null) ?? null,
    ownerEmail: (row.owner_email as string | null) ?? null,
    suggestedFix: String(row.suggested_fix ?? ""),
    rationale: String(row.rationale ?? ""),
    dueDate: (row.due_date as string | null) ?? null,
    ownerNotifiedAt: (row.owner_notified_at as string | null) ?? null,
    fixedRequestedAt: (row.fixed_requested_at as string | null) ?? null,
    resolvedAt: (row.resolved_at as string | null) ?? null,
    updatedAt: String(row.updated_at ?? ""),
  };
}

/** Summary of what the upsert did (for the cron response + logs). */
export interface RemediationUpsertResult {
  readonly upserted: number;
  readonly autoResolved: number;
  readonly notified: number;
}

/**
 * Upsert the remediation queue for an org from the current control statuses.
 * Preserves human decisions (status, resolved_at) and the first assigned owner,
 * reopens resolved items whose gap has returned, auto-resolves items whose
 * control is no longer failing, and notifies freshly-assigned owners.
 */
export async function upsertRemediationItems(
  db: GapDb,
  organizationId: string,
  report: GapReport,
  statuses: Map<string, ControlStatus>,
  ctx: HandlerContext | null,
): Promise<RemediationUpsertResult> {
  const members = await loadMembers(db, organizationId);
  const problems: ControlStatus[] = [...statuses.values()].filter((s) => isProblemStatus(s.status));

  let upserted = 0;
  let notified = 0;
  const activeCodes: string[] = [];

  for (const problem of problems) {
    activeCodes.push(problem.controlCode);
    const severity = classifySeverity(problem.controlCode, problem.status);
    const fix = suggestedFix(problem.controlCode);
    const dueDate = computeDueDate(report.generatedAt, severity);
    const control = getControl(problem.controlCode);
    const title = `${problem.controlCode} — ${control?.title ?? problem.title}`;
    const owner = assignOwner(members, problem.controlCode);

    const rows = await db.query<Record<string, unknown>>(
      `INSERT INTO soc2_remediation_items
         (organization_id, control_code, title, severity, status,
          owner_user_id, owner_email, suggested_fix, rationale, due_date,
          first_seen_report_id, last_seen_report_id)
       VALUES ($1::uuid, $2, $3, $4, 'open',
               $5, $6, $7, $8, $9::date,
               $10::uuid, $10::uuid)
       ON CONFLICT (organization_id, control_code) DO UPDATE SET
         title = EXCLUDED.title,
         severity = EXCLUDED.severity,
         suggested_fix = EXCLUDED.suggested_fix,
         rationale = EXCLUDED.rationale,
         due_date = EXCLUDED.due_date,
         last_seen_report_id = EXCLUDED.last_seen_report_id,
         owner_user_id = COALESCE(soc2_remediation_items.owner_user_id, EXCLUDED.owner_user_id),
         owner_email = COALESCE(soc2_remediation_items.owner_email, EXCLUDED.owner_email),
         status = CASE
                    WHEN soc2_remediation_items.status = 'resolved' THEN 'open'
                    ELSE soc2_remediation_items.status
                  END,
         resolved_at = CASE
                    WHEN soc2_remediation_items.status = 'resolved' THEN NULL
                    ELSE soc2_remediation_items.resolved_at
                  END,
         updated_at = now()
       RETURNING *`,
      organizationId,
      problem.controlCode,
      title,
      severity,
      owner?.userId ?? null,
      owner?.email ?? null,
      fix,
      problem.rationale,
      dueDate,
      report.id,
    );
    if (!rows[0]) continue;
    upserted += 1;
    const item = normalizeItem(rows[0]);

    // Announce a fresh owner assignment exactly once.
    if (ctx && item.ownerUserId && !item.ownerNotifiedAt) {
      const ok = await notifyOwnerAssigned(ctx, {
        ownerUserId: item.ownerUserId,
        ownerEmail: item.ownerEmail,
        title: item.title,
        severity: item.severity,
        dueDate: item.dueDate,
        suggestedFix: item.suggestedFix,
      });
      await db.execute(
        `UPDATE soc2_remediation_items SET owner_notified_at = now(), updated_at = now() WHERE id = $1::uuid`,
        item.id,
      );
      if (ok) notified += 1;
    }
  }

  // Auto-resolve items whose control is no longer failing (system-detected fix).
  const autoResolveRows = await db.query<{ id: string }>(
    `UPDATE soc2_remediation_items
        SET status = 'resolved', resolved_at = now(), updated_at = now()
      WHERE organization_id = $1::uuid
        AND status IN ('open', 'in_progress', 'fixed_pending_confirmation')
        AND NOT (control_code = ANY($2::text[]))
      RETURNING id`,
    organizationId,
    activeCodes,
  );

  return { upserted, autoResolved: autoResolveRows.length, notified };
}

// ─── Queue read model ─────────────────────────────────────────────────────────

/** Load the queue for an org, open items first, critical first, due soonest. */
export async function loadRemediationQueue(
  db: GapDb,
  organizationId: string,
  opts: { includeResolved?: boolean } = {},
): Promise<RemediationItem[]> {
  const where = opts.includeResolved
    ? ""
    : "AND status NOT IN ('resolved', 'dismissed')";
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM soc2_remediation_items
      WHERE organization_id = $1::uuid ${where}
      ORDER BY
        CASE status WHEN 'resolved' THEN 1 WHEN 'dismissed' THEN 1 ELSE 0 END,
        CASE severity
          WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3
        END,
        due_date ASC NULLS LAST,
        updated_at DESC`,
    organizationId,
  );
  return rows.map(normalizeItem);
}

/** A single remediation item, scoped to the org. */
export async function getRemediationItem(
  db: GapDb,
  organizationId: string,
  itemId: string,
): Promise<RemediationItem | null> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM soc2_remediation_items
      WHERE id = $1::uuid AND organization_id = $2::uuid
      LIMIT 1`,
    itemId,
    organizationId,
  );
  return rows[0] ? normalizeItem(rows[0]) : null;
}

/**
 * "Mark fixed" — step one. Does NOT resolve; it routes the item to a human
 * confirmation by moving it to fixed_pending_confirmation. Idempotent.
 */
export async function requestMarkFixed(
  db: GapDb,
  organizationId: string,
  itemId: string,
  actorUserId: string | null,
): Promise<RemediationItem | null> {
  const rows = await db.query<Record<string, unknown>>(
    `UPDATE soc2_remediation_items
        SET status = 'fixed_pending_confirmation',
            fixed_requested_by = $3,
            fixed_requested_at = now(),
            updated_at = now()
      WHERE id = $1::uuid AND organization_id = $2::uuid
        AND status NOT IN ('resolved', 'dismissed')
      RETURNING *`,
    itemId,
    organizationId,
    actorUserId,
  );
  return rows[0] ? normalizeItem(rows[0]) : null;
}

/**
 * "Mark fixed" — step two. A distinct human confirmation reaches `resolved`.
 * This is the human_in_loop gate: no code path resolves a misconfiguration
 * without this explicit action.
 */
export async function confirmMarkFixed(
  db: GapDb,
  organizationId: string,
  itemId: string,
): Promise<RemediationItem | null> {
  const rows = await db.query<Record<string, unknown>>(
    `UPDATE soc2_remediation_items
        SET status = 'resolved',
            resolved_at = now(),
            updated_at = now()
      WHERE id = $1::uuid AND organization_id = $2::uuid
        AND status = 'fixed_pending_confirmation'
      RETURNING *`,
    itemId,
    organizationId,
  );
  return rows[0] ? normalizeItem(rows[0]) : null;
}

/** Cancel a pending confirmation, returning the item to the open queue. */
export async function cancelMarkFixed(
  db: GapDb,
  organizationId: string,
  itemId: string,
): Promise<RemediationItem | null> {
  const rows = await db.query<Record<string, unknown>>(
    `UPDATE soc2_remediation_items
        SET status = 'open',
            fixed_requested_by = NULL,
            fixed_requested_at = NULL,
            updated_at = now()
      WHERE id = $1::uuid AND organization_id = $2::uuid
        AND status = 'fixed_pending_confirmation'
      RETURNING *`,
    itemId,
    organizationId,
  );
  return rows[0] ? normalizeItem(rows[0]) : null;
}
