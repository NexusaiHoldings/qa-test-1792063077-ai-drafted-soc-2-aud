/**
 * /policies/[policyId] — the two-pane evidence-anchored policy editor (F1-007).
 *
 * Left: a calm, document-width reading column with serif-leaning headings and
 * generous line-height. Right: an evidence rail that lights up the anchoring
 * artifact when its clause is hovered. Unanchored clauses are tinted and carry a
 * "needs your input" chip; each clause has "Regenerate from evidence" and an
 * inline edit form.
 *
 * A persistent, non-dismissable disclaimer strip reads
 * "AI-drafted. Requires human review before submission to auditors".
 *
 * The empty state explains that drafting unlocks once the related controls have
 * evidence. When a draft exists, a staggered fade-in emulates clauses streaming
 * in. Lifecycle (draft → review → approve) is enforced server-side; approval
 * requires a DISTINCT reviewer from the drafter.
 *
 * Server component + server actions; a tiny progressive-enhancement script wires
 * the hover highlight (the page is fully usable without it).
 */
import type { JSX } from "react";
import Link from "next/link";
import Script from "next/script";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { resolveOrgContext } from "@/lib/soc2/access";
import { buildDb } from "@/lib/db";
import { getPolicy } from "@/lib/soc2/drafting/catalog";
import {
  approvePolicy,
  draftPolicy,
  editClause,
  loadPolicyEditor,
  POLICY_DISCLAIMER,
  regenerateClause,
  submitForReview,
  type ClauseView,
  type PolicyEditorData,
} from "@/lib/soc2/drafting/drafter";
import type { RedactedArtifact } from "@/lib/soc2/drafting/redact";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function statusLabel(status: string): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "in_review":
      return "In review";
    case "drafted":
      return "Drafted";
    case "drafting":
      return "Drafting…";
    default:
      return "Not started";
  }
}

function RailCard({ artifact }: { artifact: RedactedArtifact }): JSX.Element {
  return (
    <div
      id={`ev-${artifact.id}`}
      className="rail-item card"
      style={{ padding: "10px 12px", marginBottom: 10, transition: "all 120ms ease" }}
    >
      <div style={{ fontWeight: 700, fontSize: 13 }}>
        {artifact.provider} · {artifact.artifactType.replace(/_/g, " ")}
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        {artifact.summary}
      </div>
      {artifact.collectedAt ? (
        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
          collected {new Date(artifact.collectedAt).toLocaleDateString()}
        </div>
      ) : null}
    </div>
  );
}

function ClauseBlock({
  clause,
  policyKey,
  canEdit,
  regenerateAction,
  editAction,
}: {
  clause: ClauseView;
  policyKey: string;
  canEdit: boolean;
  regenerateAction: (formData: FormData) => Promise<void>;
  editAction: (formData: FormData) => Promise<void>;
}): JSX.Element {
  const anchorIds = clause.anchors.map((a) => a.artifactId).join(",");
  return (
    <article
      className="clause"
      data-clause-anchors={anchorIds}
      style={{
        padding: "16px 18px",
        borderRadius: 10,
        marginBottom: 14,
        border: "1px solid",
        borderColor: clause.unanchored ? "#ffe3bf" : "#e9ecef",
        background: clause.unanchored ? "#fffaf0" : "#ffffff",
        animation: `clauseIn 360ms ease both`,
        animationDelay: `${Math.min(clause.index * 90, 900)}ms`,
        transition: "background 120ms ease",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <h3
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: 20,
            margin: 0,
            lineHeight: 1.3,
          }}
        >
          {clause.heading}
        </h3>
        {clause.unanchored ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#9c6400",
              background: "#fff3bf",
              borderRadius: 999,
              padding: "2px 10px",
              whiteSpace: "nowrap",
            }}
          >
            needs your input
          </span>
        ) : (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#2b8a3e",
              background: "#ebfbee",
              borderRadius: 999,
              padding: "2px 10px",
              whiteSpace: "nowrap",
            }}
          >
            {clause.anchors.length} anchored
          </span>
        )}
      </div>

      <p style={{ fontSize: 15.5, lineHeight: 1.85, marginTop: 10, marginBottom: 8 }}>
        {clause.body}
      </p>

      {clause.unanchored && clause.needsInputReason ? (
        <p className="muted" style={{ fontSize: 13, fontStyle: "italic" }}>
          {clause.needsInputReason}
        </p>
      ) : null}

      {clause.anchors.length > 0 ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
          {clause.anchors.map((anchor) => (
            <a
              key={anchor.artifactId}
              href={`#ev-${anchor.artifactId}`}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#364fc7",
                background: "#edf2ff",
                borderRadius: 999,
                padding: "2px 10px",
                textDecoration: "none",
              }}
            >
              🔗 {anchor.label}
            </a>
          ))}
        </div>
      ) : null}

      {clause.controlCodes.length > 0 ? (
        <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
          Covers:{" "}
          {clause.controlCodes.map((code, i) => (
            <span key={code}>
              {i > 0 ? ", " : ""}
              <Link href={`/controls/${encodeURIComponent(code)}`}>{code}</Link>
            </span>
          ))}
        </div>
      ) : null}

      {canEdit ? (
        <div style={{ marginTop: 12 }}>
          <form action={regenerateAction} style={{ display: "inline" }}>
            <input type="hidden" name="clause_index" value={clause.index} />
            <button type="submit" className="btn-plain">
              ↻ Regenerate from evidence
            </button>
          </form>
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              Inline edit
            </summary>
            <form action={editAction} style={{ marginTop: 8 }}>
              <input type="hidden" name="clause_index" value={clause.index} />
              <label style={{ display: "block", fontSize: 12, fontWeight: 600 }}>
                Heading
                <input type="text" name="heading" defaultValue={clause.heading} style={{ width: "100%" }} />
              </label>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginTop: 8 }}>
                Body
                <textarea name="body" defaultValue={clause.body} rows={5} style={{ width: "100%" }} />
              </label>
              <button type="submit" className="btn-accent" style={{ marginTop: 8 }}>
                Save edit
              </button>
            </form>
          </details>
        </div>
      ) : null}
    </article>
  );
}

