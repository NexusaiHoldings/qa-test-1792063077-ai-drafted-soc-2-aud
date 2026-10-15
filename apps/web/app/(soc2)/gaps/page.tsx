/**
 * /gaps — the Weekly Gap Report hero screen (F1-006).
 *
 * This is the product's hero screen and the artifact that converts the free
 * scan. It renders:
 *   - a top summary band with three large numerals (controls with evidence,
 *     gaps, needs-review) and a sparkline of gap count over weeks;
 *   - a "What changed since last week" panel (newly flagged / newly resolved
 *     controls);
 *   - the remediation queue as card rows with a severity pill, owner avatar, due
 *     date, and a single accent "Mark fixed" action that routes to a HUMAN
 *     CONFIRMATION (never auto-closing — liability_assessor human_in_loop).
 *
 * The language is deliberately "gap" / "needs review" — never "compliant". The
 * agent flags, it does not certify.
 *
 * Empty state (no report yet and nothing collected): an illustrated
 * "Your first scan is running" with an ETA. On mobile the three numerals
 * collapse to a horizontal scroll strip.
 */
import type { JSX } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { resolveOrgContext } from "@/lib/soc2/access";
import { buildDb } from "@/lib/db";
import { countArtifacts } from "@/lib/soc2/mapper";
import {
  computeSnapshotCounts,
  getLatestReport,
  getSparkline,
  type GapSnapshotCounts,
  type SparklinePoint,
} from "@/lib/soc2/gaps/analyze";
import { loadChangedFindings, type GapFinding } from "@/lib/soc2/gaps/diff";
import {
  loadRemediationQueue,
  requestMarkFixed,
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

/** Derive a 1–2 letter avatar label + a stable colour from an email. */
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

/** A big headline numeral in the summary band. */
function Numeral({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}): JSX.Element {
  return (
    <div className="gap-numeral">
      <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1, color }}>{value}</div>
      <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
        {label}
      </div>
    </div>
  );
}

