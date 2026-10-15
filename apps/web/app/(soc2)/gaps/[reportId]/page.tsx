/**
 * /gaps/[reportId] — a single dated gap report (F1-006).
 *
 * The permanent, shareable view of one weekly snapshot: its three headline
 * numerals, how they moved against the previous report, and the full list of
 * findings grouped into newly flagged / newly resolved / still open.
 *
 * Language throughout is "gap" / "needs review" — never "compliant".
 */
import type { JSX } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { resolveOrgContext } from "@/lib/soc2/access";
import { buildDb } from "@/lib/db";
import { getReport, getPreviousReport, type GapReport } from "@/lib/soc2/gaps/analyze";
import { loadFindings, type GapFinding } from "@/lib/soc2/gaps/diff";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function Delta({ current, previous }: { current: number; previous: number | null }): JSX.Element {
  if (previous === null) {
    return (
      <span className="muted" style={{ fontSize: 12 }}>
        no prior report
      </span>
    );
  }
  const diff = current - previous;
  if (diff === 0) {
    return (
      <span className="muted" style={{ fontSize: 12 }}>
        no change
      </span>
    );
  }
  const up = diff > 0;
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: up ? "#e03131" : "#2f9e44" }}>
      {up ? "▲" : "▼"} {Math.abs(diff)}
    </span>
  );
}

function Numeral({
  value,
  label,
  color,
  delta,
}: {
  value: number;
  label: string;
  color: string;
  delta: JSX.Element;
}): JSX.Element {
  return (
    <div style={{ minWidth: 120 }}>
      <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1, color }}>{value}</div>
      <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
        {label}
      </div>
      <div style={{ marginTop: 2 }}>{delta}</div>
    </div>
  );
}

function statusWord(status: string): string {
  if (status === "needs_human_review") return "needs review";
  if (status === "evidence_found") return "evidence found";
  if (status === "not_collected") return "not collected";
  return status.replace(/_/g, " ");
}

function FindingList({ title, findings, tint }: { title: string; findings: GapFinding[]; tint: string }): JSX.Element {
  return (
    <section style={{ marginTop: 20 }}>
      <h2 style={{ borderLeft: `4px solid ${tint}`, paddingLeft: 10 }}>
        {title} <span className="muted" style={{ fontWeight: 400 }}>({findings.length})</span>
      </h2>
      {findings.length === 0 ? (
        <p className="muted">None.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {findings.map((f) => (
            <li key={`${f.changeType}-${f.controlCode}`} className="card" style={{ marginTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <Link href={`/controls/${encodeURIComponent(f.controlCode)}`} style={{ fontWeight: 700 }}>
                    {f.controlCode}
                  </Link>{" "}
                  {f.controlTitle ?? ""}
                </div>
                <span className="muted" style={{ fontSize: 12 }}>
                  {f.previousStatus ? `${statusWord(f.previousStatus)} → ` : ""}
                  {statusWord(f.currentStatus)}
                </span>
              </div>
              {f.rationale ? (
                <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
                  {f.rationale}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function GapReportPage({
  params,
}: {
  params: { reportId: string };
}): Promise<JSX.Element> {
  const ctx = await resolveOrgContext();
  if (!ctx) redirect("/login");

  const db = buildDb();
  const report: GapReport | null = await getReport(db, ctx.orgId, params.reportId);
  if (!report) notFound();

  const [previous, findings] = await Promise.all([
    getPreviousReport(db, ctx.orgId, report.id),
    loadFindings(db, ctx.orgId, report.id),
  ]);

  const added = findings.filter((f) => f.changeType === "new");
  const resolved = findings.filter((f) => f.changeType === "resolved");
  const persisting = findings.filter((f) => f.changeType === "persisting");

  return (
    <main>
      <p>
        <Link href="/gaps">← Back to gap report</Link>
      </p>
      <h1>Gap report · {formatDate(report.generatedAt)}</h1>
      <p>
        A snapshot of your SOC 2 posture from this weekly scan. We flag gaps and what
        needs review — we never certify anything as &quot;compliant&quot;.
      </p>

      <div
        className="card"
        style={{ display: "flex", gap: 28, flexWrap: "wrap", justifyContent: "space-between" }}
      >
        <Numeral
          value={report.controlsWithEvidence}
          label="controls with evidence"
          color="#2f9e44"
          delta={<Delta current={report.controlsWithEvidence} previous={previous?.controlsWithEvidence ?? null} />}
        />
        <Numeral
          value={report.gaps}
          label="gaps"
          color="#e03131"
          delta={<Delta current={report.gaps} previous={previous?.gaps ?? null} />}
        />
        <Numeral
          value={report.needsReview}
          label="needs review"
          color="#f08c00"
          delta={<Delta current={report.needsReview} previous={previous?.needsReview ?? null} />}
        />
        <Numeral
          value={report.notCollected}
          label="not collected"
          color="#868e96"
          delta={<Delta current={report.notCollected} previous={previous?.notCollected ?? null} />}
        />
      </div>

      <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
        {report.totalControls} criteria evaluated · {report.artifactCount} evidence artifacts ·
        {previous ? ` compared against ${formatDate(previous.generatedAt)}` : " first report"}
      </p>

      <FindingList title="Newly flagged" findings={added} tint="#e03131" />
      <FindingList title="Newly resolved" findings={resolved} tint="#2f9e44" />
      <FindingList title="Still open" findings={persisting} tint="#f08c00" />
    </main>
  );
}
