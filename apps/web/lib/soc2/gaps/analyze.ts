/**
 * Weekly gap analysis — snapshot & report store (F1-006, analyze.ts).
 *
 * The weekly re-scan re-runs the evidence mapper, then this module rolls the
 * current control evidence up into a dated snapshot (soc2_gap_reports) with the
 * three headline numerals the /gaps hero screen renders: controls with evidence,
 * gaps, and needs-review. It also serves the sparkline (gap count over weeks)
 * and the report history for /gaps/[reportId].
 *
 * The language is deliberately "gap" / "needs review" — never "compliant". The
 * agent flags, it does not certify (liability_assessor).
 */

import {
  displayStatusFor,
  loadControlEvidence,
  countArtifacts,
  type ControlEvidenceRow,
  type DisplayStatus,
} from "@/lib/soc2/mapper";
import { TSC_CONTROLS } from "@/lib/soc2/tsc/seed";

/** Structural Db type so this module never imports the pg adapter directly. */
export interface GapDb {
  query<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;
  execute(sql: string, ...params: unknown[]): Promise<void>;
}

/** The headline counts rendered as large numerals on the hero screen. */
export interface GapSnapshotCounts {
  readonly totalControls: number;
  readonly controlsWithEvidence: number;
  readonly gaps: number;
  readonly needsReview: number;
  readonly notCollected: number;
  readonly artifactCount: number;
}

/** A control resolved to a single display status + its best rationale. */
export interface ControlStatus {
  readonly controlCode: string;
  readonly title: string;
  readonly status: DisplayStatus;
  readonly rationale: string;
}

/** A persisted soc2_gap_reports row. */
export interface GapReport {
  readonly id: string;
  readonly organizationId: string;
  readonly generatedAt: string;
  readonly totalControls: number;
  readonly controlsWithEvidence: number;
  readonly gaps: number;
  readonly needsReview: number;
  readonly notCollected: number;
  readonly artifactCount: number;
  readonly trigger: string;
}

/** A control display status counts as a "problem" (a finding) when failing. */
export function isProblemStatus(status: DisplayStatus): boolean {
  return status === "gap" || status === "needs_human_review";
}

/** Pick the highest-signal rationale from a control's evidence rows. */
function bestRationale(rows: readonly ControlEvidenceRow[] | undefined, status: DisplayStatus): string {
  if (!rows || rows.length === 0) {
    return "No evidence has been collected for this control yet.";
  }
  // Prefer a row whose status matches the rolled-up display status.
  const match = rows.find((r) => r.status === status) ?? rows[0];
  return match.rationale || "See the control detail for the mapped evidence.";
}

/**
 * Resolve every criterion to one display status for the current org state. This
 * is the per-control view the diff engine and remediation upsert both consume.
 */
export async function loadControlStatuses(
  db: GapDb,
  organizationId: string,
): Promise<Map<string, ControlStatus>> {
  const evidence = await loadControlEvidence(db, organizationId);
  const map = new Map<string, ControlStatus>();
  for (const control of TSC_CONTROLS) {
    const rows = evidence.get(control.code);
    const status = displayStatusFor(rows);
    map.set(control.code, {
      controlCode: control.code,
      title: control.title,
      status,
      rationale: bestRationale(rows, status),
    });
  }
  return map;
}

/** Roll the per-control statuses up into the headline snapshot counts. */
export function countFromStatuses(
  statuses: Map<string, ControlStatus>,
  artifactCount: number,
): GapSnapshotCounts {
  let controlsWithEvidence = 0;
  let gaps = 0;
  let needsReview = 0;
  let notCollected = 0;
  for (const s of statuses.values()) {
    switch (s.status) {
      case "evidence_found":
        controlsWithEvidence += 1;
        break;
      case "gap":
        gaps += 1;
        break;
      case "needs_human_review":
        needsReview += 1;
        break;
      case "not_collected":
        notCollected += 1;
        break;
      default:
        // not_applicable_claimed — neither evidence nor gap.
        break;
    }
  }
  return {
    totalControls: TSC_CONTROLS.length,
    controlsWithEvidence,
    gaps,
    needsReview,
    notCollected,
    artifactCount,
  };
}

