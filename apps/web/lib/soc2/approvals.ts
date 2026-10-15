/**
 * Policy Review & Sign-off Gate (F1-008, apps/web/lib/soc2/approvals.ts).
 *
 * The hard human-in-loop checkpoint the liability_assessor demands ("final
 * review and sign-off on any policy document before submission to a SOC 2
 * auditor") and that ceo_briefing.data_findings calls "a natural product
 * checkpoint in the UX" for UPL protection.
 *
 * This module OWNS the policy status machine:
 *
 *     draft → in_review → approved → superseded
 *
 * and enforces — server-side, never trusting the client — that the approver:
 *   (a) holds an owner/admin role in the org (via @nexus/organizations-and-teams
 *       `org_members`);
 *   (b) is NOT the user who triggered the draft (no self-approval); and
 *   (c) has ticked the AI-content disclaimer acknowledgment for THAT EXACT
 *       version hash (the hash is passed back from the page and compared to the
 *       stored version_hash so a stale tab can't approve a since-regenerated
 *       body).
 *
 * Every transition writes an admin-console audit event (admin_audit_log) and a
 * reviewer notification via @nexus/notifications. Both are best-effort: a
 * logging/email failure must never roll back a sign-off that already committed.
 *
 * Conventions mirror the rest of apps/web/lib/soc2/*: DB access via buildDb()
 * (the substrate `Db` whose query<T>() returns rows directly), session + tenant
 * via resolveOrgContext(), parameterized $1/$2 SQL only, UUID ids throughout.
 */

import { handleSendNotification, type HandlerContext } from "@nexus/notifications";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { resolveOrgContext } from "@/lib/soc2/access";

/** Policy lifecycle states. The gate transitions between these. */
export type PolicyReviewStatus = "draft" | "in_review" | "approved" | "superseded";

/** The two reviewer decisions surfaced in the sticky footer. */
export type ReviewDecision = "approve" | "request_changes";

/** A member eligible to review (owner/admin), for the assignment picker. */
export interface EligibleReviewer {
  readonly userId: string;
  readonly email: string;
  readonly role: string;
}

/** The read model the /policies/[id]/review page renders. */
export interface PolicyReviewPageData {
  readonly policy: {
    readonly id: string;
    readonly organizationId: string;
    readonly policyKey: string;
    readonly title: string;
    readonly status: PolicyReviewStatus;
    readonly currentVersionId: string | null;
    readonly approvedVersionId: string | null;
  };
  readonly reviewVersion: {
    readonly id: string;
    readonly policyId: string;
    readonly versionNumber: number;
    readonly versionHash: string;
    readonly bodyMarkdown: string;
    readonly changeSummary: string;
    readonly generatedBy: string | null;
    readonly generatedAt: string;
    readonly aiDisclaimerAcknowledgedAt: string | null;
    readonly aiDisclaimerAcknowledgedBy: string | null;
  } | null;
  readonly previousApprovedVersion: {
    readonly id: string;
    readonly versionNumber: number;
    readonly versionHash: string;
    readonly bodyMarkdown: string;
    readonly approvedAt: string;
    readonly approvedBy: string | null;
    readonly approvedByName: string | null;
  } | null;
  /** Line-level diff of the review body against the last approved body. */
  readonly diffLines: ReadonlyArray<{ kind: "same" | "added" | "removed"; text: string }>;
  readonly eligibleReviewers: ReadonlyArray<EligibleReviewer>;
  readonly currentAssignee: {
    readonly reviewerUserId: string;
    readonly reviewerEmail: string | null;
    readonly assignedAt: string;
  } | null;
  /** Whether the signed-in viewer is allowed to decide (owner/admin, not drafter). */
  readonly viewerCanApprove: boolean;
  readonly viewerIsDrafter: boolean;
  readonly pendingBanner: { readonly show: boolean; readonly message: string };
  readonly approvedStamp: {
    readonly show: boolean;
    readonly approverName: string | null;
    readonly approvedAt: string | null;
    readonly versionHash: string | null;
  };
  readonly clauseThreads: ReadonlyArray<{
    readonly clauseId: string;
    readonly title: string;
    readonly excerpt: string;
    /**
     * PROPOSED per-clause thread shape to be composed from
     * @nexus/social-and-engagement — shape only, not yet persisted.
     */
    readonly proposedThreadShape: {
      readonly provider: "@nexus/social-and-engagement";
      readonly threadKey: string;
      readonly entityType: "soc2_policy_clause_review";
      readonly entityId: string;
      readonly metadata: Record<string, string>;
    };
  }>;
}

