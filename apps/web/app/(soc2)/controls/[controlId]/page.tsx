/**
 * /controls/[controlId] — single Trust Services criterion detail (F1-005).
 *
 * Shows the AICPA criterion statement, its 2022 points of focus, the policy
 * document it belongs to, and the artifact types that can evidence it — then the
 * org's actual mapped evidence: each row's status pill, anchoring artifact, and
 * the deterministic rule id or model rationale ("why"). Server-rendered.
 *
 * [controlId] is the criterion code (e.g. "CC7.2"); an unknown code 404s.
 */
import type { JSX } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { resolveOrgContext } from "@/lib/soc2/access";
import { buildDb } from "@/lib/db";
import { getControl } from "@/lib/soc2/tsc/seed";
import {
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
        padding: "3px 12px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        background: c.bg,
        color: c.fg,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 999, background: c.dot }} />
      {c.label}
    </span>
  );
}

function EvidenceCard({ row }: { row: ControlEvidenceRow }): JSX.Element {
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <StatusPill status={row.status} />
        <span className="muted" style={{ fontSize: 12 }}>
          {row.method === "deterministic_rule"
            ? `Deterministic rule · ${row.ruleId ?? "rule"}`
            : `Gateway model · ${row.model ?? "mapper"}${
                row.confidence != null ? ` · confidence ${(row.confidence * 100).toFixed(0)}%` : ""
              }`}
        </span>
      </div>
      {row.artifactLabel ? (
        <p style={{ margin: "10px 0 0", fontSize: 13 }}>
          <strong>Anchoring artifact:</strong>{" "}
          <span
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              background: "#f1f3f5",
              border: "1px solid #dee2e6",
              borderRadius: 6,
              padding: "1px 6px",
            }}
          >
            {row.artifactLabel}
          </span>
        </p>
      ) : (
        <p className="muted" style={{ margin: "10px 0 0", fontSize: 13 }}>
          No anchoring artifact (status asserted without a cited artifact is never evidence_found).
        </p>
      )}
      <p style={{ margin: "8px 0 0" }}>{row.rationale}</p>
    </div>
  );
}

export default async function ControlDetailPage({
  params,
}: {
  params: { controlId: string };
}): Promise<JSX.Element> {
  const control = getControl(decodeURIComponent(params.controlId));
  if (!control) notFound();

  const ctx = await resolveOrgContext();
  if (!ctx) redirect("/login");

  const db = buildDb();
  const evidence = await loadControlEvidence(db, ctx.orgId);
  const rows = evidence.get(control.code) ?? [];
  const status = displayStatusFor(rows);

  return (
    <main>
      <p style={{ marginBottom: 8 }}>
        <Link href="/controls">← All controls</Link>
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>
          {control.code} — {control.title}
        </h1>
        <StatusPill status={status} />
      </div>
      <p>{control.criteriaText}</p>

      <div className="card" style={{ marginTop: 8 }}>
        <p style={{ margin: 0 }}>
          <strong>Category:</strong> {control.categoryLabel}
        </p>
        <p style={{ margin: "6px 0 0" }}>
          <strong>Policy document:</strong> {control.policyDocument}
        </p>
      </div>

      <h2 style={{ marginTop: 20 }}>Points of focus</h2>
      {control.pointsOfFocus.length > 0 ? (
        <ul>
          {control.pointsOfFocus.map((pof, i) => (
            <li key={`pof-${i}`}>{pof}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">No points of focus recorded for this criterion.</p>
      )}

      <h2 style={{ marginTop: 20 }}>Evidence artifact types</h2>
      {control.artifactTypes.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {control.artifactTypes.map((t) => (
            <span
              key={t}
              style={{
                fontSize: 12,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                background: "#f1f3f5",
                border: "1px solid #dee2e6",
                borderRadius: 6,
                padding: "2px 8px",
              }}
            >
              {t}
            </span>
          ))}
        </div>
      ) : (
        <p className="muted">
          This criterion is evidenced by policy and process attestations rather than ingested
          infrastructure state.
        </p>
      )}

      <h2 style={{ marginTop: 20 }}>Mapped evidence</h2>
      {rows.length > 0 ? (
        rows.map((row, i) => <EvidenceCard key={`${control.code}-${i}`} row={row} />)
      ) : (
        <div className="empty">
          <p className="muted" style={{ margin: 0 }}>
            No evidence collected for this control yet. Connect a source on the{" "}
            <Link href="/connections">Connections</Link> page to populate it.
          </p>
        </div>
      )}
    </main>
  );
}
