/**
 * GET /api/cron/weekly-gap-rescan — the weekly automated gap analysis
 * (F1-006, ceo_briefing key_feature 3).
 *
 * For every org that has ingested evidence, this:
 *   1. re-runs the deterministic-first evidence mapper over the current
 *      artifacts (the "re-scan connected systems" step);
 *   2. writes a DATED snapshot into soc2_gap_reports;
 *   3. diffs the snapshot against the previous report into soc2_gap_findings
 *      (new / resolved / persisting);
 *   4. upserts the soc2_remediation_items priority queue with severity, a
 *      suggested owner, and a plain-English fix, notifying freshly-assigned
 *      owners via @nexus/notifications.
 *
 * Schedule: weekly (a Vercel cron entry; the integration worker registers it).
 * Auth: when CRON_SECRET is set, Vercel sends `Authorization: Bearer
 * <CRON_SECRET>` and we validate it; unset (local/dev) runs unguarded.
 *
 * It is also safe to invoke manually (e.g. right after the first collection so
 * the free scan has something to show): the whole pipeline is idempotent.
 */

import { NextResponse } from "next/server";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { runMapper, countArtifacts } from "@/lib/soc2/mapper";
import {
  countFromStatuses,
  createGapReport,
  getLatestReport,
  getPreviousReport,
  loadControlStatuses,
} from "@/lib/soc2/gaps/analyze";
import { diffReport } from "@/lib/soc2/gaps/diff";
import { upsertRemediationItems } from "@/lib/soc2/gaps/remediation";
import type { HandlerContext } from "@nexus/notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // pg + raw SQL — not edge-compatible
export const maxDuration = 300; // Vercel Pro — the mapper may call the gateway

function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // unguarded in dev; prod sets CRON_SECRET
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

interface OrgRow {
  organization_id: string;
}

interface OrgOutcome {
  organization_id: string;
  report_id?: string;
  new?: number;
  resolved?: number;
  persisting?: number;
  remediation_upserted?: number;
  auto_resolved?: number;
  notified?: number;
  error?: string;
}

/** Run the full snapshot → diff → remediation pipeline for one org. */
async function rescanOrg(
  db: ReturnType<typeof buildDb>,
  ctx: HandlerContext,
  organizationId: string,
): Promise<OrgOutcome> {
  // 1. Re-scan: re-map the current artifacts into fresh control evidence.
  await runMapper(db, organizationId);

  // 2. Snapshot: roll the current evidence up into a dated report row.
  const statuses = await loadControlStatuses(db, organizationId);
  const artifactCount = await countArtifacts(db, organizationId);
  const counts = countFromStatuses(statuses, artifactCount);

  // The previous report is the newest one that already exists (before we insert).
  const previous = await getLatestReport(db, organizationId);
  const report = await createGapReport(db, organizationId, counts, "weekly_cron");

  // 3. Diff against the previous report.
  const previousForDiff = previous ?? (await getPreviousReport(db, organizationId, report.id));
  const diff = await diffReport(db, organizationId, report.id, previousForDiff?.id ?? null, statuses);

  // 4. Upsert the remediation queue + notify new owners.
  const remediation = await upsertRemediationItems(db, organizationId, report, statuses, ctx);

  return {
    organization_id: organizationId,
    report_id: report.id,
    new: diff.newCount,
    resolved: diff.resolvedCount,
    persisting: diff.persistingCount,
    remediation_upserted: remediation.upserted,
    auto_resolved: remediation.autoResolved,
    notified: remediation.notified,
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!cronAuthorized(request)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const db = buildDb();
  const ctx: HandlerContext = { db: buildDb(), events: buildEventBus() };

  let orgs: OrgRow[];
  try {
    orgs = await db.query<OrgRow>(
      `SELECT DISTINCT organization_id FROM soc2_evidence_artifacts
        UNION
       SELECT DISTINCT organization_id FROM soc2_connections WHERE status = 'healthy'`,
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        scope: "soc2.cron.weekly_gap_rescan",
        msg: "list_orgs_failed",
        error: String(err),
      }),
    );
    return NextResponse.json({ error: String((err as Error).message) }, { status: 500 });
  }

  const results: OrgOutcome[] = [];
  for (const org of orgs) {
    const organizationId = String(org.organization_id);
    try {
      results.push(await rescanOrg(db, ctx, organizationId));
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "error",
          scope: "soc2.cron.weekly_gap_rescan",
          msg: "org_rescan_failed",
          organization_id: organizationId,
          error: String(err),
        }),
      );
      results.push({ organization_id: organizationId, error: String((err as Error).message) });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
