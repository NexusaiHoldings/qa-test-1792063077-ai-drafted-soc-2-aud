import { Pool } from "pg";
import { getServerSession } from "@nexus/identity-and-access";
import { getOrganizationContext, isOrganizationUserInRoles } from "@nexus/organizations-and-teams";
import { logAuditEvent } from "@nexus/admin-console";
import { sendNotification } from "@nexus/notifications";

type PolicyStatus = "draft" | "in_review" | "approved" | "superseded";

type ReviewerRole = "owner" | "admin";

type PolicyReviewRow = {
  policy_id: string;
  policy_title: string;
  policy_status: string;
  policy_key: string;
  version_id: string;
  version_number: number;
  version_hash: string;
  version_status: string;
  content_markdown: string;
  generated_by: string | null;
  reviewer_user_id: string | null;
  approved_at: string | null;
  approved_by: string | null;
};

type PolicyVersionDiff = {
  fromVersionId: string | null;
  toVersionId: string;
  addedLines: number;
  removedLines: number;
  changedLines: number;
  preview: string[];
};

type ReviewOverview = {
  organizationId: string;
  policyId: string;
  policyKey: string;
  title: string;
  policyStatus: string;
  currentVersionId: string;
  currentVersionNumber: number;
  currentVersionHash: string;
  currentVersionStatus: string;
  generatedBy: string | null;
  assignedReviewerId: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  previousApprovedVersionId: string | null;
  previousApprovedVersionNumber: number | null;
  previousApprovedVersionHash: string | null;
  diff: PolicyVersionDiff | null;
  hasAckForCurrentVersion: boolean;
  clauseThreadsShape: Array<{
    clauseKey: string;
    threadType: "social_comment_thread";
    entity: "soc2_policy_clause";
    entityId: string;
    proposedTopic: string;
  }>;
};

const REVIEWER_ROLES: ReviewerRole[] = ["owner", "admin"];
const APPROVABLE_FROM: PolicyStatus[] = ["in_review"];

let poolRef: Pool | null = null;

function getPool(): Pool {
  if (poolRef) return poolRef;
  const connectionString: string | undefined = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }
  poolRef = new Pool({ connectionString });
  return poolRef;
}

function assertStatusTransition(fromStatus: string, toStatus: PolicyStatus): void {
  if (toStatus === "in_review" && fromStatus !== "draft") {
    throw new Error("Only draft versions may be submitted for review");
  }
  if (toStatus === "approved" && !APPROVABLE_FROM.includes(fromStatus as PolicyStatus)) {
    throw new Error("Only in-review versions may be approved");
  }
  if (toStatus === "superseded" && fromStatus !== "approved") {
    throw new Error("Only approved versions may be superseded");
  }
}

function buildLineDiff(oldText: string, newText: string): PolicyVersionDiff {
  const oldLines: string[] = oldText.split("\n");
  const newLines: string[] = newText.split("\n");

  let i = 0;
  let j = 0;
  let added = 0;
  let removed = 0;
  const preview: string[] = [];

  while (i < oldLines.length || j < newLines.length) {
    const o = oldLines[i];
    const n = newLines[j];

    if (o === n) {
      i += 1;
      j += 1;
      continue;
    }

    if (n !== undefined) {
      added += 1;
      if (preview.length < 12) preview.push(`+ ${n}`);
      j += 1;
    }
    if (o !== undefined) {
      removed += 1;
      if (preview.length < 12) preview.push(`- ${o}`);
      i += 1;
    }
  }

  return {
    fromVersionId: null,
    toVersionId: "",
    addedLines: added,
    removedLines: removed,
    changedLines: Math.max(added, removed),
    preview,
  };
}

export async function requireSoc2Context(): Promise<{
  userId: string;
  organizationId: string;
  email: string | null;
}> {
  const session = await getServerSession();
  const userId = (session as { user?: { id?: string } })?.user?.id;
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const orgCtx = await getOrganizationContext();
  if (!orgCtx?.organizationId) {
    throw new Error("No active organization");
  }

  const email = (session as { user?: { email?: string } })?.user?.email ?? null;
  return { userId, organizationId: orgCtx.organizationId, email };
}

