/**
 * /gaps/remediation — the full remediation priority queue + the human
 * confirmation gate (F1-006).
 *
 * This is where "Mark fixed" lands. An item moved to
 * `fixed_pending_confirmation` surfaces at the top awaiting a DISTINCT human
 * confirmation before it is ever resolved — the liability_assessor human_in_loop
 * requirement for misconfigurations (we never auto-close a flagged gap).
 *
 * Below the pending band is the open queue (critical first), a resolved history,
 * and the list of past weekly reports.
 *
 * Language throughout is "gap" / "needs review" — never "compliant".
 */
import type { JSX } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { resolveOrgContext } from "@/lib/soc2/access";
import { buildDb } from "@/lib/db";
import { listReports, type GapReport } from "@/lib/soc2/gaps/analyze";
import {
  loadRemediationQueue,
  requestMarkFixed,
  confirmMarkFixed,
  cancelMarkFixed,
  SEVERITY_RANK,
  type RemediationItem,
  type Severity,
} from "@/lib/soc2/gaps/remediation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SEVERITY_META: Record<Severity, { label: string; bg: string; fg: string }> = {
  critical: { label: "Critical", bg: "#fff0f0", fg: "#c92a2a" },
  high: { label: "High", bg: "#fff4e6", fg: "#d9480f" },
  medium: { label: "Medium", bg: "#fff9db", fg: "#a07400" },
  low: { label: "Low", bg: "#f1f3f5", fg: "#495057" },
};

function SeverityPill({ severity }: { severity: Severity }): JSX.Element {
  const c = SEVERITY_META[severity];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: c.bg,
        color: c.fg,
        whiteSpace: "nowrap",
      }}
    >
      {c.label}
    </span>
  );
}

