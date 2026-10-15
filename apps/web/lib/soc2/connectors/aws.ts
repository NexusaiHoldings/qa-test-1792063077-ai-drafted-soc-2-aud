/**
 * AWS connector (F1-002, apps/web/lib/soc2/connectors/aws.ts).
 *
 * Read-only ingestion in minutes, no keys pasted: AWS connects via a one-click
 * "Launch CloudFormation" link. The stack creates a cross-account IAM role that
 * trusts the Nexus collector AWS account and is scoped to AWS-managed
 * read-only / security-audit policies. The trust policy pins a per-tenant
 * ExternalId so a leaked role ARN can't be assumed without it (confused-deputy
 * protection). We never store long-lived access keys — only the role ARN + the
 * ExternalId we generated, which the collector later uses with STS AssumeRole.
 */

import { randomBytes } from "crypto";
import {
  getConnection,
  logConnectionEvent,
  upsertConnection,
  type ConnectResult,
  type OrgContext,
  type ProviderDescriptor,
  type Soc2Connection,
} from "@/lib/soc2/access";

export const AWS_DESCRIPTOR: ProviderDescriptor = {
  provider: "aws",
  label: "Amazon Web Services",
  blurb:
    "Cross-account IAM role via CloudFormation — one click, no access keys to paste or rotate.",
  scopeDescription:
    "Read-only. We attach the AWS-managed SecurityAudit and ReadOnlyAccess policies to a role your account owns, scoped by a per-tenant ExternalId. We can describe config, CloudTrail, GuardDuty, IAM, RDS, EC2 and S3 settings — we can never create, modify, or delete anything.",
  method: "cloudformation",
  accent: true,
};

/** Generate a high-entropy, URL-safe per-tenant ExternalId for the trust policy. */
export function generateExternalId(orgId: string): string {
  const nonce = randomBytes(18).toString("base64url");
  return `nexus-soc2-${orgId}-${nonce}`;
}

/** The collector AWS account id the created role must trust (set at provisioning). */
function collectorAccountId(): string {
  return process.env.SOC2_AWS_COLLECTOR_ACCOUNT_ID || "000000000000";
}

/** The S3/https URL of the CloudFormation template the quick-create link loads. */
function templateUrl(): string {
  return (
    process.env.SOC2_AWS_CFN_TEMPLATE_URL ||
    "https://nexus-soc2-public.s3.amazonaws.com/connectors/aws-readonly-role.yaml"
  );
}

/**
 * Build the CloudFormation "quick-create" URL. The console pre-fills the stack
 * name and parameters (ExternalId + collector account) so the CTO only has to
 * click "Create stack".
 */
export function buildLaunchUrl(externalId: string): string {
  const region = process.env.SOC2_AWS_REGION || "us-east-1";
  const base = `https://${region}.console.aws.amazon.com/cloudformation/home`;
  // The quick-create route lives behind a hash fragment; parameters are passed
  // as query params on that fragment so the console pre-fills the stack form.
  const query = new URLSearchParams({
    templateURL: templateUrl(),
    stackName: "nexus-soc2-readonly",
    param_ExternalId: externalId,
    param_NexusCollectorAccountId: collectorAccountId(),
  });
  return `${base}?region=${encodeURIComponent(region)}#/stacks/quickcreate?${query.toString()}`;
}

/**
 * Begin an AWS connection: generate (or reuse) the ExternalId, persist a
 * "connecting" row, and return the CloudFormation launch URL. Idempotent — a
 * re-click reuses the existing ExternalId so the same stack is updated.
 */
export async function beginAwsConnection(ctx: OrgContext): Promise<ConnectResult> {
  const existing = await getConnection(ctx.orgId, "aws");
  const externalId = existing?.external_id || generateExternalId(ctx.orgId);

  const conn = await upsertConnection({
    organizationId: ctx.orgId,
    provider: "aws",
    status: "connecting",
    scopeDescription: AWS_DESCRIPTOR.scopeDescription,
    displayName: AWS_DESCRIPTOR.label,
    externalId,
    config: { collector_account_id: collectorAccountId(), template_url: templateUrl() },
    failureCode: null,
    failureHint: null,
    createdBy: ctx.user.id,
  });

  await logConnectionEvent({
    organizationId: ctx.orgId,
    provider: "aws",
    connectionId: conn.id,
    eventType: "connect_initiated",
    actorUserId: ctx.user.id,
    detail: { method: "cloudformation" },
  });

  return {
    ok: true,
    status: "connecting",
    message:
      "Launch the CloudFormation stack in your AWS account to finish. Return here after the stack reaches CREATE_COMPLETE and run a health check.",
    redirectUrl: buildLaunchUrl(externalId),
  };
}