export async function getPolicyReviewOverview(policyId: string): Promise<ReviewOverview | null> {
  const { organizationId, userId } = await requireSoc2Context();
  const db = getPool();

  const review = await db.query<PolicyReviewRow>(
    `
    SELECT
      p.id AS policy_id,
      p.title AS policy_title,
      p.status AS policy_status,
      p.policy_key AS policy_key,
      v.id AS version_id,
      v.version_number,
      v.version_hash,
      v.status AS version_status,
      v.content_markdown,
      v.generated_by,
      v.reviewer_user_id,
      v.approved_at,
      p.approved_by
    FROM soc2_policies p
    INNER JOIN soc2_policy_versions v ON v.id = p.current_version_id
    WHERE p.organization_id = $1
      AND p.id = $2
    LIMIT 1
    `,
    [organizationId, policyId],
  );

  if (review.rowCount === 0) return null;
  const row = review.rows[0];

  const previousApproved = await db.query<{
    id: string;
    version_number: number;
    version_hash: string;
    content_markdown: string;
  }>(
    `
    SELECT id, version_number, version_hash, content_markdown
    FROM soc2_policy_versions
    WHERE organization_id = $1
      AND policy_id = $2
      AND status = 'approved'
      AND id <> $3
    ORDER BY approved_at DESC NULLS LAST, version_number DESC
    LIMIT 1
    `,
    [organizationId, policyId, row.version_id],
  );

  let diff: PolicyVersionDiff | null = null;
  if (previousApproved.rowCount > 0) {
    const prev = previousApproved.rows[0];
    const base = buildLineDiff(prev.content_markdown, row.content_markdown);
    diff = {
      ...base,
      fromVersionId: prev.id,
      toVersionId: row.version_id,
    };
  }

  const ack = await db.query<{ acknowledged_by: string }>(
    `
    SELECT acknowledged_by
    FROM soc2_policy_review_disclaimers
    WHERE organization_id = $1
      AND policy_id = $2
      AND version_id = $3
      AND version_hash = $4
      AND acknowledged_by = $5
    LIMIT 1
    `,
    [organizationId, policyId, row.version_id, row.version_hash, userId],
  );

  const clauses = await db.query<{ id: string; clause_key: string; heading: string }>(
    `
    SELECT id, clause_key, heading
    FROM soc2_policy_clauses
    WHERE organization_id = $1
      AND version_id = $2
    ORDER BY sort_order ASC
    `,
    [organizationId, row.version_id],
  );

  return {
    organizationId,
    policyId: row.policy_id,
    policyKey: row.policy_key,
    title: row.policy_title,
    policyStatus: row.policy_status,
    currentVersionId: row.version_id,
    currentVersionNumber: row.version_number,
    currentVersionHash: row.version_hash,
    currentVersionStatus: row.version_status,
    generatedBy: row.generated_by,
    assignedReviewerId: row.reviewer_user_id,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    previousApprovedVersionId: previousApproved.rows[0]?.id ?? null,
    previousApprovedVersionNumber: previousApproved.rows[0]?.version_number ?? null,
    previousApprovedVersionHash: previousApproved.rows[0]?.version_hash ?? null,
    diff,
    hasAckForCurrentVersion: ack.rowCount > 0,
    clauseThreadsShape: clauses.rows.map((c) => ({
      clauseKey: c.clause_key,
      threadType: "social_comment_thread",
      entity: "soc2_policy_clause",
      entityId: c.id,
      proposedTopic: `${row.policy_title} • ${c.heading}`,
    })),
  };
}