function OwnerAvatar({ email }: { email: string | null }): JSX.Element {
  const safe = (email ?? "").trim();
  const initials = safe
    ? safe
        .split(/[@._-]/)
        .filter((p) => p.length > 0)
        .slice(0, 2)
        .map((p) => p[0]!.toUpperCase())
        .join("")
    : "?";
  let hash = 0;
  for (let i = 0; i < safe.length; i += 1) hash = (hash * 31 + safe.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return (
    <span
      title={safe || "Unassigned"}
      aria-label={safe ? `Owner ${safe}` : "Unassigned"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        color: "#fff",
        background: safe ? `hsl(${hue} 55% 42%)` : "#adb5bd",
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function OwnerLine({ item }: { item: RemediationItem }): JSX.Element {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <OwnerAvatar email={item.ownerEmail} />
      <span className="muted" style={{ fontSize: 12 }}>
        {item.ownerEmail ?? "Unassigned"}
      </span>
    </span>
  );
}

export default async function RemediationPage(): Promise<JSX.Element> {
  const ctx = await resolveOrgContext();
  if (!ctx) redirect("/login");
  const orgId = ctx.orgId;

  const db = buildDb();
  const [all, reports] = await Promise.all([
    loadRemediationQueue(db, orgId, { includeResolved: true }),
    listReports(db, orgId, 12),
  ]);

  const pending = all.filter((i) => i.status === "fixed_pending_confirmation");
  const open = all
    .filter((i) => i.status === "open" || i.status === "in_progress")
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const resolved = all.filter((i) => i.status === "resolved" || i.status === "dismissed");

  // ── Server actions ──────────────────────────────────────────────────────
  async function markFixedAction(formData: FormData): Promise<void> {
    "use server";
    const session = await resolveOrgContext();
    if (!session) redirect("/login");
    const itemId = String(formData.get("item_id") ?? "");
    if (itemId) await requestMarkFixed(buildDb(), session.orgId, itemId, session.user.id);
    revalidatePath("/gaps/remediation");
    revalidatePath("/gaps");
  }

  async function confirmAction(formData: FormData): Promise<void> {
    "use server";
    const session = await resolveOrgContext();
    if (!session) redirect("/login");
    const itemId = String(formData.get("item_id") ?? "");
    if (itemId) await confirmMarkFixed(buildDb(), session.orgId, itemId);
    revalidatePath("/gaps/remediation");
    revalidatePath("/gaps");
  }

  async function cancelAction(formData: FormData): Promise<void> {
    "use server";
    const session = await resolveOrgContext();
    if (!session) redirect("/login");
    const itemId = String(formData.get("item_id") ?? "");
    if (itemId) await cancelMarkFixed(buildDb(), session.orgId, itemId);
    revalidatePath("/gaps/remediation");
    revalidatePath("/gaps");
  }

  return (
    <main>
      <style>{`
        .rem-actions { display: flex; gap: 8px; }
        .btn-accent {
          background: #4c6ef5; color: #fff; border: none; border-radius: 8px;
          padding: 8px 16px; font-weight: 700; cursor: pointer; white-space: nowrap;
        }
        .btn-accent:hover { background: #3b5bdb; }
        .btn-plain {
          background: transparent; border: 1px solid #ced4da; border-radius: 8px;
          padding: 8px 14px; font-weight: 600; cursor: pointer; white-space: nowrap;
        }
      `}</style>

      <p>
        <Link href="/gaps">← Back to gap report</Link>
      </p>
      <h1>Remediation queue</h1>
      <p>
        Every flagged gap with a severity, an owner, and a plain-English fix. Marking an
        item fixed routes to a human confirmation — we never auto-close a gap.
      </p>

      {pending.length > 0 ? (
        <section style={{ marginTop: 20 }}>
          <h2 style={{ color: "#5f3dc4" }}>Awaiting your confirmation ({pending.length})</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            These were marked fixed. Confirm only after you&apos;ve verified the underlying
            setting is corrected — this is the human sign-off step.
          </p>
          {pending.map((item) => (
            <div key={item.id} className="card" style={{ marginTop: 10, borderColor: "#b197fc" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <SeverityPill severity={item.severity} />
                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>
                    <Link href={`/controls/${encodeURIComponent(item.controlCode)}`}>{item.title}</Link>
                  </div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                    {item.suggestedFix}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Marked fixed {formatDate(item.fixedRequestedAt)}
                  </div>
                </div>
                <OwnerLine item={item} />
                <div className="rem-actions">
                  <form action={confirmAction}>
                    <input type="hidden" name="item_id" value={item.id} />
                    <button type="submit" className="btn-accent">
                      Confirm fixed
                    </button>
                  </form>
                  <form action={cancelAction}>
                    <input type="hidden" name="item_id" value={item.id} />
                    <button type="submit" className="btn-plain">
                      Not yet
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section style={{ marginTop: 24 }}>
        <h2>Open items ({open.length})</h2>
        {open.length === 0 ? (
          <div className="empty" style={{ marginTop: 12 }}>
            <h3 style={{ margin: 0 }}>No open remediation items</h3>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              New gaps appear here after each weekly scan, each with an owner and a fix.
            </p>
          </div>
        ) : (
          open.map((item) => (
            <div key={item.id} className="card" style={{ marginTop: 10 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <SeverityPill severity={item.severity} />
                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>
                    <Link href={`/controls/${encodeURIComponent(item.controlCode)}`}>{item.title}</Link>
                  </div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                    {item.suggestedFix}
                  </div>
                </div>
                <OwnerLine item={item} />
                <div style={{ textAlign: "right", minWidth: 96 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Due {formatDate(item.dueDate)}</div>
                </div>
                <form action={markFixedAction}>
                  <input type="hidden" name="item_id" value={item.id} />
                  <button type="submit" className="btn-accent">
                    Mark fixed
                  </button>
                </form>
              </div>
            </div>
          ))
        )}
      </section>

      {resolved.length > 0 ? (
        <section style={{ marginTop: 24 }}>
          <details>
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>
              Resolved ({resolved.length})
            </summary>
            <ul style={{ listStyle: "none", padding: 0, marginTop: 10 }}>
              {resolved.map((item) => (
                <li key={item.id} className="card" style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <span>
                      <span style={{ color: "#2f9e44", fontWeight: 800 }} aria-hidden="true">
                        ✓
                      </span>{" "}
                      <strong>{item.title}</strong>
                    </span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {item.status === "dismissed" ? "dismissed" : "resolved"} {formatDate(item.resolvedAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        </section>
      ) : null}

      <section style={{ marginTop: 24 }}>
        <h2>Past weekly reports</h2>
        {reports.length === 0 ? (
          <p className="muted">No reports yet — the first one is generated by the weekly scan.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {reports.map((r: GapReport) => (
              <li key={r.id} className="card" style={{ marginTop: 8 }}>
                <Link href={`/gaps/${r.id}`} style={{ fontWeight: 700 }}>
                  {formatDate(r.generatedAt)}
                </Link>{" "}
                <span className="muted" style={{ fontSize: 13 }}>
                  — {r.controlsWithEvidence} with evidence · {r.gaps} gaps · {r.needsReview} needs review
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