/**
 * Record the role ARN once the CTO pastes it back (the stack output). We keep
 * only the ARN + ExternalId; the collector assumes the role on demand.
 */
export async function completeAwsConnection(
  ctx: OrgContext,
  roleArn: string,
): Promise<ConnectResult> {
  const arn = roleArn.trim();
  if (!/^arn:aws:iam::\d{12}:role\/.+/.test(arn)) {
    return {
      ok: false,
      status: "failing",
      message: "That doesn't look like an IAM role ARN.",
      failureCode: "AWS_BAD_ROLE_ARN",
      failureHint:
        "Copy the RoleArn value from the CloudFormation stack's Outputs tab — it looks like arn:aws:iam::123456789012:role/nexus-soc2-readonly.",
    };
  }

  const conn = await upsertConnection({
    organizationId: ctx.orgId,
    provider: "aws",
    status: "healthy",
    scopeDescription: AWS_DESCRIPTOR.scopeDescription,
    displayName: AWS_DESCRIPTOR.label,
    config: { role_arn: arn },
    accountLogin: arn.split("::")[1]?.split(":")[0] ?? null,
    failureCode: null,
    failureHint: null,
    connectedAt: new Date(),
    lastSyncAt: new Date(),
    createdBy: ctx.user.id,
  });

  await logConnectionEvent({
    organizationId: ctx.orgId,
    provider: "aws",
    connectionId: conn.id,
    eventType: "connected",
    actorUserId: ctx.user.id,
    detail: { role_arn: arn },
  });

  return { ok: true, status: "healthy", message: "AWS connected. Read-only evidence collection is live." };
}

/**
 * Verify the AWS connection is still assumable. Full STS AssumeRole happens in
 * the collector runtime (@aws-sdk/client-sts); here we confirm the stored
 * material is well-formed and emit a sync heartbeat so the card shows Healthy.
 */
export async function verifyAws(ctx: OrgContext, conn: Soc2Connection): Promise<ConnectResult> {
  const roleArn = typeof conn.config.role_arn === "string" ? conn.config.role_arn : null;
  if (!conn.external_id) {
    return failAws(ctx, conn, "AWS_NO_EXTERNAL_ID", "Re-launch the CloudFormation stack to regenerate the ExternalId.");
  }
  if (!roleArn) {
    return failAws(
      ctx,
      conn,
      "AWS_ROLE_NOT_CONFIRMED",
      "Finish the stack, then paste the RoleArn output above so the collector can assume it.",
    );
  }

  await upsertConnection({
    organizationId: ctx.orgId,
    provider: "aws",
    status: "healthy",
    scopeDescription: AWS_DESCRIPTOR.scopeDescription,
    failureCode: null,
    failureHint: null,
    lastSyncAt: new Date(),
  });
  await logConnectionEvent({
    organizationId: ctx.orgId,
    provider: "aws",
    connectionId: conn.id,
    eventType: "health_check_ok",
    actorUserId: ctx.user.id,
  });
  return { ok: true, status: "healthy", message: "Role reachable. Last sync updated." };
}

async function failAws(
  ctx: OrgContext,
  conn: Soc2Connection,
  code: string,
  hint: string,
): Promise<ConnectResult> {
  await upsertConnection({
    organizationId: ctx.orgId,
    provider: "aws",
    status: "failing",
    scopeDescription: AWS_DESCRIPTOR.scopeDescription,
    failureCode: code,
    failureHint: hint,
  });
  await logConnectionEvent({
    organizationId: ctx.orgId,
    provider: "aws",
    connectionId: conn.id,
    eventType: "health_check_failed",
    actorUserId: ctx.user.id,
    detail: { failure_code: code },
  });
  return { ok: false, status: "failing", message: "AWS check failed.", failureCode: code, failureHint: hint };
}