/** Convenience: compute the counts straight from the DB for a given org. */
export async function computeSnapshotCounts(
  db: GapDb,
  organizationId: string,
): Promise<GapSnapshotCounts> {
  const [statuses, artifactCount] = await Promise.all([
    loadControlStatuses(db, organizationId),
    countArtifacts(db, organizationId),
  ]);
  return countFromStatuses(statuses, artifactCount);
}

function normalizeReport(row: Record<string, unknown>): GapReport {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    generatedAt: String(row.generated_at ?? ""),
    totalControls: Number(row.total_controls ?? 0),
    controlsWithEvidence: Number(row.controls_with_evidence ?? 0),
    gaps: Number(row.gaps ?? 0),
    needsReview: Number(row.needs_review ?? 0),
    notCollected: Number(row.not_collected ?? 0),
    artifactCount: Number(row.artifact_count ?? 0),
    trigger: String(row.trigger ?? "weekly_cron"),
  };
}

/** Insert a new dated snapshot row and return it. */
export async function createGapReport(
  db: GapDb,
  organizationId: string,
  counts: GapSnapshotCounts,
  trigger: string = "weekly_cron",
): Promise<GapReport> {
  const rows = await db.query<Record<string, unknown>>(
    `INSERT INTO soc2_gap_reports
       (organization_id, total_controls, controls_with_evidence, gaps,
        needs_review, not_collected, artifact_count, trigger, summary)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     RETURNING *`,
    organizationId,
    counts.totalControls,
    counts.controlsWithEvidence,
    counts.gaps,
    counts.needsReview,
    counts.notCollected,
    counts.artifactCount,
    trigger,
    JSON.stringify({
      controls_with_evidence: counts.controlsWithEvidence,
      gaps: counts.gaps,
      needs_review: counts.needsReview,
    }),
  );
  return normalizeReport(rows[0]);
}

/** The most recent report for an org, or null when none exist yet. */
export async function getLatestReport(
  db: GapDb,
  organizationId: string,
): Promise<GapReport | null> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM soc2_gap_reports
      WHERE organization_id = $1::uuid
      ORDER BY generated_at DESC
      LIMIT 1`,
    organizationId,
  );
  return rows[0] ? normalizeReport(rows[0]) : null;
}

/** The report immediately preceding the given report id (for diffing). */
export async function getPreviousReport(
  db: GapDb,
  organizationId: string,
  beforeReportId: string,
): Promise<GapReport | null> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT prev.* FROM soc2_gap_reports prev
      JOIN soc2_gap_reports cur ON cur.id = $2::uuid
     WHERE prev.organization_id = $1::uuid
       AND prev.id <> cur.id
       AND prev.generated_at <= cur.generated_at
     ORDER BY prev.generated_at DESC
     LIMIT 1`,
    organizationId,
    beforeReportId,
  );
  return rows[0] ? normalizeReport(rows[0]) : null;
}

/** A single report by id, scoped to the org. */
export async function getReport(
  db: GapDb,
  organizationId: string,
  reportId: string,
): Promise<GapReport | null> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM soc2_gap_reports
      WHERE id = $1::uuid AND organization_id = $2::uuid
      LIMIT 1`,
    reportId,
    organizationId,
  );
  return rows[0] ? normalizeReport(rows[0]) : null;
}

/** The N most recent reports, newest first (for the history list). */
export async function listReports(
  db: GapDb,
  organizationId: string,
  limit: number = 24,
): Promise<GapReport[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM soc2_gap_reports
      WHERE organization_id = $1::uuid
      ORDER BY generated_at DESC
      LIMIT $2`,
    organizationId,
    Math.max(1, Math.min(100, limit)),
  );
  return rows.map(normalizeReport);
}

/** One point on the gap-count sparkline. */
export interface SparklinePoint {
  readonly reportId: string;
  readonly generatedAt: string;
  readonly gaps: number;
  readonly needsReview: number;
}

/**
 * The gap-count sparkline, oldest → newest (so the line reads left to right).
 * Caps at `weeks` points; the hero screen renders the last ~12.
 */
export async function getSparkline(
  db: GapDb,
  organizationId: string,
  weeks: number = 12,
): Promise<SparklinePoint[]> {
  const reports = await listReports(db, organizationId, weeks);
  return reports
    .map((r) => ({
      reportId: r.id,
      generatedAt: r.generatedAt,
      gaps: r.gaps,
      needsReview: r.needsReview,
    }))
    .reverse();
}
