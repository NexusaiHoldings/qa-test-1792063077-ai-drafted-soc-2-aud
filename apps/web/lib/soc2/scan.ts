import { trackServerEvent } from "@nexus/analytics-and-telemetry";
import { buildDb } from "@/lib/db";
import {
  getConnection,
  type ConnectionStatus,
  type OrgContext,
  type Soc2PlanTier,
} from "@/lib/soc2/access";

export type ScanStep = "aws" | "github" | "running" | "ready";

export interface ScanSession {
  id: string;
  organization_id: string;
  created_by: string | null;
  consultant_quote_usd: number | null;
  auditor_chosen: boolean | null;
  commitment_due_at: string;
  created_at: string;
  updated_at: string;
}

export interface ConnectionSyncRun {
  id: string;
  organization_id: string;
  provider: "aws" | "github";
  status: "queued" | "running" | "succeeded" | "failed";
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScanProgress {
  step: ScanStep;
  awsStatus: ConnectionStatus;
  githubStatus: ConnectionStatus;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  percent: number;
  commitmentDueAt: string;
  reportReady: boolean;
  findingsCount: number;
  topFindingsCount: number;
  hiddenFindingsCount: number;
  consultantQuoteUsd: number | null;
  estimatedConsultantDeltaUsd: number | null;
  auditorChosen: boolean | null;
  planTier: Soc2PlanTier;
}

interface SessionRow {
  id: string;
  organization_id: string;
  created_by: string | null;
  consultant_quote_usd: string | number | null;
  auditor_chosen: boolean | null;
  commitment_due_at: string;
  created_at: string;
  updated_at: string;
}

interface CountRow {
  count: string | number;
}

function parseNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeSession(row: SessionRow): ScanSession {
  return {
    id: row.id,
    organization_id: row.organization_id,
    created_by: row.created_by,
    consultant_quote_usd: parseNumber(row.consultant_quote_usd),
    auditor_chosen: row.auditor_chosen,
    commitment_due_at: row.commitment_due_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getPlanTierForOrg(organizationId: string): Promise<Soc2PlanTier> {
  const db = buildDb();
  const rows = await db.query<{ plan_key: string | null; status: string | null }>(
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

export async function upsertScanSession(
  ctx: OrgContext,
  input: { consultantQuoteUsd?: number | null; auditorChosen?: boolean | null },
): Promise<ScanSession> {
  const db = buildDb();

  const now = new Date();
  const due = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const rows = await db.query<SessionRow>(
    `INSERT INTO soc2_scan_sessions
      (organization_id, created_by, consultant_quote_usd, auditor_chosen, commitment_due_at, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, now(), now())
     ON CONFLICT (organization_id) DO UPDATE SET
      consultant_quote_usd = COALESCE(EXCLUDED.consultant_quote_usd, soc2_scan_sessions.consultant_quote_usd),
      auditor_chosen = COALESCE(EXCLUDED.auditor_chosen, soc2_scan_sessions.auditor_chosen),
      updated_at = now()
     RETURNING *`,
    ctx.orgId,
    ctx.user.id,
    input.consultantQuoteUsd ?? null,
    input.auditorChosen ?? null,
    due.toISOString(),
  );

  await trackServerEvent({
    event: "scan_started",
    userId: ctx.user.id,
    organizationId: ctx.orgId,
    properties: {
      consultant_quote_usd: input.consultantQuoteUsd ?? null,
      auditor_chosen: input.auditorChosen ?? null,
    },
  });

  return normalizeSession(rows[0]);
}

export async function ensureConnectionRun(
  organizationId: string,
  provider: "aws" | "github",
): Promise<void> {
  const db = buildDb();
  const existing = await db.query<ConnectionSyncRun>(
    `SELECT * FROM soc2_connection_sync_runs
      WHERE organization_id = $1::uuid AND provider = $2
      ORDER BY created_at DESC
      LIMIT 1`,
    organizationId,
    provider,
  );
  const latest = existing[0];
  if (latest && (latest.status === "queued" || latest.status === "running" || latest.status === "succeeded")) {
    return;
  }

  await db.execute(
    `INSERT INTO soc2_connection_sync_runs
      (organization_id, provider, status, started_at, finished_at, created_at, updated_at)
     VALUES ($1::uuid, $2, 'queued', NULL, NULL, now(), now())`,
    organizationId,
    provider,
  );
}

async function getFindingsCount(organizationId: string): Promise<number> {
  const db = buildDb();
  const rows = await db.query<CountRow>(
    `SELECT COUNT(*)::bigint AS count
       FROM soc2_control_evidence
      WHERE organization_id = $1::uuid
        AND status IN ('gap', 'needs_human_review')`,
    organizationId,
  );
  return Number(rows[0]?.count ?? 0);
}

export async function getLatestSession(organizationId: string): Promise<ScanSession | null> {
  const db = buildDb();
  const rows = await db.query<SessionRow>(
    `SELECT *
       FROM soc2_scan_sessions
      WHERE organization_id = $1::uuid
      LIMIT 1`,
    organizationId,
  );
  return rows[0] ? normalizeSession(rows[0]) : null;
}

export async function getScanProgress(ctx: OrgContext): Promise<ScanProgress> {
  const [aws, github, session, planTier] = await Promise.all([
    getConnection(ctx.orgId, "aws"),
    getConnection(ctx.orgId, "github"),
    getLatestSession(ctx.orgId),
    getPlanTierForOrg(ctx.orgId),
  ]);

  if (aws?.status === "healthy") {
    await ensureConnectionRun(ctx.orgId, "aws");
  }
  if (github?.status === "healthy") {
    await ensureConnectionRun(ctx.orgId, "github");
  }

  const db = buildDb();
  const runs = await db.query<ConnectionSyncRun>(
    `SELECT *
       FROM soc2_connection_sync_runs
      WHERE organization_id = $1::uuid
      ORDER BY created_at DESC`,
    ctx.orgId,
  );

  const totalRuns = runs.length;
  const completedRuns = runs.filter((r) => r.status === "succeeded").length;
  const failedRuns = runs.filter((r) => r.status === "failed").length;

  const findingsCount = await getFindingsCount(ctx.orgId);
  const topFindingsCount = planTier === "free" ? Math.min(5, findingsCount) : findingsCount;
  const hiddenFindingsCount = Math.max(0, findingsCount - topFindingsCount);

  const reportReady = completedRuns >= 2 && totalRuns >= 2;
  let step: ScanStep = "aws";
  if ((aws?.status ?? "not_connected") === "healthy") step = "github";
  if ((aws?.status ?? "not_connected") === "healthy" && (github?.status ?? "not_connected") === "healthy") {
    step = "running";
  }
  if (reportReady) step = "ready";

  const percentBase = Math.round(
    ((aws?.status === "healthy" ? 1 : 0) + (github?.status === "healthy" ? 1 : 0)) * 35,
  );
  const runPercent = totalRuns > 0 ? Math.round((completedRuns / Math.max(totalRuns, 1)) * 30) : 0;
  const percent = reportReady ? 100 : Math.min(95, percentBase + runPercent);

  if (reportReady) {
    await trackServerEvent({
      event: "report_ready",
      userId: ctx.user.id,
      organizationId: ctx.orgId,
      properties: { findings_count: findingsCount, plan_tier: planTier },
    });
  }

  const quote = session?.consultant_quote_usd ?? null;
  const estimatedConsultantDeltaUsd = quote !== null ? Math.max(0, Math.round(quote - 2400)) : null;

  return {
    step,
    awsStatus: aws?.status ?? "not_connected",
    githubStatus: github?.status ?? "not_connected",
    totalRuns,
    completedRuns,
    failedRuns,
    percent,
    commitmentDueAt: session?.commitment_due_at ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    reportReady,
    findingsCount,
    topFindingsCount,
    hiddenFindingsCount,
    consultantQuoteUsd: quote,
    estimatedConsultantDeltaUsd,
    auditorChosen: session?.auditor_chosen ?? null,
    planTier,
  };
}
