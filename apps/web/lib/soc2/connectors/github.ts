/**
 * GitHub connector (F1-002, apps/web/lib/soc2/connectors/github.ts).
 *
 * GitHub connects via a GitHub App installation — never a PAT, never OAuth with
 * repo contents. The App requests read-only Administration, Metadata, Members
 * and Dependabot alerts permissions and NO Contents permission, so we read repo
 * settings, branch protection, required reviews, org 2FA enforcement,
 * collaborators and Dependabot alerts but can never read source code (directly
 * mitigating the "source code and IP exposure" liability vector).
 *
 * This module also owns the webhook plumbing (signature verification + event
 * parsing) used by apps/web/app/api/webhooks/github/route.ts.
 */

import { createHmac, timingSafeEqual } from "crypto";
import {
  getConnection,
  logConnectionEvent,
  upsertConnection,
  type ConnectResult,
  type OrgContext,
  type ProviderDescriptor,
  type Soc2Connection,
} from "@/lib/soc2/access";

export const GITHUB_DESCRIPTOR: ProviderDescriptor = {
  provider: "github",
  label: "GitHub",
  blurb: "GitHub App install — read-only settings & alerts, never your source code.",
  scopeDescription:
    "Read-only. The GitHub App requests Administration, Metadata, Members and Dependabot alerts (read). It has NO Contents permission, so we can see branch protection, required reviews, 2FA enforcement, collaborators and vulnerability alerts — but never your source code.",
  method: "github_app",
  accent: false,
};

/** Slug of the GitHub App to install (configured at provisioning). */
function appSlug(): string {
  return process.env.SOC2_GITHUB_APP_SLUG || "nexus-soc2";
}

/**
 * Build the GitHub App installation URL. `state` carries the org id so the
 * post-install setup redirect can bind the installation to the right tenant.
 */
export function buildInstallUrl(ctx: OrgContext): string {
  const state = encodeURIComponent(`org:${ctx.orgId}`);
  return `https://github.com/apps/${appSlug()}/installations/new?state=${state}`;
}

/**
 * Begin a GitHub connection: persist a "connecting" row and return the App
 * install URL. The webhook (installation event) flips the row to Healthy.
 */
export async function beginGithubConnection(ctx: OrgContext): Promise<ConnectResult> {
  const conn = await upsertConnection({
    organizationId: ctx.orgId,
    provider: "github",
    status: "connecting",
    scopeDescription: GITHUB_DESCRIPTOR.scopeDescription,
    displayName: GITHUB_DESCRIPTOR.label,
    config: { app_slug: appSlug() },
    failureCode: null,
    failureHint: null,
    createdBy: ctx.user.id,
  });
  await logConnectionEvent({
    organizationId: ctx.orgId,
    provider: "github",
    connectionId: conn.id,
    eventType: "connect_initiated",
    actorUserId: ctx.user.id,
    detail: { method: "github_app" },
  });
  return {
    ok: true,
    status: "connecting",
    message: "Install the Nexus GitHub App on your organization to finish. We'll mark this Healthy automatically.",
    redirectUrl: buildInstallUrl(ctx),
  };
}

/**
 * Bind an installation id to an org's connection (called from the setup redirect
 * or when a webhook carries a resolvable org). Marks the connection Healthy.
 */
export async function bindInstallation(
  organizationId: string,
  installationId: string,
  accountLogin: string | null,
  actorUserId: string | null,
): Promise<Soc2Connection> {
  const conn = await upsertConnection({
    organizationId,
    provider: "github",
    status: "healthy",
    scopeDescription: GITHUB_DESCRIPTOR.scopeDescription,
    displayName: GITHUB_DESCRIPTOR.label,
    installationId,
    accountLogin,
    config: { app_slug: appSlug(), installation_id: installationId },
    failureCode: null,
    failureHint: null,
    connectedAt: new Date(),
    lastSyncAt: new Date(),
  });
  await logConnectionEvent({
    organizationId,
    provider: "github",
    connectionId: conn.id,
    eventType: "connected",
    actorUserId,
    detail: { installation_id: installationId, account_login: accountLogin },
  });
  return conn;
}

/**
 * Verify the webhook signature header (sha256=<hmac>) against the raw body using
 * GITHUB_WEBHOOK_SECRET. Constant-time comparison; returns false on any mismatch
 * or when the secret / header is absent.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.SOC2_GITHUB_WEBHOOK_SECRET || process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface ParsedInstallationEvent {
  action: string;
  installationId: string | null;
  accountLogin: string | null;
  orgId: string | null;
}

/**
 * Extract the installation id, account login and (if present) the org id encoded
 * in the install `state`/`sender` from a GitHub `installation` webhook payload.
 */
export function parseInstallationEvent(payload: Record<string, unknown>): ParsedInstallationEvent {
  const installation = (payload.installation as Record<string, unknown>) || {};
  const account = (installation.account as Record<string, unknown>) || {};
  const installationId = installation.id != null ? String(installation.id) : null;
  const accountLogin = typeof account.login === "string" ? account.login : null;
  // GitHub does not echo install `state` on webhooks; org binding happens via the
  // setup redirect. We still surface a best-effort org id if the payload carries
  // one (some proxies inject it), else null → matched by account login later.
  const orgId = typeof payload.nexus_org_id === "string" ? payload.nexus_org_id : null;
  return {
    action: typeof payload.action === "string" ? payload.action : "unknown",
    installationId,
    accountLogin,
    orgId,
  };
}