/** A compact inline SVG sparkline of the weekly gap count. */
function Sparkline({ points }: { points: readonly SparklinePoint[] }): JSX.Element {
  if (points.length < 2) {
    return (
      <span className="muted" style={{ fontSize: 12 }}>
        Not enough history yet — the trend appears after a few weekly scans.
      </span>
    );
  }
  const w = 160;
  const h = 40;
  const values = points.map((p) => p.gaps);
  const max = Math.max(1, ...values);
  const min = Math.min(...values);
  const span = Math.max(1, max - min);
  const stepX = w / (points.length - 1);
  const coords = values.map((v, i) => {
    const x = i * stepX;
    const y = h - ((v - min) / span) * (h - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const trendUp = last.gaps > prev.gaps;
  const stroke = trendUp ? "#e03131" : "#2f9e44";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Gap count over recent weeks">
        <polyline points={coords.join(" ")} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
        {trendUp ? "▲" : "▼"} {last.gaps} gaps · {points.length} wk
      </span>
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Due-date hint: overdue / due today / in N days. */
function dueHint(dueDate: string | null): { text: string; overdue: boolean } {
  if (!dueDate) return { text: "No due date", overdue: false };
  const due = Date.parse(dueDate);
  if (Number.isNaN(due)) return { text: "No due date", overdue: false };
  const today = new Date();
  const todayMid = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const days = Math.round((due - todayMid) / (24 * 60 * 60 * 1000));
  if (days < 0) return { text: `Overdue by ${Math.abs(days)}d`, overdue: true };
  if (days === 0) return { text: "Due today", overdue: true };
  return { text: `Due in ${days}d`, overdue: false };
}

function ChangePanel({
  added,
  resolved,
}: {
  added: GapFinding[];
  resolved: GapFinding[];
}): JSX.Element {
  if (added.length === 0 && resolved.length === 0) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        No changes since last week — the same controls are flagged as before.
      </p>
    );
  }
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {added.map((f) => (
        <div key={`new-${f.controlCode}`} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ color: "#e03131", fontWeight: 800 }} aria-hidden="true">
            +
          </span>
          <div>
            <strong>{f.controlCode}</strong> {f.controlTitle ?? ""}{" "}
            <span className="muted" style={{ fontSize: 12 }}>
              newly {f.currentStatus === "needs_human_review" ? "needs review" : "a gap"}
            </span>
          </div>
        </div>
      ))}
      {resolved.map((f) => (
        <div key={`res-${f.controlCode}`} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ color: "#2f9e44", fontWeight: 800 }} aria-hidden="true">
            ✓
          </span>
          <div>
            <strong>{f.controlCode}</strong> {f.controlTitle ?? ""}{" "}
            <span className="muted" style={{ fontSize: 12 }}>
              no longer flagged
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function RemediationRow({ item, action }: { item: RemediationItem; action: (fd: FormData) => Promise<void> }): JSX.Element {
  const hint = dueHint(item.dueDate);
  const pending = item.status === "fixed_pending_confirmation";
  return (
    <div className="card gap-rem-row">
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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <OwnerAvatar email={item.ownerEmail} />
          <span className="muted" style={{ fontSize: 12 }}>
            {item.ownerEmail ?? "Unassigned"}
          </span>
        </div>
        <div style={{ textAlign: "right", minWidth: 110 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: hint.overdue ? "#c92a2a" : undefined }}>
            {hint.text}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {formatDate(item.dueDate)}
          </div>
        </div>
        {pending ? (
          <Link href="/gaps/remediation" className="btn secondary" style={{ whiteSpace: "nowrap" }}>
            Awaiting confirmation →
          </Link>
        ) : (
          <form action={action}>
            <input type="hidden" name="item_id" value={item.id} />
            <button type="submit" className="gap-mark-fixed">
              Mark fixed
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default async function GapsPage(): Promise<JSX.Element> {
  const ctx = await resolveOrgContext();
  if (!ctx) redirect("/login");
  const orgId = ctx.orgId;

  const db = buildDb();
  const [report, artifactCount, sparkline] = await Promise.all([
    getLatestReport(db, orgId),
    countArtifacts(db, orgId),
    getSparkline(db, orgId, 12),
  ]);

  // Live counts so the hero screen is useful right after the first collection,
  // before the first weekly cron has written a report.
  let counts: GapSnapshotCounts | null = report
    ? {
        totalControls: report.totalControls,
        controlsWithEvidence: report.controlsWithEvidence,
        gaps: report.gaps,
        needsReview: report.needsReview,
        notCollected: report.notCollected,
        artifactCount: report.artifactCount,
      }
    : null;
  if (!counts && artifactCount > 0) {
    counts = await computeSnapshotCounts(db, orgId);
  }

  const changed = report
    ? await loadChangedFindings(db, orgId, report.id)
    : { added: [], resolved: [] };
  const queue = await loadRemediationQueue(db, orgId);
  const openQueue = queue
    .filter((i) => i.status !== "resolved" && i.status !== "dismissed")
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  // Server action: "Mark fixed" → human confirmation (never auto-closes).
  async function markFixedAction(formData: FormData): Promise<void> {
    "use server";
    const session = await resolveOrgContext();
    if (!session) redirect("/login");
    const itemId = String(formData.get("item_id") ?? "");
    if (itemId) {
      await requestMarkFixed(buildDb(), session.orgId, itemId, session.user.id);
    }
    revalidatePath("/gaps");
    revalidatePath("/gaps/remediation");
    redirect("/gaps/remediation");
  }

  // Empty state: nothing collected and no report yet.
  if (!counts && artifactCount === 0) {
    return (
      <main>
        <h1>Gap report</h1>
        <p>Your SOC 2 posture at a glance — the gaps we found and who needs to fix them.</p>
        <div className="empty" style={{ marginTop: 20 }}>
          <div style={{ fontSize: 48, lineHeight: 1 }} aria-hidden="true">
            🛰️
          </div>
          <h2 style={{ marginTop: 12 }}>Your first scan is running</h2>
          <p className="muted" style={{ maxWidth: 560, margin: "8px auto 16px" }}>
            We&apos;re reading your connected systems read-only and mapping them to the
            Trust Services Criteria. The first gap report is usually ready within{" "}
            <strong>a few minutes</strong>. We&apos;ll flag every gap and what needs review —
            we never mark anything &quot;compliant&quot;.
          </p>
          <Link href="/connections" className="btn">
            Connect more sources
          </Link>
        </div>
      </main>
    );
  }

  const c = counts!;

  return (
    <main>
      <style>{`
        .gap-band {
          display: flex;
          align-items: center;
          gap: 24px;
          flex-wrap: wrap;
          justify-content: space-between;
        }
        .gap-numerals {
          display: flex;
          gap: 28px;
        }
        .gap-numeral { min-width: 92px; }
        .gap-mark-fixed {
          background: #4c6ef5;
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 8px 16px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }
        .gap-mark-fixed:hover { background: #3b5bdb; }
        .gap-rem-row { margin-top: 10px; }
        @media (max-width: 640px) {
          .gap-numerals {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            padding-bottom: 6px;
          }
          .gap-numeral { min-width: 120px; flex: 0 0 auto; }
        }
      `}</style>

      <h1>Gap report</h1>
      <p>
        Your SOC 2 posture at a glance — the gaps we found and who needs to fix
        them. We flag <strong>gaps</strong> and what <strong>needs review</strong>;
        we never certify anything as &quot;compliant&quot;.
      </p>

      <div className="card gap-band">
        <div className="gap-numerals">
          <Numeral value={c.controlsWithEvidence} label="controls with evidence" color="#2f9e44" />
          <Numeral value={c.gaps} label="gaps" color="#e03131" />
          <Numeral value={c.needsReview} label="needs review" color="#f08c00" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <Sparkline points={sparkline} />
          <span className="muted" style={{ fontSize: 12 }}>
            {report
              ? `Last scan ${formatDate(report.generatedAt)}`
              : "Live view — first weekly report pending"}
          </span>
        </div>
      </div>

      <section style={{ marginTop: 24 }}>
        <h2>What changed since last week</h2>
        <div className="card">
          <ChangePanel added={changed.added} resolved={changed.resolved} />
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Remediation queue</h2>
          <Link href="/gaps/remediation" className="btn secondary">
            Manage queue
          </Link>
        </div>
        {openQueue.length === 0 ? (
          <div className="empty" style={{ marginTop: 12 }}>
            <h3 style={{ margin: 0 }}>No open remediation items</h3>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Nothing is currently flagged for action. New gaps appear here after each
              weekly scan with an owner and a suggested fix.
            </p>
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            {openQueue.map((item) => (
              <RemediationRow key={item.id} item={item} action={markFixedAction} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