/** Discriminated result for the server actions the page invokes. */
export type DecisionResult =
  | { readonly ok: true; readonly newStatus: PolicyReviewStatus; readonly message: string }
  | { readonly ok: false; readonly error: string; readonly message: string };

/** Human-readable messages for the enforcement failures. */
const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "You must be signed in to review a policy.",
  POLICY_NOT_FOUND: "That policy does not exist in your organization.",
  VERSION_NOT_FOUND: "The version you are reviewing no longer exists.",
  VERSION_MISMATCH: "This is no longer the current version — reload the page.",
  HASH_MISMATCH: "The policy was regenerated since you opened it. Reload and review the new version.",
  ROLE_FORBIDDEN: "Only organization owners or admins can sign off on a policy.",
  SELF_APPROVAL_FORBIDDEN: "You drafted this version, so a different reviewer must approve it.",
  DISCLAIMER_REQUIRED: "You must acknowledge the AI-content disclaimer for this exact version before approving.",
  REASON_REQUIRED: "Describe what needs to change before requesting changes.",
  NOT_IN_REVIEW: "This policy is not currently awaiting review.",
};

function normalizeStatus(status: string | null | undefined): PolicyReviewStatus {
  if (status === "in_review" || status === "approved" || status === "superseded") {
    return status;
  }
  return "draft";
}

/** Split a markdown policy body into clauses on `## ` headings. */
function splitIntoClauses(
  markdown: string,
): Array<{ clauseId: string; title: string; excerpt: string }> {
  const lines = markdown.split("\n");
  const clauses: Array<{ clauseId: string; title: string; excerpt: string }> = [];
  let currentTitle = "Preamble";
  let currentBody: string[] = [];
  let index = 0;

  const flush = (): void => {
    const joined = currentBody.join(" ").replace(/\s+/g, " ").trim();
    if (joined.length === 0 && clauses.length > 0) return;
    index += 1;
    clauses.push({
      clauseId: `clause-${index}`,
      title: currentTitle,
      excerpt: joined.length > 0 ? joined.slice(0, 240) : "No content.",
    });
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      currentTitle = line.replace(/^##\s+/, "").trim() || `Clause ${index + 1}`;
      currentBody = [];
      continue;
    }
    currentBody.push(line);
  }
  flush();

  if (clauses.length === 0) {
    return [{ clauseId: "clause-1", title: "Policy text", excerpt: markdown.slice(0, 240) }];
  }
  return clauses;
}

/**
 * Compute a simple line-level diff (LCS) of the review body against the last
 * approved body so the page can render added / removed / unchanged lines.
 */