/**
 * Verify the installation is live. The collector runtime exchanges the App's
 * JWT for an installation token (@octokit/app) to read settings; here we confirm
 * an installation is bound and emit a sync heartbeat.
 */
export async function verifyGithub(ctx: OrgContext, conn: Soc2Connection): Promise<ConnectResult> {
  if (!conn.installation_id) {
    return failGithub(
      ctx,
      conn,
      "GITHUB_NOT_INSTALLED",
      "Install the Nexus GitHub App on your org — the installation hasn't reached us yet.",
    );
  }
  await upsertConnection({
    organizationId: ctx.orgId,
    provider: "github",
    status: "healthy",
    scopeDescription: GITHUB_DESCRIPTOR.scopeDescription,
    failureCode: null,
    failureHint: null,
    lastSyncAt: new Date(),
  });
  await logConnectionEvent({
    organizationId: ctx.orgId,
    provider: "github",
    connectionId: conn.id,
    eventType: "health_check_ok",
    actorUserId: ctx.user.id,
  });
  return { ok: true, status: "healthy", message: "Installation active. Last sync updated." };
}

/** Handle a verified `installation` webhook: bind or clear based on action. */
export async function handleInstallationWebhook(
  evt: ParsedInstallationEvent,
): Promise<{ matched: boolean; action: string }> {
  if (!evt.installationId) return { matched: false, action: evt.action };

  // Resolve the target connection: by org id (if carried), else by a matching
  // "connecting" github row whose account login matches, else by installation id.
  let conn: Soc2Connection | null = null;
  if (evt.orgId) {
    conn = await getConnection(evt.orgId, "github");
  }
  if (!conn && evt.accountLogin) {
    conn = await findGithubByInstallationOrLogin(evt.installationId, evt.accountLogin);
  }
  if (!conn) {
    conn = await findGithubByInstallationOrLogin(evt.installationId, null);
  }
  if (!conn) return { matched: false, action: evt.action };

  if (evt.action === "deleted" || evt.action === "suspend") {
    await upsertConnection({
      organizationId: conn.organization_id,
      provider: "github",
      status: "failing",
      scopeDescription: GITHUB_DESCRIPTOR.scopeDescription,
      failureCode: "GITHUB_INSTALLATION_REMOVED",
      failureHint: "The GitHub App was uninstalled or suspended. Re-install it to resume read-only evidence collection.",
    });
    await logConnectionEvent({
      organizationId: conn.organization_id,
      provider: "github",
      connectionId: conn.id,
      eventType: "installation_removed",
      actorUserId: null,
      detail: { action: evt.action },
    });
    return { matched: true, action: evt.action };
  }

  await bindInstallation(conn.organization_id, evt.installationId, evt.accountLogin, null);
  return { matched: true, action: evt.action };
}

/** Look up a github connection by installation id, falling back to account login. */
async function findGithubByInstallationOrLogin(
  installationId: string,
  accountLogin: string | null,
): Promise<Soc2Connection | null> {
  const { buildDb } = await import("@/lib/db");
  const db = buildDb();
  let rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM soc2_connections
      WHERE provider = 'github' AND installation_id = $1
      LIMIT 1`,
    installationId,
  );
  if (rows.length === 0 && accountLogin) {
    rows = await db.query<Record<string, unknown>>(
      `SELECT * FROM soc2_connections
        WHERE provider = 'github' AND account_login = $1
        ORDER BY updated_at DESC
        LIMIT 1`,
      accountLogin,
    );
  }
  if (rows.length === 0 && !accountLogin) {
    // Last resort: the most recent github row still awaiting its installation.
    rows = await db.query<Record<string, unknown>>(
      `SELECT * FROM soc2_connections
        WHERE provider = 'github' AND status = 'connecting'
        ORDER BY updated_at DESC
        LIMIT 1`,
    );
  }
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: String(r.id),
    organization_id: String(r.organization_id),
    provider: "github",
    status: (r.status as Soc2Connection["status"]) ?? "connecting",
    display_name: (r.display_name as string | null) ?? null,
    external_id: (r.external_id as string | null) ?? null,
    installation_id: (r.installation_id as string | null) ?? null,
    account_login: (r.account_login as string | null) ?? null,
    scope_description: (r.scope_description as string | null) ?? null,
    config: (r.config as Record<string, unknown>) ?? {},
    failure_code: (r.failure_code as string | null) ?? null,
    failure_hint: (r.failure_hint as string | null) ?? null,
    last_sync_at: (r.last_sync_at as string | null) ?? null,
    connected_at: (r.connected_at as string | null) ?? null,
    created_by: (r.created_by as string | null) ?? null,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

async function failGithub(
  ctx: OrgContext,
  conn: Soc2Connection,
  code: string,
  hint: string,
): Promise<ConnectResult> {
  await upsertConnection({
    organizationId: ctx.orgId,
    provider: "github",
    status: "failing",
    scopeDescription: GITHUB_DESCRIPTOR.scopeDescription,
    failureCode: code,
    failureHint: hint,
  });
  await logConnectionEvent({
    organizationId: ctx.orgId,
    provider: "github",
    connectionId: conn.id,
    eventType: "health_check_failed",
    actorUserId: ctx.user.id,
    detail: { failure_code: code },
  });
  return { ok: false, status: "failing", message: "GitHub check failed.", failureCode: code, failureHint: hint };
}