export default async function PolicyEditorPage({
  params,
  searchParams,
}: {
  params: { policyId: string };
  searchParams?: { notice?: string; ok?: string };
}): Promise<JSX.Element> {
  const ctx = await resolveOrgContext();
  if (!ctx) redirect("/login");

  const policyKey = decodeURIComponent(params.policyId);
  const descriptor = getPolicy(policyKey);
  if (!descriptor) notFound();

  const db = buildDb();
  const data: PolicyEditorData | null = await loadPolicyEditor(db, ctx.orgId, policyKey);
  if (!data) notFound();

  const notice = searchParams?.notice ? decodeURIComponent(searchParams.notice) : null;
  const noticeOk = searchParams?.ok === "1";

  // ── Server actions ────────────────────────────────────────────────────────
  async function draftAction(): Promise<void> {
    "use server";
    const session = await resolveOrgContext();
    if (!session) redirect("/login");
    const result = await draftPolicy(buildDb(), session.orgId, policyKey, session.user.id);
    revalidatePath(`/policies/${policyKey}`);
    revalidatePath("/policies");
    redirect(`/policies/${encodeURIComponent(policyKey)}?ok=${result.ok ? "1" : "0"}&notice=${encodeURIComponent(result.message)}`);
  }

  async function regenerateAction(formData: FormData): Promise<void> {
    "use server";
    const session = await resolveOrgContext();
    if (!session) redirect("/login");
    const idx = Number(formData.get("clause_index"));
    const result = await regenerateClause(buildDb(), session.orgId, policyKey, idx, session.user.id);
    revalidatePath(`/policies/${policyKey}`);
    redirect(`/policies/${encodeURIComponent(policyKey)}?ok=${result.ok ? "1" : "0"}&notice=${encodeURIComponent(result.message)}`);
  }

  async function editAction(formData: FormData): Promise<void> {
    "use server";
    const session = await resolveOrgContext();
    if (!session) redirect("/login");
    const idx = Number(formData.get("clause_index"));
    const heading = String(formData.get("heading") ?? "");
    const body = String(formData.get("body") ?? "");
    const result = await editClause(buildDb(), session.orgId, policyKey, idx, heading, body, session.user.id);
    revalidatePath(`/policies/${policyKey}`);
    redirect(`/policies/${encodeURIComponent(policyKey)}?ok=${result.ok ? "1" : "0"}&notice=${encodeURIComponent(result.message)}`);
  }

  async function reviewAction(): Promise<void> {
    "use server";
    const session = await resolveOrgContext();
    if (!session) redirect("/login");
    const result = await submitForReview(buildDb(), session.orgId, policyKey);
    revalidatePath(`/policies/${policyKey}`);
    revalidatePath("/policies");
    redirect(`/policies/${encodeURIComponent(policyKey)}?ok=${result.ok ? "1" : "0"}&notice=${encodeURIComponent(result.message)}`);
  }

  async function approveAction(): Promise<void> {
    "use server";
    const session = await resolveOrgContext();
    if (!session) redirect("/login");
    const result = await approvePolicy(buildDb(), session.orgId, policyKey, session.user.id);
    revalidatePath(`/policies/${policyKey}`);
    revalidatePath("/policies");
    redirect(`/policies/${encodeURIComponent(policyKey)}?ok=${result.ok ? "1" : "0"}&notice=${encodeURIComponent(result.message)}`);
  }

  const canEdit = data.hasDraft && data.status !== "approved";

  return (
    <main style={{ maxWidth: 1180 }}>
      <style>{`
        @keyframes clauseIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .rail-item.lit, .rail-item:target { outline: 2px solid #4c6ef5; background: #edf2ff !important; }
        .clause.clause-active { background: #f8f9ff !important; }
        .btn-accent {
          background: #4c6ef5; color: #fff; border: none; border-radius: 8px;
          padding: 8px 16px; font-weight: 700; cursor: pointer;
        }
        .btn-accent:hover { background: #3b5bdb; }
        .btn-plain {
          background: transparent; border: 1px solid #ced4da; border-radius: 8px;
          padding: 7px 14px; font-weight: 600; cursor: pointer;
        }
      `}</style>

      <div
        role="note"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "#fff4e6",
          color: "#9c4221",
          border: "1px solid #ffd8a8",
          borderRadius: 8,
          padding: "10px 14px",
          fontWeight: 600,
          fontSize: 13,
          marginBottom: 16,
        }}
      >
        ⚠️ {POLICY_DISCLAIMER}
      </div>

      <p>
        <Link href="/policies">← All policies</Link>
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>{data.title}</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            {statusLabel(data.status)}
            {data.versionNo > 0 ? ` · v${data.versionNo}` : ""} ·{" "}
            {data.controlsWithEvidence}/{data.totalControls} controls with evidence
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <form action={draftAction}>
            <button type="submit" className="btn-accent" disabled={data.locked}>
              {data.hasDraft ? "Re-draft from evidence" : "Draft from evidence"}
            </button>
          </form>
          {data.hasDraft && data.status === "drafted" ? (
            <form action={reviewAction}>
              <button type="submit" className="btn-plain">
                Submit for review
              </button>
            </form>
          ) : null}
          {data.hasDraft && data.status === "in_review" ? (
            <form action={approveAction}>
              <button type="submit" className="btn-accent">
                Approve
              </button>
            </form>
          ) : null}
        </div>
      </div>

      {notice ? (
        <div
          role="status"
          style={{
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            background: noticeOk ? "#ebfbee" : "#fff0f0",
            color: noticeOk ? "#2b8a3e" : "#c92a2a",
            border: `1px solid ${noticeOk ? "#b2f2bb" : "#ffc9c9"}`,
          }}
        >
          {notice}
        </div>
      ) : null}

      {data.locked ? (
        <div className="empty" style={{ marginTop: 20 }}>
          <h3 style={{ margin: 0 }}>Drafting unlocks once the related controls have evidence</h3>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            This policy documents {data.totalControls} Trust Services Criteria, but none have
            evidence yet. Connect the relevant systems on{" "}
            <Link href="/connections">Connections</Link> and run the mapper — once a control is
            evidenced, you can draft clauses anchored to it.
          </p>
        </div>
      ) : !data.hasDraft ? (
        <div className="empty" style={{ marginTop: 20 }}>
          <h3 style={{ margin: 0 }}>No draft yet</h3>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {data.controlsWithEvidence} of this policy&apos;s {data.totalControls} controls have
            evidence. Click <strong>Draft from evidence</strong> to generate clauses, each
            anchored to a retrieved artifact.
          </p>
        </div>
      ) : (
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 320px",
            gap: 24,
            marginTop: 20,
            alignItems: "start",
          }}
        >
          <div style={{ minWidth: 0 }}>
            {data.summary ? (
              <p className="muted" style={{ fontSize: 14, lineHeight: 1.7, marginTop: 0 }}>
                {data.summary}
              </p>
            ) : null}
            {data.clauses.map((clause) => (
              <ClauseBlock
                key={`${clause.index}-${clause.heading}`}
                clause={clause}
                policyKey={policyKey}
                canEdit={canEdit}
                regenerateAction={regenerateAction}
                editAction={editAction}
              />
            ))}
          </div>

          <aside
            style={{
              position: "sticky",
              top: 64,
              alignSelf: "start",
            }}
          >
            <h2 style={{ fontSize: 15, marginTop: 0 }}>Evidence rail</h2>
            <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
              Hover a clause to light up the artifacts that anchor it.
            </p>
            {data.rail.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>
                No anchorable evidence for this policy yet.
              </p>
            ) : (
              data.rail.map((artifact) => <RailCard key={artifact.id} artifact={artifact} />)
            )}
          </aside>
        </section>
      )}

      <Script id="policy-hover" strategy="afterInteractive">
        {`
          (function () {
            var clauses = document.querySelectorAll('[data-clause-anchors]');
            clauses.forEach(function (el) {
              var ids = (el.getAttribute('data-clause-anchors') || '')
                .split(',').map(function (s) { return s.trim(); }).filter(Boolean);
              function toggle(on) {
                el.classList.toggle('clause-active', on);
                ids.forEach(function (id) {
                  var r = document.getElementById('ev-' + id);
                  if (r) r.classList.toggle('lit', on);
                });
              }
              el.addEventListener('mouseenter', function () { toggle(true); });
              el.addEventListener('mouseleave', function () { toggle(false); });
            });
          })();
        `}
      </Script>
    </main>
  );
}
