/**
 * GCP connector (F1-002, apps/web/lib/soc2/connectors/gcp.ts).
 *
 * GCP connects via a service-account JSON key granted roles/viewer +
 * roles/iam.securityReviewer at the project (or org) level. The CTO creates the
 * service account, grants those two read-only roles, downloads the JSON key and
 * uploads it here. We validate the key's shape, store ONLY the private material
 * in the envelope-encrypted vault, and keep the project id + client email in the
 * connection config for display. Collection (Cloud Asset Inventory /
 * resource-manager) runs server-side in the collector runtime.
 */

import {
  getConnection,
  logConnectionEvent,
  upsertConnection,
  type ConnectResult,
  type OrgContext,
  type ProviderDescriptor,
  type Soc2Connection,
} from "@/lib/soc2/access";
import { loadCredential, purgeCredential, storeCredential } from "@/lib/soc2/vault";
import { buildDb } from "@/lib/db";

export const GCP_DESCRIPTOR: ProviderDescriptor = {
  provider: "gcp",
  label: "Google Cloud Platform",
  blurb: "Service-account JSON with Viewer + Security Reviewer — read-only, uploaded once.",
  scopeDescription:
    "Read-only. The service account you upload holds only roles/viewer and roles/iam.securityReviewer. We read IAM policies, Cloud Asset Inventory, logging and resource configuration — we have no permission to change or delete any resource.",
  method: "json_upload",
  accent: false,
};

interface GcpServiceAccountKey {
  type?: string;
  project_id?: string;
  private_key_id?: string;
  private_key?: string;
  client_email?: string;
  token_uri?: string;
}

/** Parse + validate an uploaded service-account JSON key. */
export function parseServiceAccountKey(jsonText: string): GcpServiceAccountKey {
  let parsed: GcpServiceAccountKey;
  try {
    parsed = JSON.parse(jsonText) as GcpServiceAccountKey;
  } catch {
    throw new Error("GCP_INVALID_JSON");
  }
  if (parsed.type !== "service_account") throw new Error("GCP_NOT_SERVICE_ACCOUNT");
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error("GCP_MISSING_FIELDS");
  }
  if (!parsed.private_key.includes("BEGIN PRIVATE KEY")) throw new Error("GCP_BAD_PRIVATE_KEY");
  return parsed;
}

/**
 * Connect GCP from an uploaded service-account JSON key. The full JSON is
 * envelope-encrypted in the vault; only non-secret identifiers live in config.
 */
export async function connectGcpServiceAccount(
  ctx: OrgContext,
  jsonText: string,
): Promise<ConnectResult> {
  let key: GcpServiceAccountKey;
  try {
    key = parseServiceAccountKey(jsonText);
  } catch (err) {
    const code = String((err as Error).message || "GCP_INVALID_JSON");
    return {
      ok: false,
      status: "failing",
      message: "That service-account key couldn't be read.",
      failureCode: code,
      failureHint:
        code === "GCP_NOT_SERVICE_ACCOUNT"
          ? "Upload the JSON key for a service account (type must be \"service_account\"), not an OAuth client secret."
          : "Download a fresh JSON key from IAM & Admin → Service Accounts → Keys and upload the whole file unedited.",
    };
  }

  const conn = await upsertConnection({
    organizationId: ctx.orgId,
    provider: "gcp",
    status: "healthy",
    scopeDescription: GCP_DESCRIPTOR.scopeDescription,
    displayName: GCP_DESCRIPTOR.label,
    accountLogin: key.client_email ?? null,
    config: {
      project_id: key.project_id,
      client_email: key.client_email,
      private_key_id: key.private_key_id,
    },
    failureCode: null,
    failureHint: null,
    connectedAt: new Date(),
    lastSyncAt: new Date(),
    createdBy: ctx.user.id,
  });

  await storeCredential(buildDb(), {
    connectionId: conn.id,
    organizationId: ctx.orgId,
    provider: "gcp",
    plaintext: jsonText,
  });

  await logConnectionEvent({
    organizationId: ctx.orgId,
    provider: "gcp",
    connectionId: conn.id,
    eventType: "connected",
    actorUserId: ctx.user.id,
    detail: { project_id: key.project_id, client_email: key.client_email },
  });

  return { ok: true, status: "healthy", message: `GCP project ${key.project_id} connected (read-only).` };
}

/**
 * Verify the stored key is still present and well-formed. Live role verification
 * (Cloud Resource Manager testIamPermissions) happens in the collector runtime.
 */
export async function verifyGcp(ctx: OrgContext, conn: Soc2Connection): Promise<ConnectResult> {
  const secret = await loadCredential(buildDb(), conn.id);
  if (!secret) {
    return failGcp(ctx, conn, "GCP_NO_KEY", "Re-upload the service-account JSON key to reconnect.");
  }
  try {
    parseServiceAccountKey(secret);
  } catch {
    return failGcp(ctx, conn, "GCP_KEY_CORRUPT", "The stored key failed validation — upload a fresh JSON key.");
  }

  await upsertConnection({
    organizationId: ctx.orgId,
    provider: "gcp",
    status: "healthy",
    scopeDescription: GCP_DESCRIPTOR.scopeDescription,
    failureCode: null,
    failureHint: null,
    lastSyncAt: new Date(),
  });
  await logConnectionEvent({
    organizationId: ctx.orgId,
    provider: "gcp",
    connectionId: conn.id,
    eventType: "health_check_ok",
    actorUserId: ctx.user.id,
  });
  return { ok: true, status: "healthy", message: "Service account key valid. Last sync updated." };
}

/** Disconnect GCP and purge the stored key (zero-retention). */
export async function disconnectGcp(ctx: OrgContext, conn: Soc2Connection): Promise<void> {
  await purgeCredential(buildDb(), conn.id);
  await logConnectionEvent({
    organizationId: ctx.orgId,
    provider: "gcp",
    connectionId: conn.id,
    eventType: "disconnected",
    actorUserId: ctx.user.id,
  });
}

async function failGcp(
  ctx: OrgContext,
  conn: Soc2Connection,
  code: string,
  hint: string,
): Promise<ConnectResult> {
  await upsertConnection({
    organizationId: ctx.orgId,
    provider: "gcp",
    status: "failing",
    scopeDescription: GCP_DESCRIPTOR.scopeDescription,
    failureCode: code,
    failureHint: hint,
  });
  await logConnectionEvent({
    organizationId: ctx.orgId,
    provider: "gcp",
    connectionId: conn.id,
    eventType: "health_check_failed",
    actorUserId: ctx.user.id,
    detail: { failure_code: code },
  });
  return { ok: false, status: "failing", message: "GCP check failed.", failureCode: code, failureHint: hint };
}
