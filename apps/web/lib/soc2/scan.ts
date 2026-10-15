import { buildDb } from "@/lib/db";
import { trackEvent } from "@nexus/analytics-and-telemetry";
import { getConnection, listConnections, resolveOrgContext, type Soc2Provider } from "@/lib/soc2/access";

export interface ScanSession {
  id: string;
  organization_id: string;
  created_by: string;
  consultant_quote_amount: number | null;
  consultant_quote_currency: string | null;
  auditor_selected: boolean | null;
  status: string;
  started_at: string;
  report_due_at: string;
  report_ready_at: string | null;
  findings_total: number | null;
  findings_visible: number | null;
  created_at: string;
  updated_at: string;
}

export interface ScanStatus {
  session: ScanSession;
  awsConnected: boolean;
  githubConnected: boolean;
  progressPercent: number;
  step: 1 | 2 | 3;
  findingsTotal: number;
  findingsVisible: number;
}

function normalizeSession(row: Record<string, unknown>): ScanSession {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    created_by: String(row.created_by),
    consultant_quote_amount:
      row.consultant_quote_amount === null || row.consultant_quote_amount === undefined
        ? null
        : Number(row.consultant_quote_amount),
    consultant_quote_currency: (row.consultant_quote_currency as string | null) ?? null,
    auditor_selected:
      row.auditor_selected === null || row.auditor_selected === undefined ? null : Boolean(row.auditor_selected),
    status: String(row.status ?? "in_progress"),
    started_at: String(row.started_at),
    report_due_at: String(row.report_due_at),
    report_ready_at: (row.report_ready_at as string | null) ?? null,
    findings_total: row.findings_total === null || row.findings_total === undefined ? null : Number(row.findings_total),
    findings_visible:
      row.findings_visible === null || row.findings_visible === undefined ? null : Number(row.findings_visible),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function startOrGetActiveScanSession(input: {
  organizationId: string;
  userId: string;
  consultantQuoteAmount?: number | null;
  consultantQuoteCurrency?: string | null;
  auditorSelected?: boolean | null;
}): Promise<ScanSession> {
  const db = buildDb();
  const existing = await db.query<Record<string, unknown>>(
    `SELECT *
       FROM soc2_scan_sessions
      WHERE organization_id = $1::uuid
        AND status IN ('in_progress', 'report_ready')
      ORDER BY created_at DESC
      LIMIT 1`,
    input.organizationId,
  );

  if (existing[0]) {
    return normalizeSession(existing[0]);
  }

  const rows = await db.query<Record<string, unknown>>(
    `INSERT INTO soc2_scan_sessions
      (organization_id, created_by, consultant_quote_amount, consultant_quote_currency, auditor_selected,
       status, started_at, report_due_at, findings_visible)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'in_progress', now(), now() + interval '24 hours', 5)
     RETURNING *`,
    input.organizationId,
    input.userId,
    input.consultantQuoteAmount ?? null,
    input.consultantQuoteCurrency ?? null,
    input.auditorSelected ?? null,
  );
  return normalizeSession(rows[0]);
}

export async function updateScanSessionResearch(input: {
  sessionId: string;
  consultantQuoteAmount?: number | null;
  consultantQuoteCurrency?: string | null;
  auditorSelected?: boolean | null;
}): Promise<void> {
  const db = buildDb();
  await db.execute(
    `UPDATE soc2_scan_sessions
        SET consultant_quote_amount = COALESCE($2, consultant_quote_amount),
            consultant_quote_currency = COALESCE($3, consultant_quote_currency),
            auditor_selected = COALESCE($4, auditor_selected),
            updated_at = now()
      WHERE id = $1::uuid`,
    input.sessionId,
    input.consultantQuoteAmount ?? null,
    input.consultantQuoteCurrency ?? null,
    input.auditorSelected ?? null,
  );
}

export async function markReportReady(input: {
  organizationId: string;
  findingsTotal: number;
  findingsVisible: number;
}): Promise<void> {
  const db = buildDb();
  await db.execute(
    `UPDATE soc2_scan_sessions
        SET status = 'report_ready',
            report_ready_at = now(),
            findings_total = $2,
            findings_visible = $3,
            updated_at = now()
      WHERE organization_id = $1::uuid
        AND status = 'in_progress'`,
    input.organizationId,
    input.findingsTotal,
    input.findingsVisible,
  );
}

export async function getLatestScanStatus(organizationId: string): Promise<ScanStatus | null> {
  const db = buildDb();
  const rows = await db.query<Record<string, unknown>>(
    `SELECT *
       FROM soc2_scan_sessions
      WHERE organization_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1`,
    organizationId,
  );
  const row = rows[0];
  if (!row) return null;
  const session = normalizeSession(row);
  const map = await listConnections(organizationId);
  const awsConnected = map.get("aws")?.status === "healthy";
  const githubConnected = map.get("github")?.status === "healthy";

  let progressPercent = 15;
  if (awsConnected) progressPercent = 45;
  if (awsConnected && githubConnected) progressPercent = 80;
  if (session.status === "report_ready") progressPercent = 100;

  const step: 1 | 2 | 3 = !awsConnected ? 1 : !githubConnected ? 2 : 3;
  return {
    session,
    awsConnected,
    githubConnected,
    progressPercent,
    step,
    findingsTotal: session.findings_total ?? 0,
    findingsVisible: session.findings_visible ?? 5,
  };
}

export async function emitScanEvent(event: "scan_started" | "aws_connected" | "github_connected" | "report_ready" | "upgraded", properties: Record<string, unknown>): Promise<void> {
  try {
    await trackEvent({ event, properties });
  } catch (err) {
    console.error(JSON.stringify({ level: "error", scope: "soc2.scan", msg: "track_event_failed", event, error: String(err) }));
  }
}

export async function maybeEmitConnectionEvent(provider: Soc2Provider): Promise<void> {
  const ctx = await resolveOrgContext();
  if (!ctx) return;
  const conn = await getConnection(ctx.orgId, provider);
  if (conn?.status === "healthy") {
    await emitScanEvent(provider === "aws" ? "aws_connected" : "github_connected", {
      organization_id: ctx.orgId,
      provider,
    });
  }
}
