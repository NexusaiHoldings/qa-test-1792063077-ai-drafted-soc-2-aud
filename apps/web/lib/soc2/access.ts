/**
 * SOC 2 access layer (F1-002, apps/web/lib/soc2/access.ts).
 *
 * Tenant + session resolution and the data-access primitives for the connector
 * registry. Everything is organization-scoped: the session user is resolved via
 * @nexus/identity-and-access, their org via @nexus/organizations-and-teams, and
 * every connection row is keyed by organization_id. Connection lifecycle events
 * are written both to the domain's soc2_connection_events table and to the
 * @nexus/admin-console audit log (admin_audit_log).
 */

import { handleCreateOrg } from "@nexus/organizations-and-teams";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser, type SessionUser } from "@/lib/admin-auth";

export type Soc2Provider = "aws" | "gcp" | "github" | "hris";

export type ConnectionStatus = "not_connected" | "connecting" | "healthy" | "failing";

export const SOC2_PROVIDERS: readonly Soc2Provider[] = ["aws", "gcp", "github", "hris"];

export interface OrgContext {
  readonly user: SessionUser;
  readonly orgId: string;
  readonly orgName: string;
}

/** How a provider is connected — drives the detail-page UI. */
export type ConnectMethod = "cloudformation" | "github_app" | "json_upload" | "api_key";

/** Static, UI-facing metadata for a provider card. */
export interface ProviderDescriptor {
  readonly provider: Soc2Provider;
  readonly label: string;
  readonly blurb: string;
  readonly scopeDescription: string;
  readonly method: ConnectMethod;
  /** Only AWS carries the brand accent on its primary button (empty-state spec). */
  readonly accent: boolean;
}

/** Result of a connect / verify action, rendered back to the user. */
export interface ConnectResult {
  readonly ok: boolean;
  readonly status: ConnectionStatus;
  readonly message: string;
  readonly failureCode?: string;
  readonly failureHint?: string;
  /** External URL the user must visit to finish (CloudFormation / GitHub App). */
  readonly redirectUrl?: string;
}

export interface Soc2Connection {
  id: string;
  organization_id: string;
  provider: Soc2Provider;
  status: ConnectionStatus;
  display_name: string | null;
  external_id: string | null;
  installation_id: string | null;
  account_login: string | null;
  scope_description: string | null;
  config: Record<string, unknown>;
  failure_code: string | null;
  failure_hint: string | null;
  last_sync_at: string | null;
  connected_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type Soc2PlanTier = "free" | "paid";

interface OrgRow {
  id: string;
  name: string;
}

interface BillingPlanRow {
  plan_key: string | null;
  status: string | null;
}

/**
 * Resolve the signed-in user and their organization, creating a default org on
 * first visit (mirrors the substrate's /org page behaviour). Returns null when
 * there is no valid session so pages can redirect to /login.
 */
export async function resolveOrgContext(): Promise<OrgContext | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const db = buildDb();
  let orgs = await db.query<OrgRow>(
    `SELECT o.id, o.name
       FROM organizations o
       JOIN org_members m ON m.org_id = o.id
      WHERE m.user_id = $1::uuid
      ORDER BY o.created_at ASC
      LIMIT 1`,
    user.id,
  );

  if (orgs.length === 0) {
    const companyName = process.env.COMPANY_NAME || "My";
    try {
      await handleCreateOrg(
        { db: buildDb(), events: buildEventBus() },
        { name: `${companyName} Team`, owner_user_id: user.id },
      );
    } catch (err) {
      console.error(
        JSON.stringify({ level: "error", scope: "soc2.access", msg: "create_org_failed", error: String(err) }),
      );
    }
    orgs = await db.query<OrgRow>(
      `SELECT o.id, o.name
         FROM organizations o
         JOIN org_members m ON m.org_id = o.id
        WHERE m.user_id = $1::uuid
        ORDER BY o.created_at ASC
        LIMIT 1`,
      user.id,
    );
  }