export async function assignPolicyReviewer(
  policyId: string,
  versionId: string,
  reviewerUserId: string,
  note: string,
): Promise<void> {
  const { organizationId, userId } = await requireSoc2Context();
  const db = getPool();

  const canAssign = await isOrganizationUserInRoles({
    organizationId,
    userId,
    roles: REVIEWER_ROLES,
  });

  if (!canAssign) throw new Error("Only owner/admin can assign reviewers");

  await db.query(
    `
    INSERT INTO soc2_policy_review_assignments (
      organization_id, policy_id, version_id, assigned_reviewer_id, assigned_by, note
    ) VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [organizationId, policyId, versionId, reviewerUserId, userId, note],
  );

  await db.query(
    `
    UPDATE soc2_policy_versions
    SET reviewer_user_id = $1
    WHERE organization_id = $2
      AND policy_id = $3
      AND id = $4
    `,
    [reviewerUserId, organizationId, policyId, versionId],
  );

  await logAuditEvent({
    action: "soc2.policy.reviewer_assigned",
    entityType: "soc2_policy_version",
    entityId: versionId,
    organizationId,
    actorUserId: userId,
    detail: { policyId, reviewerUserId, note },
  });

  await sendNotification({
    organizationId,
    userId: reviewerUserId,
    channel: "in_app",
    title: "SOC 2 policy review requested",
    body: "You have been assigned to review a policy version.",
    metadata: { policyId, versionId },
  });
}

export async function acknowledgePolicyAiDisclaimer(
  policyId: string,
  versionId: string,
  versionHash: string,
  acknowledgmentText: string,
): Promise<void> {
  const { organizationId, userId } = await requireSoc2Context();
  const db = getPool();

  await db.query(
    `
    INSERT INTO soc2_policy_review_disclaimers (
      organization_id, policy_id, version_id, version_hash, acknowledged_by, acknowledgment_text
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (organization_id, version_id, version_hash, acknowledged_by) DO NOTHING
    `,
    [organizationId, policyId, versionId, versionHash, userId, acknowledgmentText],
  );

  await logAuditEvent({
    action: "soc2.policy.disclaimer_acknowledged",
    entityType: "soc2_policy_version",
    entityId: versionId,
    organizationId,
    actorUserId: userId,
    detail: { policyId, versionHash },
  });
}

export async function requestPolicyChanges(
  policyId: string,
  versionId: string,
  comment: string,
): Promise<void> {
  const { organizationId, userId } = await requireSoc2Context();
  const db = getPool();

  const row = await db.query<{ status: string }>(
    `
    SELECT status
    FROM soc2_policy_versions
    WHERE organization_id = $1
      AND policy_id = $2
      AND id = $3
    LIMIT 1
    `,
    [organizationId, policyId, versionId],
  );

  if (row.rowCount === 0) throw new Error("Policy version not found");

  const fromStatus = row.rows[0].status;
  assertStatusTransition(fromStatus, "in_review");

  await db.query(
    `
    UPDATE soc2_policy_versions
    SET status = 'draft', reviewer_comment = $1
    WHERE organization_id = $2
      AND policy_id = $3
      AND id = $4
    `,
    [comment, organizationId, policyId, versionId],
  );

  await db.query(
    `
    UPDATE soc2_policies
    SET status = 'draft', updated_at = now()
    WHERE organization_id = $1 AND id = $2
    `,
    [organizationId, policyId],
  );

  await db.query(
    `
    INSERT INTO soc2_policy_review_events (
      organization_id, policy_id, version_id, from_status, to_status, actor_user_id, comment
    ) VALUES ($1, $2, $3, $4, 'draft', $5, $6)
    `,
    [organizationId, policyId, versionId, fromStatus, userId, comment],
  );

  await logAuditEvent({
    action: "soc2.policy.request_changes",
    entityType: "soc2_policy_version",
    entityId: versionId,
    organizationId,
    actorUserId: userId,
    detail: { policyId, comment },
  });
}

export async function approvePolicyVersion(
  policyId: string,
  versionId: string,
  comment: string,
): Promise<void> {
  const { organizationId, userId } = await requireSoc2Context();
  const db = getPool();

  const canApprove = await isOrganizationUserInRoles({
    organizationId,
    userId,
    roles: REVIEWER_ROLES,
  });
  if (!canApprove) throw new Error("Only owner/admin can approve policy versions");

  const row = await db.query<{
    status: string;
    version_hash: string;
    generated_by: string | null;
  }>(
    `
    SELECT status, version_hash, generated_by
    FROM soc2_policy_versions
    WHERE organization_id = $1
      AND policy_id = $2
      AND id = $3
    LIMIT 1
    `,
    [organizationId, policyId, versionId],
  );
  if (row.rowCount === 0) throw new Error("Policy version not found");

  const current = row.rows[0];
  assertStatusTransition(current.status, "approved");
  if (current.generated_by && current.generated_by === userId) {
    throw new Error("Approver must be different from draft trigger user");
  }

  const ack = await db.query(
    `
    SELECT 1
    FROM soc2_policy_review_disclaimers
    WHERE organization_id = $1
      AND policy_id = $2
      AND version_id = $3
      AND version_hash = $4
      AND acknowledged_by = $5
    LIMIT 1
    `,
    [organizationId, policyId, versionId, current.version_hash, userId],
  );
  if (ack.rowCount === 0) {
    throw new Error("AI-content disclaimer acknowledgment is required for this version hash");
  }

  await db.query("BEGIN");
  try {
    await db.query(
      `
      UPDATE soc2_policy_versions
      SET status = 'superseded', superseded_at = now()
      WHERE organization_id = $1
        AND policy_id = $2
        AND status = 'approved'
        AND id <> $3
      `,
      [organizationId, policyId, versionId],
    );

    await db.query(
      `
      UPDATE soc2_policy_versions
      SET status = 'approved', approved_at = now(), reviewer_comment = $1, reviewer_user_id = $2
      WHERE organization_id = $3
        AND policy_id = $4
        AND id = $5
      `,
      [comment, userId, organizationId, policyId, versionId],
    );

    await db.query(
      `
      UPDATE soc2_policies
      SET status = 'approved',
          approved_version_id = $1,
          approved_by = $2,
          approved_at = now(),
          updated_at = now()
      WHERE organization_id = $3
        AND id = $4
      `,
      [versionId, userId, organizationId, policyId],
    );

    await db.query(
      `
      INSERT INTO soc2_policy_review_events (
        organization_id, policy_id, version_id, from_status, to_status, actor_user_id, comment, meta
      ) VALUES ($1, $2, $3, 'in_review', 'approved', $4, $5, $6::jsonb)
      `,
      [organizationId, policyId, versionId, userId, comment, JSON.stringify({ versionHash: current.version_hash })],
    );

    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }

  await logAuditEvent({
    action: "soc2.policy.approved",
    entityType: "soc2_policy_version",
    entityId: versionId,
    organizationId,
    actorUserId: userId,
    detail: { policyId, versionHash: current.version_hash },
  });

  await sendNotification({
    organizationId,
    channel: "in_app",
    title: "Policy version approved",
    body: "A SOC 2 policy version has been approved and stamped for auditor handoff.",
    metadata: { policyId, versionId, approverId: userId },
  });
}
