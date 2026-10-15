import { Pool } from "pg";
import { getServerSession } from "@nexus/identity-and-access";
import { getCurrentOrganizationContext } from "@nexus/organizations-and-teams";
import { logAuditEvent } from "@nexus/admin-console";
import { sendNotification } from "@nexus/notifications";

type PolicyReviewStatus = "draft" | "in_review" | "approved" | "superseded";
type ReviewDecision = "approve" | "request_changes";

export type PolicyReviewPageData = {
  policy: {
    id: string;
    organizationId: string;
    policyKey: string;
    title: string;
    status: PolicyReviewStatus;
    currentVersionId: string | null;
  };
  reviewVersion: {
    id: string;
    policyId: string;
    versionHash: string;
    bodyMarkdown: string;
    generatedBy: string | null;
    generatedAt: string;
    aiDisclaimerAcknowledgedAt: string | null;
    aiDisclaimerAcknowledgedBy: string | null;
  } | null;
  previousApprovedVersion: {
    id: string;
    versionHash: string;
    bodyMarkdown: string;
    approvedAt: string;
    approvedBy: string;
    approvedByName: string | null;
  } | null;
  pendingBanner: {
    show: boolean;
    message: string;
  };
  approvedStamp: {
    show: boolean;
    approverName: string | null;
    approvedAt: string | null;
    versionHash: string | null;
  };
  clauseThreads: Array<{
    clauseId: string;
    title: string;
    excerpt: string;
    proposedThreadShape: {
      provider: "@nexus/social-and-engagement";
      threadKey: string;
      entityType: "soc2_policy_clause_review";
      entityId: string;
      metadata: Record<string, string>;
    };
  }>;
};

