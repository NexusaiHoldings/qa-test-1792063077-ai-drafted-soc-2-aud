/**
 * Weekly gap diff engine (F1-006, diff.ts).
 *
 * Given the freshly written snapshot and the one before it, this classifies each
 * control into one of three change types and persists the result to
 * soc2_gap_findings:
 *
 *   - new        — the control is a gap / needs-review NOW, but was not failing
 *                  in the previous report (a newly flagged control failure).
 *   - persisting — failing in both the previous and current report.
 *   - resolved   — was failing previously, but is now evidence_found / N-A /
 *                  not-collected.
 *
 * The previous report's failing set is read back from its own soc2_gap_findings
 * rows (current_status), so no per-control history table is required — each
 * report carries its own per-control state forward.
 *
 * The "What changed since last week" panel on /gaps reads the newest report's
 * findings where change_type is new or resolved.
 */

import { getControl } from "@/lib/soc2/tsc/seed";
import type { DisplayStatus } from "@/lib/soc2/mapper";
import { isProblemStatus, type ControlStatus, type GapDb } from "@/lib/soc2/gaps/analyze";

export type ChangeType = "new" | "resolved" | "persisting";

/** One persisted diff row. */
export interface GapFinding {
  readonly id: string;
  readonly reportId: string;
  readonly organizationId: string;
  readonly controlCode: string;
  readonly controlTitle: string | null;
  readonly changeType: ChangeType;
  readonly currentStatus: string;
  readonly previousStatus: string | null;
  readonly rationale: string;
}

/** Aggregate diff result returned by {@link diffReport}. */
export interface DiffResult {
  readonly newCount: number;
  readonly resolvedCount: number;
  readonly persistingCount: number;
  readonly findings: readonly GapFinding[];
}

interface PrevRow {
  control_code: string;
  current_status: string;
}

/**
 * Read the previous report's failing control set (code → its prior status).
 * Returns an empty map when there was no previous report (first ever scan).
 */
async function loadPreviousFailing(
  db: GapDb,
  organizationId: string,
  previousReportId: string | null,
): Promise<Map<string, DisplayStatus>> {
  const map = new Map<string, DisplayStatus>();
  if (!previousReportId) return map;
  const rows = await db.query<PrevRow>(
    `SELECT control_code, current_status
       FROM soc2_gap_findings
      WHERE report_id = $1::uuid
        AND organization_id = $2::uuid
        AND change_type IN ('new', 'persisting')`,
    previousReportId,
    organizationId,
  );
  for (const row of rows) {
    map.set(row.control_code, row.current_status as DisplayStatus);
  }
  return map;
}

function normalizeFinding(row: Record<string, unknown>): GapFinding {
  return {
    id: String(row.id),
    reportId: String(row.report_id),
    organizationId: String(row.organization_id),
    controlCode: String(row.control_code),
    controlTitle: (row.control_title as string | null) ?? null,
    changeType: row.change_type as ChangeType,
    currentStatus: String(row.current_status),
    previousStatus: (row.previous_status as string | null) ?? null,
    rationale: String(row.rationale ?? ""),
  };
}

/**
 * Diff the current per-control statuses against the previous report and persist
 * the findings for `reportId`. Writes one row for every control that is failing
 * now (new / persisting) and every control that was failing before but is now
 * clear (resolved). Returns the aggregate counts + the inserted rows.
 */
export async function diffReport(
  db: GapDb,
  organizationId: string,
  reportId: string,
  previousReportId: string | null,
  currentStatuses: Map<string, ControlStatus>,
): Promise<DiffResult> {
  const prevFailing = await loadPreviousFailing(db, organizationId, previousReportId);

  // Clear any partially-written findings for this report (idempotent re-run).
  await db.execute(
    `DELETE FROM soc2_gap_findings WHERE report_id = $1::uuid`,
    reportId,
  );

  const codes = new Set<string>([...currentStatuses.keys(), ...prevFailing.keys()]);
  const findings: GapFinding[] = [];

  for (const code of codes) {
    const current = currentStatuses.get(code);
    const currentStatus: DisplayStatus = current?.status ?? "not_collected";
    const wasFailing = prevFailing.has(code);
    const isFailing = isProblemStatus(currentStatus);
    const previousStatus = prevFailing.get(code) ?? null;

    let changeType: ChangeType | null = null;
    if (isFailing && !wasFailing) changeType = "new";
    else if (isFailing && wasFailing) changeType = "persisting";
    else if (!isFailing && wasFailing) changeType = "resolved";

    if (!changeType) continue; // clear in both reports — not a finding.

    const title = current?.title ?? getControl(code)?.title ?? null;
    const rationale =
      changeType === "resolved"
        ? `This control is no longer failing (now ${currentStatus.replace(/_/g, " ")}).`
        : current?.rationale ?? "Control is currently flagged.";

    const inserted = await db.query<Record<string, unknown>>(
      `INSERT INTO soc2_gap_findings
         (report_id, organization_id, control_code, control_title,
          change_type, current_status, previous_status, rationale)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      reportId,
      organizationId,
      code,
      title,
      changeType,
      currentStatus,
      previousStatus,
      rationale,
    );
    if (inserted[0]) findings.push(normalizeFinding(inserted[0]));
  }

  const newCount = findings.filter((f) => f.changeType === "new").length;
  const resolvedCount = findings.filter((f) => f.changeType === "resolved").length;
  const persistingCount = findings.filter((f) => f.changeType === "persisting").length;

  return { newCount, resolvedCount, persistingCount, findings };
}

/** Load the persisted findings for a report, newest change types first. */
export async function loadFindings(
  db: GapDb,
  organizationId: string,
  reportId: string,
): Promise<GapFinding[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM soc2_gap_findings
      WHERE report_id = $1::uuid AND organization_id = $2::uuid
      ORDER BY CASE change_type
                 WHEN 'new' THEN 0
                 WHEN 'resolved' THEN 1
                 ELSE 2
               END,
               control_code ASC`,
    reportId,
    organizationId,
  );
  return rows.map(normalizeFinding);
}

/**
 * The "What changed since last week" slice: only the controls that newly failed
 * or were newly resolved in this report (persisting ones are the steady state).
 */
export async function loadChangedFindings(
  db: GapDb,
  organizationId: string,
  reportId: string,
): Promise<{ added: GapFinding[]; resolved: GapFinding[] }> {
  const findings = await loadFindings(db, organizationId, reportId);
  return {
    added: findings.filter((f) => f.changeType === "new"),
    resolved: findings.filter((f) => f.changeType === "resolved"),
  };
}