function diffLines(
  previous: string,
  current: string,
): Array<{ kind: "same" | "added" | "removed"; text: string }> {
  const a = previous.split("\n");
  const b = current.split("\n");
  const n = a.length;
  const m = b.length;

  // LCS length table.
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: Array<{ kind: "same" | "added" | "removed"; text: string }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: "removed", text: a[i] });
      i += 1;
    } else {
      out.push({ kind: "added", text: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    out.push({ kind: "removed", text: a[i] });
    i += 1;
  }
  while (j < m) {
    out.push({ kind: "added", text: b[j] });
    j += 1;
  }
  return out;
}

/** Load the org members who are eligible to sign off (owner/admin). */
async function loadEligibleReviewers(
  db: ReturnType<typeof buildDb>,
  organizationId: string,
): Promise<EligibleReviewer[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT m.user_id, u.email, m.role
       FROM org_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.org_id = $1::uuid
        AND m.role IN ('owner', 'admin')
      ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, u.email ASC`,
    organizationId,
  );
  return rows.map((row) => ({
    userId: String(row.user_id),
    email: String(row.email ?? ""),
    role: String(row.role ?? "member"),
  }));
}

/** Resolve a user's org role; returns "" when they are not a member. */
async function roleOf(
  db: ReturnType<typeof buildDb>,
  organizationId: string,
  userId: string,
): Promise<string> {
  const rows = await db.query<{ role: string }>(
    `SELECT role FROM org_members WHERE org_id = $1::uuid AND user_id = $2::uuid LIMIT 1`,
    organizationId,
    userId,
  );
  return rows[0]?.role ?? "";
}

function notificationsConfig(): { default_channels: string[]; resend_from_email: string } {
  const from = process.env.EMAIL_FROM || `${process.env.COMPANY_SLUG || "no-reply"}@nexusaiholdings.com`;
  return { default_channels: ["email", "in_app"], resend_from_email: from };
}

/**
 * Best-effort audit write to the admin-console audit log. Mirrors
 * apps/web/lib/soc2/access.ts#logConnectionEvent — never throws.
 */
async function auditTransition(
  db: ReturnType<typeof buildDb>,
  input: {
    actorUserId: string;
    action: string;
    policyId: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await db.execute(
      `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, payload)
       VALUES ($1::uuid, $2, $3, $4, $5::jsonb)`,
      input.actorUserId,
      input.action,
      "soc2_policy",
      input.policyId,
      JSON.stringify(input.payload),
    );
  } catch (err) {
    console.error(
      JSON.stringify({ level: "error", scope: "soc2.approvals", msg: "audit_log_failed", error: String(err) }),
    );
  }
}

/**
 * Best-effort reviewer/author notification. Never throws — a failed email must
 * not roll back a committed transition.
 */
async function notifyUser(
  ctx: HandlerContext,
  input: {
    userId: string;
    toEmail: string | null;
    html: string;
    variables: Record<string, string>;
  },
): Promise<void> {
  try {
    await handleSendNotification({
      body: {
        user_id: input.userId,
        template_name: "soc2_policy_review",
        category: "transactional",
        to_email: input.toEmail ?? undefined,
        html_template: input.html,
        variables: input.variables,
      },
      config: notificationsConfig(),
      ctx,
    });
  } catch (err) {
    console.error(
      JSON.stringify({ level: "error", scope: "soc2.approvals", msg: "notify_failed", error: String(err) }),
    );
  }
}

/** Look up a user's email (for notification addressing). */
async function emailOf(db: ReturnType<typeof buildDb>, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const rows = await db.query<{ email: string }>(
    `SELECT email FROM users WHERE id = $1::uuid LIMIT 1`,
    userId,
  );
  return rows[0]?.email ?? null;
}

/**
 * Assemble everything the review page needs for `policyId`, scoped to the
 * signed-in user's organization. Throws a coded Error (see ERROR_MESSAGES) when
 * the session/org/policy cannot be resolved.
 */
export async function getPolicyReviewPageData(policyId: string): Promise<PolicyReviewPageData> {
  const octx = await resolveOrgContext();
  if (!octx) throw new Error("UNAUTHORIZED");
  const db = buildDb();

  const policyRows = await db.query<Record<string, unknown>>(
    `SELECT id, organization_id, policy_key, title, status, current_version_id, approved_version_id, created_by
       FROM soc2_policies
      WHERE id = $1::uuid AND organization_id = $2::uuid
      LIMIT 1`,
    policyId,
    octx.orgId,
  );
  if (policyRows.length === 0) throw new Error("POLICY_NOT_FOUND");
  const p = policyRows[0];
  const status = normalizeStatus(p.status as string);

  // Current version under review.
  let reviewVersion: PolicyReviewPageData["reviewVersion"] = null;
  if (p.current_version_id) {
    const vrows = await db.query<Record<string, unknown>>(
      `SELECT id, policy_id, version_number, version_hash, body_markdown, change_summary,
              generated_by, generated_at, ai_disclaimer_acknowledged_at, ai_disclaimer_acknowledged_by
         FROM soc2_policy_versions
        WHERE id = $1::uuid AND policy_id = $2::uuid
        LIMIT 1`,
      p.current_version_id,
      p.id,
    );
    if (vrows.length > 0) {
      const v = vrows[0];
      reviewVersion = {
        id: String(v.id),
        policyId: String(v.policy_id),
        versionNumber: Number(v.version_number ?? 1),
        versionHash: String(v.version_hash ?? ""),
        bodyMarkdown: String(v.body_markdown ?? ""),
        changeSummary: String(v.change_summary ?? ""),
        generatedBy: v.generated_by ? String(v.generated_by) : null,
        generatedAt: String(v.generated_at ?? ""),
        aiDisclaimerAcknowledgedAt: v.ai_disclaimer_acknowledged_at
          ? String(v.ai_disclaimer_acknowledged_at)
          : null,
        aiDisclaimerAcknowledgedBy: v.ai_disclaimer_acknowledged_by
          ? String(v.ai_disclaimer_acknowledged_by)
          : null,
      };
    }
  }

  // Last APPROVED version other than the one under review (for the diff).
  const apprRows = await db.query<Record<string, unknown>>(
    `SELECT v.id, v.version_number, v.version_hash, v.body_markdown,
            a.created_at AS approved_at, a.actor_user_id AS approved_by, a.actor_email AS approved_by_name
       FROM soc2_policy_approvals a
       JOIN soc2_policy_versions v ON v.id = a.version_id
      WHERE a.organization_id = $1::uuid
        AND a.policy_id = $2::uuid
        AND a.decision = 'approve'
        AND ($3::uuid IS NULL OR a.version_id <> $3::uuid)
      ORDER BY a.created_at DESC
      LIMIT 1`,
    octx.orgId,
    p.id,
    reviewVersion?.id ?? null,
  );
  const previousApprovedVersion =
    apprRows.length > 0
      ? {
          id: String(apprRows[0].id),
          versionNumber: Number(apprRows[0].version_number ?? 1),
          versionHash: String(apprRows[0].version_hash ?? ""),
          bodyMarkdown: String(apprRows[0].body_markdown ?? ""),
          approvedAt: String(apprRows[0].approved_at ?? ""),
          approvedBy: apprRows[0].approved_by ? String(apprRows[0].approved_by) : null,
          approvedByName: apprRows[0].approved_by_name ? String(apprRows[0].approved_by_name) : null,
        }
      : null;

  const diff = reviewVersion
    ? diffLines(previousApprovedVersion?.bodyMarkdown ?? "", reviewVersion.bodyMarkdown)
    : [];

  // Current reviewer assignment (latest row for this version).
  let currentAssignee: PolicyReviewPageData["currentAssignee"] = null;
  if (reviewVersion) {
    const asg = await db.query<Record<string, unknown>>(
      `SELECT reviewer_user_id, reviewer_email, created_at
         FROM soc2_policy_review_assignments
        WHERE organization_id = $1::uuid AND version_id = $2::uuid
        ORDER BY created_at DESC
        LIMIT 1`,
      octx.orgId,
      reviewVersion.id,
    );
    if (asg.length > 0) {
      currentAssignee = {
        reviewerUserId: String(asg[0].reviewer_user_id),
        reviewerEmail: asg[0].reviewer_email ? String(asg[0].reviewer_email) : null,
        assignedAt: String(asg[0].created_at ?? ""),
      };
    }
  }

  const eligibleReviewers = await loadEligibleReviewers(db, octx.orgId);
  const viewerRole = await roleOf(db, octx.orgId, octx.user.id);
  const viewerIsDrafter = reviewVersion?.generatedBy === octx.user.id;
  const viewerCanApprove =
    (viewerRole === "owner" || viewerRole === "admin") && !viewerIsDrafter && reviewVersion !== null;

  // Approved-stamp fields (approver name/date/hash) — read from the approved
  // version pointer so the stamp survives even after a later re-review.
  let approvedStamp: PolicyReviewPageData["approvedStamp"] = {
    show: false,
    approverName: null,
    approvedAt: null,
    versionHash: null,
  };
  if (status === "approved" && p.approved_version_id) {
    const stampRows = await db.query<Record<string, unknown>>(
      `SELECT v.version_hash, a.created_at AS approved_at, a.actor_email, a.actor_name
         FROM soc2_policy_versions v
         LEFT JOIN soc2_policy_approvals a
           ON a.version_id = v.id AND a.decision = 'approve'
        WHERE v.id = $1::uuid
        ORDER BY a.created_at DESC
        LIMIT 1`,
      p.approved_version_id,
    );
    if (stampRows.length > 0) {
      const s = stampRows[0];
      approvedStamp = {
        show: true,
        approverName: (s.actor_name as string | null) ?? (s.actor_email as string | null) ?? null,
        approvedAt: s.approved_at ? String(s.approved_at) : null,
        versionHash: s.version_hash ? String(s.version_hash) : null,
      };
    }
  }

  const clauses = reviewVersion ? splitIntoClauses(reviewVersion.bodyMarkdown) : [];
  const clauseThreads = clauses.map((clause) => ({
    ...clause,
    proposedThreadShape: {
      provider: "@nexus/social-and-engagement" as const,
      threadKey: `soc2:${String(p.id)}:${reviewVersion?.id ?? "none"}:${clause.clauseId}`,
      entityType: "soc2_policy_clause_review" as const,
      entityId: `${reviewVersion?.id ?? "none"}:${clause.clauseId}`,
      metadata: {
        policyId: String(p.id),
        versionId: reviewVersion?.id ?? "",
        clauseId: clause.clauseId,
      },
    },
  }));

  return {
    policy: {
      id: String(p.id),
      organizationId: String(p.organization_id),
      policyKey: String(p.policy_key),
      title: String(p.title),
      status,
      currentVersionId: p.current_version_id ? String(p.current_version_id) : null,
      approvedVersionId: p.approved_version_id ? String(p.approved_version_id) : null,
    },
    reviewVersion,
    previousApprovedVersion,
    diffLines: diff,
    eligibleReviewers,
    currentAssignee,
    viewerCanApprove,
    viewerIsDrafter: Boolean(viewerIsDrafter),
    pendingBanner: {
      show: status === "in_review",
      message:
        "This policy version is pending human sign-off. Auditor export stays blocked until an owner or admin approves it.",
    },
    approvedStamp,
    clauseThreads,
  };
}

/**
 * Move a policy from draft into review. Idempotent-ish: only a draft (or a
 * superseded policy being re-drafted) can enter review. Owner/admin or the
 * drafter may submit.
 */
export async function submitPolicyForReview(policyId: string, versionId: string): Promise<DecisionResult> {
  const octx = await resolveOrgContext();
  if (!octx) return { ok: false, error: "UNAUTHORIZED", message: ERROR_MESSAGES.UNAUTHORIZED };
  const db = buildDb();

  const rows = await db.query<Record<string, unknown>>(
    `SELECT id, status, current_version_id, title FROM soc2_policies
      WHERE id = $1::uuid AND organization_id = $2::uuid LIMIT 1`,
    policyId,
    octx.orgId,
  );
  if (rows.length === 0) return { ok: false, error: "POLICY_NOT_FOUND", message: ERROR_MESSAGES.POLICY_NOT_FOUND };
  const policy = rows[0];
  if (policy.current_version_id !== versionId) {
    return { ok: false, error: "VERSION_MISMATCH", message: ERROR_MESSAGES.VERSION_MISMATCH };
  }

  await db.execute(
    `UPDATE soc2_policies SET status = 'in_review', updated_at = now()
      WHERE id = $1::uuid AND organization_id = $2::uuid`,
    policyId,
    octx.orgId,
  );

  await auditTransition(db, {
    actorUserId: octx.user.id,
    action: "soc2.policy.review.submitted",
    policyId,
    payload: { fromStatus: normalizeStatus(policy.status as string), toStatus: "in_review", versionId },
  });

  return { ok: true, newStatus: "in_review", message: "Policy submitted for review." };
}

/**
 * Assign a reviewer to the current version. The target must be an owner/admin
 * of the org. Writes an assignment row, audits, and notifies the reviewer.
 */
export async function assignReviewer(params: {
  policyId: string;
  versionId: string;
  reviewerUserId: string;
  note?: string;
}): Promise<DecisionResult> {
  const octx = await resolveOrgContext();
  if (!octx) return { ok: false, error: "UNAUTHORIZED", message: ERROR_MESSAGES.UNAUTHORIZED };
  const db = buildDb();

  // Only an owner/admin may assign reviewers.
  const actorRole = await roleOf(db, octx.orgId, octx.user.id);
  if (actorRole !== "owner" && actorRole !== "admin") {
    return { ok: false, error: "ROLE_FORBIDDEN", message: ERROR_MESSAGES.ROLE_FORBIDDEN };
  }

  const pRows = await db.query<Record<string, unknown>>(
    `SELECT id, title, current_version_id FROM soc2_policies
      WHERE id = $1::uuid AND organization_id = $2::uuid LIMIT 1`,
    params.policyId,
    octx.orgId,
  );
  if (pRows.length === 0) return { ok: false, error: "POLICY_NOT_FOUND", message: ERROR_MESSAGES.POLICY_NOT_FOUND };
  const policy = pRows[0];
  if (policy.current_version_id !== params.versionId) {
    return { ok: false, error: "VERSION_MISMATCH", message: ERROR_MESSAGES.VERSION_MISMATCH };
  }

  const reviewerRole = await roleOf(db, octx.orgId, params.reviewerUserId);
  if (reviewerRole !== "owner" && reviewerRole !== "admin") {
    return { ok: false, error: "ROLE_FORBIDDEN", message: ERROR_MESSAGES.ROLE_FORBIDDEN };
  }

  const vRows = await db.query<{ version_hash: string }>(
    `SELECT version_hash FROM soc2_policy_versions WHERE id = $1::uuid AND policy_id = $2::uuid LIMIT 1`,
    params.versionId,
    params.policyId,
  );
  if (vRows.length === 0) return { ok: false, error: "VERSION_NOT_FOUND", message: ERROR_MESSAGES.VERSION_NOT_FOUND };
  const versionHash = vRows[0].version_hash;

  const reviewerEmail = await emailOf(db, params.reviewerUserId);

  await db.execute(
    `INSERT INTO soc2_policy_review_assignments
       (organization_id, policy_id, version_id, version_hash, reviewer_user_id, reviewer_email,
        status, assigned_by, assigned_by_email, note)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6, 'assigned', $7::uuid, $8, $9)`,
    octx.orgId,
    params.policyId,
    params.versionId,
    versionHash,
    params.reviewerUserId,
    reviewerEmail,
    octx.user.id,
    octx.user.email,
    (params.note ?? "").trim(),
  );

  await auditTransition(db, {
    actorUserId: octx.user.id,
    action: "soc2.policy.review.assigned",
    policyId: params.policyId,
    payload: { versionId: params.versionId, reviewerUserId: params.reviewerUserId, versionHash },
  });

  const ctx: HandlerContext = { db, events: buildEventBus() };
  await notifyUser(ctx, {
    userId: params.reviewerUserId,
    toEmail: reviewerEmail,
    html: [
      "<h2>You've been asked to review a SOC 2 policy</h2>",
      `<p><strong>{{policy_title}}</strong> is awaiting your sign-off before auditor handoff.</p>`,
      "<p>Open the policy review page to compare the version diff, read the per-clause comments, and approve or request changes.</p>",
    ].join("\n"),
    variables: { policy_title: String(policy.title) },
  });

  return { ok: true, newStatus: "in_review", message: "Reviewer assigned." };
}

/**
 * The sign-off gate itself. Enforces (owner/admin) + (not drafter) + (disclaimer
 * acknowledged for the exact version hash) before approving; records the
 * approval, advances the status machine, supersedes any prior approved version,
 * audits, and notifies the drafter.
 */
export async function decidePolicyVersion(params: {
  policyId: string;
  versionId: string;
  /** The hash the reviewer saw in the UI — compared to the stored hash. */
  versionHash: string;
  decision: ReviewDecision;
  /** Must be true to approve — this is the per-version disclaimer tick. */
  acknowledgeDisclaimer?: boolean;
  reviewComment?: string;
  requestChangesReason?: string;
}): Promise<DecisionResult> {
  const octx = await resolveOrgContext();
  if (!octx) return { ok: false, error: "UNAUTHORIZED", message: ERROR_MESSAGES.UNAUTHORIZED };
  const db = buildDb();

  // (a) Role gate — owner/admin only.
  const actorRole = await roleOf(db, octx.orgId, octx.user.id);
  if (actorRole !== "owner" && actorRole !== "admin") {
    return { ok: false, error: "ROLE_FORBIDDEN", message: ERROR_MESSAGES.ROLE_FORBIDDEN };
  }

  const pRows = await db.query<Record<string, unknown>>(
    `SELECT id, organization_id, title, status, current_version_id, approved_version_id
       FROM soc2_policies
      WHERE id = $1::uuid AND organization_id = $2::uuid
      LIMIT 1`,
    params.policyId,
    octx.orgId,
  );
  if (pRows.length === 0) return { ok: false, error: "POLICY_NOT_FOUND", message: ERROR_MESSAGES.POLICY_NOT_FOUND };
  const policy = pRows[0];
  const fromStatus = normalizeStatus(policy.status as string);

  if (policy.current_version_id !== params.versionId) {
    return { ok: false, error: "VERSION_MISMATCH", message: ERROR_MESSAGES.VERSION_MISMATCH };
  }

  const vRows = await db.query<Record<string, unknown>>(
    `SELECT id, generated_by, version_hash FROM soc2_policy_versions
      WHERE id = $1::uuid AND policy_id = $2::uuid LIMIT 1`,
    params.versionId,
    params.policyId,
  );
  if (vRows.length === 0) return { ok: false, error: "VERSION_NOT_FOUND", message: ERROR_MESSAGES.VERSION_NOT_FOUND };
  const version = vRows[0];
  const storedHash = String(version.version_hash ?? "");
  const generatedBy = version.generated_by ? String(version.generated_by) : null;

  // (c') Exact-version guard — the hash the reviewer approved must still be the
  // stored one, so a regenerated body can't inherit a stale sign-off.
  if (!params.versionHash || params.versionHash !== storedHash) {
    return { ok: false, error: "HASH_MISMATCH", message: ERROR_MESSAGES.HASH_MISMATCH };
  }

  const decision = params.decision;

  if (decision === "approve") {
    // (b) Self-approval gate.
    if (generatedBy && generatedBy === octx.user.id) {
      return { ok: false, error: "SELF_APPROVAL_FORBIDDEN", message: ERROR_MESSAGES.SELF_APPROVAL_FORBIDDEN };
    }
    // (c) Disclaimer must be ticked for THIS version hash.
    if (params.acknowledgeDisclaimer !== true) {
      return { ok: false, error: "DISCLAIMER_REQUIRED", message: ERROR_MESSAGES.DISCLAIMER_REQUIRED };
    }

    // Record the approver's per-version disclaimer acknowledgment.
    await db.execute(
      `UPDATE soc2_policy_versions
          SET ai_disclaimer_acknowledged_at = now(),
              ai_disclaimer_acknowledged_by = $1::uuid,
              approved_at = now(),
              approved_by = $1::uuid
        WHERE id = $2::uuid AND policy_id = $3::uuid`,
      octx.user.id,
      params.versionId,
      params.policyId,
    );

    // Supersede a different previously-approved version, if any.
    const priorApprovedId =
      policy.approved_version_id && String(policy.approved_version_id) !== params.versionId
        ? String(policy.approved_version_id)
        : null;

    await db.execute(
      `UPDATE soc2_policies
          SET status = 'approved', approved_version_id = $1::uuid, updated_at = now()
        WHERE id = $2::uuid AND organization_id = $3::uuid`,
      params.versionId,
      params.policyId,
      octx.orgId,
    );

    await db.execute(
      `INSERT INTO soc2_policy_approvals
         (organization_id, policy_id, version_id, decision, actor_user_id, actor_name, actor_email, comment)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'approve', $4::uuid, $5, $6, $7)`,
      octx.orgId,
      params.policyId,
      params.versionId,
      octx.user.id,
      octx.user.email,
      octx.user.email,
      (params.reviewComment ?? "").trim(),
    );

    await db.execute(
      `UPDATE soc2_policy_review_assignments SET status = 'approved'
        WHERE organization_id = $1::uuid AND version_id = $2::uuid`,
      octx.orgId,
      params.versionId,
    );

    await auditTransition(db, {
      actorUserId: octx.user.id,
      action: "soc2.policy.review.approved",
      policyId: params.policyId,
      payload: {
        fromStatus,
        toStatus: "approved",
        versionId: params.versionId,
        versionHash: storedHash,
        supersededVersionId: priorApprovedId,
        disclaimerAcknowledged: true,
      },
    });

    const ctx: HandlerContext = { db, events: buildEventBus() };
    await notifyUser(ctx, {
      userId: generatedBy ?? octx.user.id,
      toEmail: await emailOf(db, generatedBy),
      html: [
        "<h2>Your SOC 2 policy was approved</h2>",
        `<p><strong>{{policy_title}}</strong> was signed off by {{reviewer}}.</p>`,
        "<p>Version hash: <code>{{version_hash}}</code>. The approved stamp now travels with the auditor handoff package.</p>",
      ].join("\n"),
      variables: {
        policy_title: String(policy.title),
        reviewer: octx.user.email,
        version_hash: storedHash,
      },
    });

    return { ok: true, newStatus: "approved", message: "Policy version approved and stamped." };
  }

  // decision === "request_changes"
  const reason = (params.requestChangesReason ?? "").trim();
  if (reason.length === 0) {
    return { ok: false, error: "REASON_REQUIRED", message: ERROR_MESSAGES.REASON_REQUIRED };
  }

  await db.execute(
    `UPDATE soc2_policies SET status = 'draft', updated_at = now()
      WHERE id = $1::uuid AND organization_id = $2::uuid`,
    params.policyId,
    octx.orgId,
  );

  await db.execute(
    `INSERT INTO soc2_policy_approvals
       (organization_id, policy_id, version_id, decision, actor_user_id, actor_name, actor_email, comment)
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'request_changes', $4::uuid, $5, $6, $7)`,
    octx.orgId,
    params.policyId,
    params.versionId,
    octx.user.id,
    octx.user.email,
    octx.user.email,
    reason,
  );

  await db.execute(
    `UPDATE soc2_policy_review_assignments SET status = 'changes_requested'
      WHERE organization_id = $1::uuid AND version_id = $2::uuid`,
    octx.orgId,
    params.versionId,
  );

  await auditTransition(db, {
    actorUserId: octx.user.id,
    action: "soc2.policy.review.changes_requested",
    policyId: params.policyId,
    payload: { fromStatus, toStatus: "draft", versionId: params.versionId, versionHash: storedHash, reason },
  });

  const ctx: HandlerContext = { db, events: buildEventBus() };
  await notifyUser(ctx, {
    userId: generatedBy ?? octx.user.id,
    toEmail: await emailOf(db, generatedBy),
    html: [
      "<h2>Changes were requested on your SOC 2 policy</h2>",
      `<p><strong>{{policy_title}}</strong> needs revision before it can be approved.</p>`,
      "<p>Reviewer note: {{reason}}</p>",
    ].join("\n"),
    variables: { policy_title: String(policy.title), reason },
  });

  return { ok: true, newStatus: "draft", message: "Changes requested — the draft was returned to the author." };
}

/** Map a thrown error code to a friendly message for page-level display. */
export function describeApprovalError(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error);
  return ERROR_MESSAGES[code] ?? "Something went wrong while loading the review.";
}
