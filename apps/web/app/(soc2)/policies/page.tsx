/**
 * /policies — the Evidence-Anchored Policy Drafting Studio gallery (F1-007).
 *
 * A gallery of the 10 most-requested SOC 2 policy documents (ceo_briefing
 * key_feature 2). Each card carries a progress ring that walks the lifecycle
 * drafted → in review → approved, plus the evidence-readiness of the policy's
 * controls. Policies whose controls have no evidence yet are shown locked, with a
 * calm explanation that drafting unlocks once the related controls have evidence.
 *
 * A persistent, non-dismissable disclaimer strip reminds the reader that every
 * draft is AI-generated and requires human review before auditor submission.
 *
 * Server-rendered throughout (SVG ring, no client bundle).
 */
import type { JSX } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveOrgContext } from "@/lib/soc2/access";
import { buildDb } from "@/lib/db";
import { POLICY_DISCLAIMER } from "@/lib/soc2/drafting/drafter";
import {
  summarizePolicyStates,
  type PolicyLifecycle,
  type PolicyState,
} from "@/lib/soc2/drafting/rag";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LIFECYCLE_META: Record<
  PolicyLifecycle,
  { label: string; step: number; color: string }
> = {
  not_started: { label: "Not started", step: 0, color: "#adb5bd" },
  drafting: { label: "Drafting…", step: 1, color: "#f08c00" },
  drafted: { label: "Drafted", step: 1, color: "#1971c2" },
  in_review: { label: "In review", step: 2, color: "#f08c00" },
  approved: { label: "Approved", step: 3, color: "#2f9e44" },
};

const TOTAL_STEPS = 3;

/** A circular progress ring that fills with the lifecycle step. */
function ProgressRing({ state }: { state: PolicyState }): JSX.Element {
  const meta = LIFECYCLE_META[state.status];
  const fraction = Math.min(1, meta.step / TOTAL_STEPS);
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - fraction);
  return (
    <span
      aria-label={`Status: ${meta.label}`}
      style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}
    >
      <svg width={64} height={64} viewBox="0 0 64 64" role="img">
        <circle cx={32} cy={32} r={radius} fill="none" stroke="#e9ecef" strokeWidth={6} />
        <circle
          cx={32}
          cy={32}
          r={radius}
          fill="none"
          stroke={meta.color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 32 32)"
        />
        <text
          x={32}
          y={36}
          textAnchor="middle"
          fontSize={13}
          fontWeight={700}
          fill={meta.color}
        >
          {meta.step}/{TOTAL_STEPS}
        </text>
      </svg>
    </span>
  );
}

function StatusChip({ status }: { status: PolicyLifecycle }): JSX.Element {
  const meta = LIFECYCLE_META[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: `${meta.color}1a`,
        color: meta.color,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 999, background: meta.color }} />
      {meta.label}
    </span>
  );
}

function PolicyCard({ state }: { state: PolicyState }): JSX.Element {
  const { policy } = state;
  const evidenceLine = `${state.controlsWithEvidence}/${state.totalControls} controls with evidence`;
  return (
    <Link
      href={`/policies/${encodeURIComponent(policy.key)}`}
      className="card"
      style={{
        display: "flex",
        gap: 16,
        alignItems: "flex-start",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <ProgressRing state={state} />
      <span style={{ flex: "1 1 auto", minWidth: 0, display: "block" }}>
        <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <strong style={{ fontSize: 16 }}>{policy.title}</strong>
          <StatusChip status={state.status} />
        </span>
        <span className="muted" style={{ display: "block", fontSize: 13, marginTop: 6 }}>
          {policy.blurb}
        </span>
        <span
          className="muted"
          style={{ display: "block", fontSize: 12, marginTop: 8 }}
        >
          {state.locked ? (
            <span style={{ color: "#9c6400" }}>🔒 Locked — {evidenceLine}</span>
          ) : (
            <span>
              {evidenceLine}
              {state.clauseCount > 0
                ? ` · ${state.clauseCount} clauses, ${state.unanchoredCount} need input`
                : ""}
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}

export default async function PoliciesPage(): Promise<JSX.Element> {
  const ctx = await resolveOrgContext();
  if (!ctx) redirect("/login");

  const db = buildDb();
  const states = await summarizePolicyStates(db, ctx.orgId);

  const anyUnlocked = states.some((s) => !s.locked);
  const approved = states.filter((s) => s.status === "approved").length;
  const inReview = states.filter((s) => s.status === "in_review").length;
  const drafted = states.filter((s) => s.status === "drafted").length;

  return (
    <main>
      <div
        role="note"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5,
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

      <h1>Policy drafting studio</h1>
      <p>
        Automated drafts of the 10 most-requested SOC 2 policies, tailored to your
        actual technical environment — every clause anchored to a retrieved evidence
        artifact. Open a policy to review, regenerate, and approve its clauses.
      </p>

      <p className="muted" style={{ fontSize: 13 }}>
        {approved} approved · {inReview} in review · {drafted} drafted · {states.length} policies
      </p>

      {!anyUnlocked ? (
        <div className="empty" style={{ marginTop: 16 }}>
          <h3 style={{ margin: 0 }}>Drafting unlocks once your controls have evidence</h3>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Each policy drafts from the evidence mapped to its Trust Services Criteria.
            Connect your systems on <Link href="/connections">Connections</Link> and let the
            mapper run — once a policy&apos;s controls have evidence, its card unlocks here.
          </p>
        </div>
      ) : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 14,
          marginTop: 18,
        }}
      >
        {states.map((state) => (
          <PolicyCard key={state.policy.key} state={state} />
        ))}
      </section>
    </main>
  );
}