  const org = orgs[0];
  if (!org) return null;
  return { user, orgId: org.id, orgName: org.name };
}

function normalizeConnection(row: Record<string, unknown>): Soc2Connection {
  const rawConfig = row.config;
  let config: Record<string, unknown> = {};
  if (rawConfig && typeof rawConfig === "object") {
    config = rawConfig as Record<string, unknown>;
  } else if (typeof rawConfig === "string") {
    try {
      config = JSON.parse(rawConfig) as Record<string, unknown>;
    } catch {
      config = {};
    }
  }
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    provider: row.provider as Soc2Provider,
    status: (row.status as ConnectionStatus) ?? "not_connected",
    display_name: (row.display_name as string | null) ?? null,
    external_id: (row.external_id as string | null) ?? null,
    installation_id: (row.installation_id as string | null) ?? null,
    account_login: (row.account_login as string | null) ?? null,
    scope_description: (row.scope_description as string | null) ?? null,
    config,
    failure_code: (row.failure_code as string | null) ?? null,
    failure_hint: (row.failure_hint as string | null) ?? null,
    last_sync_at: (row.last_sync_at as string | null) ?? null,
    connected_at: (row.connected_at as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

/** All connection rows for an org, keyed by provider for easy card rendering. */
export async function listConnections(
  organizationId: string,
): Promise<Map<Soc2Provider, Soc2Connection>> {
  const db = buildDb();
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM soc2_connections WHERE organization_id = $1::uuid`,
    organizationId,
  );
  const map = new Map<Soc2Provider, Soc2Connection>();
  for (const row of rows) {
    const conn = normalizeConnection(row);
    map.set(conn.provider, conn);
  }
  return map;
}

/** A single connection for an org + provider, or null if never created. */
export async function getConnection(
  organizationId: string,
  provider: Soc2Provider,
): Promise<Soc2Connection | null> {
  const db = buildDb();
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM soc2_connections
      WHERE organization_id = $1::uuid AND provider = $2
      LIMIT 1`,
    organizationId,
    provider,
  );
  return rows[0] ? normalizeConnection(rows[0]) : null;
}

export interface UpsertConnectionInput {
  organizationId: string;
  provider: Soc2Provider;
  status: ConnectionStatus;
  scopeDescription: string;
  displayName?: string | null;
  externalId?: string | null;
  installationId?: string | null;
  accountLogin?: string | null;
  config?: Record<string, unknown>;
  failureCode?: string | null;
  failureHint?: string | null;
  lastSyncAt?: Date | null;
  connectedAt?: Date | null;
  createdBy?: string | null;
}

/**
 * Create or update the single connection row for (org, provider). The UNIQUE
 * (organization_id, provider) constraint makes this an idempotent upsert.
 */
export async function upsertConnection(
  input: UpsertConnectionInput,
): Promise<Soc2Connection> {
  const db = buildDb();
  const rows = await db.query<Record<string, unknown>>(
    `INSERT INTO soc2_connections
       (organization_id, provider, status, display_name, external_id,
        installation_id, account_login, scope_description, config,
        failure_code, failure_hint, last_sync_at, connected_at, created_by, updated_at)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::jsonb,
             $10, $11, $12, $13, $14, now())
     ON CONFLICT (organization_id, provider) DO UPDATE SET
       status = EXCLUDED.status,
       display_name = COALESCE(EXCLUDED.display_name, soc2_connections.display_name),
       external_id = COALESCE(EXCLUDED.external_id, soc2_connections.external_id),
       installation_id = COALESCE(EXCLUDED.installation_id, soc2_connections.installation_id),
       account_login = COALESCE(EXCLUDED.account_login, soc2_connections.account_login),
       scope_description = EXCLUDED.scope_description,
       config = soc2_connections.config || EXCLUDED.config,
       failure_code = EXCLUDED.failure_code,
       failure_hint = EXCLUDED.failure_hint,
       last_sync_at = COALESCE(EXCLUDED.last_sync_at, soc2_connections.last_sync_at),
       connected_at = COALESCE(EXCLUDED.connected_at, soc2_connections.connected_at),
       updated_at = now()
     RETURNING *`,
    input.organizationId,
    input.provider,
    input.status,
    input.displayName ?? null,
    input.externalId ?? null,
    input.installationId ?? null,
    input.accountLogin ?? null,
    input.scopeDescription,
    JSON.stringify(input.config ?? {}),
    input.failureCode ?? null,
    input.failureHint ?? null,
    input.lastSyncAt ? input.lastSyncAt.toISOString() : null,
    input.connectedAt ? input.connectedAt.toISOString() : null,
    input.createdBy ?? null,
  );
  return normalizeConnection(rows[0]);
}

/** Mark a connection disconnected and reset its live state. */
export async function clearConnection(
  organizationId: string,
  provider: Soc2Provider,
): Promise<void> {
  const db = buildDb();
  await db.execute(
    `UPDATE soc2_connections
        SET status = 'not_connected',
            installation_id = NULL,
            external_id = NULL,
            account_login = NULL,
            failure_code = NULL,
            failure_hint = NULL,
            last_sync_at = NULL,
            connected_at = NULL,
            config = '{}'::jsonb,
            updated_at = now()
      WHERE organization_id = $1::uuid AND provider = $2`,
    organizationId,
    provider,
  );
}

export interface ConnectionEventInput {
  organizationId: string;
  provider: Soc2Provider;
  connectionId?: string | null;
  eventType: string;
  actorUserId?: string | null;
  detail?: Record<string, unknown>;
}

/**
 * Record a connection lifecycle event in the domain log AND the admin-console
 * audit log. Best-effort: logging a connection event must never break the
 * action that triggered it, so failures are logged and swallowed.
 */
export async function logConnectionEvent(input: ConnectionEventInput): Promise<void> {
  const db = buildDb();
  const detail = input.detail ?? {};
  try {
    await db.execute(
      `INSERT INTO soc2_connection_events
         (connection_id, organization_id, provider, event_type, actor_user_id, detail)
       VALUES ($1, $2::uuid, $3, $4, $5, $6::jsonb)`,
      input.connectionId ?? null,
      input.organizationId,
      input.provider,
      input.eventType,
      input.actorUserId ?? null,
      JSON.stringify(detail),
    );
  } catch (err) {
    console.error(
      JSON.stringify({ level: "error", scope: "soc2.access", msg: "connection_event_log_failed", error: String(err) }),
    );
  }

  // Mirror to the admin-console audit log so the event shows in /admin/audit-log.
  try {
    await db.execute(
      `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, payload)
       VALUES ($1::uuid, $2, $3, $4, $5::jsonb)`,
      input.actorUserId ?? "00000000-0000-0000-0000-000000000000",
      `soc2.connection.${input.eventType}`,
      "soc2_connection",
      input.connectionId ?? `${input.organizationId}:${input.provider}`,
      JSON.stringify({ provider: input.provider, organization_id: input.organizationId, ...detail }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({ level: "error", scope: "soc2.access", msg: "admin_audit_log_failed", error: String(err) }),
    );
  }
}

/** Human-friendly "x minutes ago" for last-sync display. */
export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "never";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "unknown";
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export async function getSoc2PlanTier(organizationId: string): Promise<Soc2PlanTier> {
  const db = buildDb();
  const rows = await db.query<BillingPlanRow>(
    `SELECT plan_key, status
       FROM billing_subscriptions
      WHERE organization_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1`,
    organizationId,
  );
  const row = rows[0];
  if (!row) return "free";
  const plan = (row.plan_key ?? "").toLowerCase();
  const status = (row.status ?? "").toLowerCase();
  if (!status || status === "canceled" || status === "incomplete_expired") return "free";
  if (plan.includes("free") || plan.includes("trial")) return "free";
  return "paid";
}
