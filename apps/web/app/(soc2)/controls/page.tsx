/**
 * /controls — TSC Control Library & Evidence Mapper (F1-005).
 *
 * Renders the embedded AICPA Trust Services Criteria as a collapsible tree
 * grouped by category, with a coverage meter per category. Each control row is a
 * card (hover elevation) showing its status pill, the anchoring artifact chips,
 * and a "Why" disclosure with the deterministic rule id or model rationale.
 *
 * Before the first collection there is no evidence, so the page shows an
 * empty-state explainer of what will populate it. Server-rendered throughout:
 * the tree and the "Why" popovers use native <details>/<summary> so no client
 * bundle is needed.
 *
 * Hallucination guard surfaced in the UI: an evidence_found row always carries a
 * cited artifact chip — the mapper never asserts evidence without one.
 */
import type { JSX } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveOrgContext } from "@/lib/soc2/access";
import { buildDb } from "@/lib/db";
import { controlsByCategory, SOC2_POLICY_DOCUMENTS, TSC_CONTROLS } from "@/lib/soc2/tsc/seed";
import {
  coverageFor,
  countArtifacts,
  deterministicRuleCount,
  displayStatusFor,
  loadControlEvidence,
  type ControlEvidenceRow,
  type DisplayStatus,
} from "@/lib/soc2/mapper";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUS_META: Record<DisplayStatus, { label: string; bg: string; fg: string; dot: string }> = {
  evidence_found: { label: "Evidence found", bg: "#ebfbee", fg: "#2b8a3e", dot: "#2f9e44" },
  gap: { label: "Gap", bg: "#fff0f0", fg: "#c92a2a", dot: "#e03131" },
  needs_human_review: { label: "Needs human review", bg: "#fff4e6", fg: "#9c6400", dot: "#f08c00" },
  not_applicable_claimed: { label: "N/A claimed", bg: "#f3f0ff", fg: "#5f3dc4", dot: "#7048e8" },
  not_collected: { label: "Not collected", bg: "#f1f3f5", fg: "#495057", dot: "#adb5bd" },
};

function StatusPill({ status }: { status: DisplayStatus }): JSX.Element {
  const c = STATUS_META[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: c.bg,
        color: c.fg,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 999, background: c.dot }} />
      {c.label}
    </span>
  );
}

function CoverageMeter({ covered, total, percent }: { covered: number; total: number; percent: number }): JSX.Element {
  const fill = percent >= 80 ? "#2f9e44" : percent >= 40 ? "#f08c00" : "#e8590c";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 180 }}>
      <span
        aria-hidden="true"
        style={{
          position: "relative",
          width: 120,
          height: 8,
          borderRadius: 999,
          background: "#e9ecef",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            position: "absolute",
            inset: 0,
            width: `${percent}%`,
            background: fill,
            borderRadius: 999,
          }}
        />
      </span>
      <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
        {covered}/{total} evidenced · {percent}%
      </span>
    </span>
  );
}

/** Distinct artifact chips for a control (anchoring evidence). */
function artifactChips(rows: ControlEvidenceRow[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.artifactLabel) seen.add(row.artifactLabel);
  }
  return Array.from(seen).slice(0, 6);
}