type DbClient = {
  query: <T = unknown>(text: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function normalizeStatus(status: string): PolicyReviewStatus {
  if (status === "in_review" || status === "approved" || status === "superseded") {
    return status;
  }
  return "draft";
}

function splitIntoClauses(markdown: string): Array<{ clauseId: string; title: string; excerpt: string }> {
  const lines = markdown.split("\n");
  const clauses: Array<{ clauseId: string; title: string; excerpt: string }> = [];
  let currentTitle = "Clause 1";
  let currentBody: string[] = [];
  let index = 1;

  const flush = (): void => {
    if (currentBody.length === 0) return;
    const excerpt = currentBody.join(" ").replace(/\s+/g, " ").trim().slice(0, 220);
    clauses.push({
      clauseId: `clause-${index}`,
      title: currentTitle,
      excerpt: excerpt.length > 0 ? excerpt : "No content.",
    });
    index += 1;
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      currentTitle = line.replace(/^##\s+/, "").trim() || `Clause ${index}`;
      currentBody = [];
      continue;
    }
    currentBody.push(line);
  }
  flush();

  if (clauses.length === 0) {
    return [
      {
        clauseId: "clause-1",
        title: "Policy text",
        excerpt: markdown.slice(0, 220),
      },
    ];
  }

  return clauses;
}

async function requireOrgAndUser(): Promise<{ organizationId: string; userId: string; userName: string | null; userEmail: string | null }> {
  const session = await getServerSession();
  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }

  const orgCtx = await getCurrentOrganizationContext();
  if (!orgCtx?.organizationId) {
    throw new Error("ORG_REQUIRED");
  }

  return {
    organizationId: orgCtx.organizationId,
    userId: session.user.id,
    userName: session.user.name ?? null,
    userEmail: session.user.email ?? null,
  };
}

export async function getPolicyReviewPageData(policyId: string): Promise<PolicyReviewPageData> {
  const auth = await requireOrgAndUser();
  const db = pool as unknown as DbClient;

  const policyRes = await db.query<{
    id: string;
    organization_id: string;
    policy_key: string;
    title: string;
    status: string;
    current_version_id: string | null;
  }>(
    `SELECT id, organization_id, policy_key, title, status, current_version_id
     FROM soc2_policies
     WHERE id = $1 AND organization_id = $2
     LIMIT 1`,
    [policyId, auth.organizationId],
  );

  if (policyRes.rows.length === 0) {
    throw new Error("POLICY_NOT_FOUND");
  }

  const policyRow = policyRes.rows[0];

  let reviewVersion: PolicyReviewPageData["reviewVersion"] = null;
  if (policyRow.current_version_id) {
    const versionRes = await db.query<{
      id: string;
      policy_id: string;
      version_hash: string;
      body_markdown: string;
      generated_by: string | null;
      generated_at: string;
      ai_disclaimer_acknowledged_at: string | null;
      ai_disclaimer_acknowledged_by: string | null;
    }>(
      `SELECT id, policy_id, version_hash, body_markdown, generated_by, generated_at,
              ai_disclaimer_acknowledged_at, ai_disclaimer_acknowledged_by
       FROM soc2_policy_versions
       WHERE id = $1 AND policy_id = $2
       LIMIT 1`,
      [policyRow.current_version_id, policyRow.id],
    );
    if (versionRes.rows.length > 0) {
      reviewVersion = versionRes.rows[0];
    }
  }

  const approvedRes = await db.query<{
    id: string;
    version_hash: string;
    body_markdown: string;
    approved_at: string;
    approved_by: string;
    approved_by_name: string | null;
  }>(
    `SELECT v.id, v.version_hash, v.body_markdown, a.created_at AS approved_at,
            a.actor_name AS approved_by_name, a.actor_user_id AS approved_by
     FROM soc2_policy_approvals a
     JOIN soc2_policy_versions v ON v.id = a.version_id
     WHERE a.organization_id = $1
       AND a.policy_id = $2
       AND a.decision = 'approve'
     ORDER BY a.created_at DESC
     LIMIT 1`,
    [auth.organizationId, policyRow.id],
  );

  const previousApprovedVersion = approvedRes.rows[0] ?? null;

  const status = normalizeStatus(policyRow.status);
  const pendingBanner = {
    show: status === "in_review",
    message: "This policy version is pending human approval. Auditor export is blocked until sign-off.",
  };

  const approvedStamp = {
    show: status === "approved" && previousApprovedVersion !== null,
    approverName: previousApprovedVersion?.approved_by_name ?? null,
    approvedAt: previousApprovedVersion?.approved_at ?? null,
    versionHash: previousApprovedVersion?.version_hash ?? null,
  };

  const clauses = reviewVersion ? splitIntoClauses(reviewVersion.bodyMarkdown) : [];
  const clauseThreads = clauses.map((clause) => ({
    ...clause,
    proposedThreadShape: {
      provider: "@nexus/social-and-engagement" as const,
      threadKey: `soc2:${policyRow.id}:${reviewVersion?.id ?? "none"}:${clause.clauseId}`,
      entityType: "soc2_policy_clause_review" as const,
      entityId: `${reviewVersion?.id ?? "none"}:${clause.clauseId}`,
      metadata: {
        policyId: policyRow.id,
        versionId: reviewVersion?.id ?? "",
        clauseId: clause.clauseId,
      },
    },
  }));

  return {
    policy: {
      id: policyRow.id,
      organizationId: policyRow.organization_id,
      policyKey: policyRow.policy_key,
      title: policyRow.title,
      status,
      currentVersionId: policyRow.current_version_id,
    },
    reviewVersion,
    previousApprovedVersion,
    pendingBanner,
    approvedStamp,
    clauseThreads,
  };
}

async function requireReviewerRole(db: DbClient, organizationId: string, userId: string): Promise<void> {
  const roleRes = await db.query<{ role: string }>(
    `SELECT role
     FROM org_memberships
     WHERE organization_id = $1 AND user_id = $2
     LIMIT 1`,
    [organizationId, userId],
  );
  const role = roleRes.rows[0]?.role ?? "";
  if (role !== "owner" && role !== "admin") {
    throw new Error("ROLE_FORBIDDEN");
  }
}

export async function decidePolicyVersion(params: {
  policyId: string;
  versionId: string;
  decision: ReviewDecision;
  reviewComment?: string;
  requestChangesReason?: string;
}): Promise<{ ok: true; newStatus: PolicyReviewStatus }> {
  const auth = await requireOrgAndUser();
  const db = pool as unknown as DbClient;

  await requireReviewerRole(db, auth.organizationId, auth.userId);

  const policyRes = await db.query<{
    id: string;
    organization_id: string;
    title: string;
    status: string;
    current_version_id: string | null;
  }>(
    `SELECT id, organization_id, title, status, current_version_id
     FROM soc2_policies
     WHERE id = $1 AND organization_id = $2
     LIMIT 1`,
    [params.policyId, auth.organizationId],
  );
  if (policyRes.rows.length === 0) {
    throw new Error("POLICY_NOT_FOUND");
  }

  const policy = policyRes.rows[0];
  if (policy.current_version_id !== params.versionId) {
    throw new Error("VERSION_MISMATCH");
  }

  const versionRes = await db.query<{
    id: string;
    generated_by: string | null;
    version_hash: string;
    ai_disclaimer_acknowledged_at: string | null;
  }>(
    `SELECT id, generated_by, version_hash, ai_disclaimer_acknowledged_at
     FROM soc2_policy_versions
     WHERE id = $1 AND policy_id = $2
     LIMIT 1`,
    [params.versionId, params.policyId],
  );
  if (versionRes.rows.length === 0) {
    throw new Error("VERSION_NOT_FOUND");
  }

  const version = versionRes.rows[0];
  if (!version.ai_disclaimer_acknowledged_at) {
    throw new Error("DISCLAIMER_REQUIRED");
  }
  if (version.generated_by && version.generated_by === auth.userId) {
    throw new Error("SELF_APPROVAL_FORBIDDEN");
  }

  const decision = params.decision;
  const nextStatus: PolicyReviewStatus = decision === "approve" ? "approved" : "draft";

  await db.query(
    `INSERT INTO soc2_policy_approvals
      (id, organization_id, policy_id, version_id, decision, actor_user_id, actor_name, actor_email, comment, created_at)
     VALUES
      (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, now())`,
    [
      auth.organizationId,
      params.policyId,
      params.versionId,
      decision,
      auth.userId,
      auth.userName,
      auth.userEmail,
      (params.reviewComment ?? params.requestChangesReason ?? "").trim(),
    ],
  );

  await db.query(
    `UPDATE soc2_policies
     SET status = $1, updated_at = now()
     WHERE id = $2 AND organization_id = $3`,
    [nextStatus, params.policyId, auth.organizationId],
  );

  if (decision === "approve") {
    await db.query(
      `UPDATE soc2_policy_versions
       SET approved_at = now(), approved_by = $1
       WHERE id = $2`,
      [auth.userId, params.versionId],
    );
  }

  await logAuditEvent({
    action: "soc2.policy.review.transition",
    entityType: "soc2_policy",
    entityId: params.policyId,
    metadata: {
      fromStatus: policy.status,
      toStatus: nextStatus,
      decision,
      versionId: params.versionId,
      versionHash: version.version_hash,
    },
  });

  await sendNotification({
    channel: "in_app",
    templateKey: "soc2_policy_review_transition",
    recipientUserId: version.generated_by ?? auth.userId,
    data: {
      policyId: params.policyId,
      policyTitle: policy.title,
      decision,
      reviewerName: auth.userName ?? auth.userEmail ?? "Reviewer",
      versionHash: version.version_hash,
      comment: params.reviewComment ?? params.requestChangesReason ?? "",
    },
  });

  return { ok: true, newStatus: nextStatus };
}