function ControlRow({
  code,
  title,
  rows,
}: {
  code: string;
  title: string;
  rows: ControlEvidenceRow[];
}): JSX.Element {
  const status = displayStatusFor(rows);
  const chips = artifactChips(rows);
  return (
    <div className="control-row">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <Link href={`/controls/${encodeURIComponent(code)}`} style={{ fontWeight: 700 }}>
            {code}
          </Link>{" "}
          <span>{title}</span>
        </div>
        <StatusPill status={status} />
      </div>

      {chips.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {chips.map((chip) => (
            <span
              key={chip}
              title="Anchoring evidence artifact"
              style={{
                fontSize: 11,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                background: "#f1f3f5",
                border: "1px solid #dee2e6",
                borderRadius: 6,
                padding: "1px 6px",
              }}
            >
              {chip}
            </span>
          ))}
        </div>
      ) : null}

      {rows.length > 0 ? (
        <details className="why">
          <summary>Why?</summary>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {rows.map((row, i) => (
              <li key={`${code}-${i}`} style={{ fontSize: 13, marginBottom: 4 }}>
                <StatusPill status={row.status} />{" "}
                <span className="muted">
                  {row.method === "deterministic_rule"
                    ? `rule: ${row.ruleId ?? "deterministic"}`
                    : `model: ${row.model ?? "gateway"}${
                        row.confidence != null ? ` (confidence ${(row.confidence * 100).toFixed(0)}%)` : ""
                      }`}
                </span>
                <div>{row.rationale}</div>
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
          No evidence collected for this control yet.
        </p>
      )}
    </div>
  );
}

export default async function ControlsPage(): Promise<JSX.Element> {
  const ctx = await resolveOrgContext();
  if (!ctx) redirect("/login");

  const db = buildDb();
  const [evidence, artifactCount] = await Promise.all([
    loadControlEvidence(db, ctx.orgId),
    countArtifacts(db, ctx.orgId),
  ]);

  const groups = controlsByCategory();
  const overall = coverageFor(
    TSC_CONTROLS.map((c) => c.code),
    evidence,
  );

  return (
    <main>
      <style>{`
        .control-row {
          border: 1px solid #e9ecef;
          border-radius: 10px;
          padding: 12px 14px;
          margin-top: 10px;
          background: var(--card-bg, #fff);
          transition: box-shadow 0.15s ease, transform 0.15s ease;
        }
        .control-row:hover {
          box-shadow: 0 4px 14px rgba(0,0,0,0.08);
          transform: translateY(-1px);
        }
        details.category > summary {
          cursor: pointer;
          list-style: none;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
          padding: 12px 0;
          border-bottom: 1px solid #e9ecef;
          font-weight: 700;
        }
        details.category > summary::-webkit-details-marker { display: none; }
        details.why > summary {
          cursor: pointer;
          font-size: 12px;
          color: #4c6ef5;
          margin-top: 8px;
        }
        @media (prefers-color-scheme: dark) {
          .control-row { background: var(--card-bg, #15171a); border-color: #2b2f36; }
        }
      `}</style>

      <h1>Controls</h1>
      <p>
        The AICPA SOC 2 Trust Services Criteria (2017, with 2022 points of focus),
        embedded as a structured knowledge base. Nexus maps your ingested
        infrastructure state to each criterion using {deterministicRuleCount()}{" "}
        deterministic rules first, and only asks the model about ambiguous
        artifacts. Every status is one of <strong>evidence found</strong>,{" "}
        <strong>gap</strong>, <strong>needs human review</strong> or{" "}
        <strong>N/A claimed</strong> — we flag, we never certify.
      </p>

      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700 }}>Overall evidence coverage</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {TSC_CONTROLS.length} criteria across {groups.length} categories · mapped against{" "}
            {SOC2_POLICY_DOCUMENTS.length} policies
          </div>
        </div>
        <CoverageMeter covered={overall.covered} total={overall.total} percent={overall.percent} />
      </div>

      {artifactCount === 0 ? (
        <div className="empty" style={{ marginTop: 20 }}>
          <div style={{ fontSize: 40, lineHeight: 1 }} aria-hidden="true">🗂️</div>
          <h2 style={{ marginTop: 12 }}>Nothing collected yet — connect a source to populate evidence</h2>
          <p className="muted" style={{ maxWidth: 560, margin: "8px auto 16px" }}>
            Once you connect AWS, GitHub, GCP or HRIS, Nexus ingests read-only
            configuration (CloudTrail, IAM, branch protection, backups, and more),
            runs the deterministic rules, and anchors each criterion below to the
            exact artifact that evidences it. Until then, every control shows as
            <em> Not collected</em>.
          </p>
          <Link href="/connections" className="btn">
            Go to Connections
          </Link>
        </div>
      ) : null}

      <div style={{ marginTop: 20 }}>
        {groups.map((group) => {
          const codes = group.controls.map((c) => c.code);
          const cov = coverageFor(codes, evidence);
          return (
            <details key={group.category.category} className="category" open>
              <summary>
                <span>{group.category.label}</span>
                <CoverageMeter covered={cov.covered} total={cov.total} percent={cov.percent} />
              </summary>
              <div style={{ paddingBottom: 12 }}>
                {group.controls.map((control) => (
                  <ControlRow
                    key={control.code}
                    code={control.code}
                    title={control.title}
                    rows={evidence.get(control.code) ?? []}
                  />
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </main>
  );
}
