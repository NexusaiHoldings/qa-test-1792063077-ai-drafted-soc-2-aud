/**
 * /admin/feedback — Feedback triage + build tab (feedback-to-build-loop-001).
 *
 * The company admin's in-app control surface for the Feedback → Build loop.
 * Lists every submitted item with its Nexus triage recommendation, history, and
 * action buttons (Build / Revise / Discuss / Decline). Status is READ-ONLY —
 * it reflects what the coding pipeline did. High-risk items show a chairman-
 * approval banner; only a chairman may Build them. When the pipeline asks a
 * clarifying question, an answer box appears.
 *
 * Reads GET /api/feedback; acts via POST /api/feedback/:id/action and
 * /api/feedback/:id/answer. Self-contained, first-class styling for the
 * AdminShell light content area.
 */
"use client";

import { useCallback, useEffect, useState } from "react";

interface TriageScores {
  complexity?: number;
  fit?: number;
  value?: number;
}
interface Triage {
  recommendation?: string;
  scores?: TriageScores;
  confidence?: number;
  summary?: string;
  sourceRef?: string;
  requiresChairman?: boolean;
  riskAreas?: string[];
}
interface HistoryItem {
  ts?: string;
  kind?: string;
  detail?: string;
  actor?: string | null;
}
interface FeedbackItem {
  id: string;
  type: string;
  description: string;
  page: string | null;
  status: string;
  user: { id: string | null; name: string | null; email: string | null };
  triage: Triage;
  history: HistoryItem[];
  requestedAction: string | null;
  actionNote: string | null;
  actionState: string;
  pendingQuestion: string | null;
  pendingAnswer: string | null;
  actionedBy: string | null;
  actionedAt: string | null;
  createdAt: string | null;
}

const card: React.CSSProperties = {
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
  boxShadow: "0 1px 3px rgba(15,23,42,0.06)", overflow: "hidden",
};

function statusPill(status: string): React.CSSProperties {
  const map: Record<string, [string, string]> = {
    new: ["#dbeafe", "#1e40af"],
    triaged: ["#fef3c7", "#92400e"],
    building: ["#ede9fe", "#5b21b6"],
    declined: ["#f1f5f9", "#475569"],
    done: ["#dcfce7", "#166534"],
  };
  const [bg, fg] = map[status] || ["#f1f5f9", "#475569"];
  return { background: bg, color: fg, fontSize: 12, fontWeight: 700,
    padding: "2px 10px", borderRadius: 999, textTransform: "capitalize" };
}

function typeBadge(type: string): React.CSSProperties {
  const map: Record<string, string> = { bug: "#fee2e2", edit: "#e0f2fe", idea: "#fef9c3" };
  return { background: map[type] || "#f1f5f9", color: "#334155", fontSize: 12,
    fontWeight: 600, padding: "2px 8px", borderRadius: 6, textTransform: "capitalize" };
}

function recColor(rec: string | undefined): string {
  switch (rec) {
    case "build": return "#16a34a";
    case "revise": return "#d97706";
    case "discuss": return "#2563eb";
    case "decline": return "#dc2626";
    default: return "#64748b";
  }
}

function fmt(ts: string | null | undefined): string {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleString(); } catch { return String(ts); }
}

/**
 * The page the submitter was on, as a link back to it for review. Only
 * same-site relative paths ("/…", not "//…") are linkified — anything else
 * renders as plain text so a malformed value can't become an off-site or
 * javascript: link.
 */
function PageLink({ page }: { page: string | null }): JSX.Element {
  if (!page) return <span>Page: —</span>;
  const linkable = page.startsWith("/") && !page.startsWith("//");
  if (!linkable) return <span>Page: {page}</span>;
  return (
    <span>
      Page:{" "}
      <a
        href={page}
        target="_blank"
        rel="noopener noreferrer"
        title={`Open ${page} in a new tab`}
        style={{ color: "#2563eb", fontWeight: 600, textDecoration: "underline" }}
      >
        {page} ↗
      </a>
    </span>
  );
}

const btn = (bg: string, fg: string, border: string): React.CSSProperties => ({
  fontSize: 13, padding: "6px 14px", borderRadius: 7, cursor: "pointer",
  border: `1px solid ${border}`, background: bg, color: fg, fontWeight: 600,
});

export default function FeedbackAdminPage(): JSX.Element {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [viewer, setViewer] = useState<{ email: string; isChairman: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // Default to OPEN items (everything not done/declined) so triage isn't a
  // scroll through history. Chips switch the view; "All" shows everything.
  const [statusFilter, setStatusFilter] = useState<string>("open");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await fetch("/api/feedback", { cache: "no-store" });
      const d = await r.json();
      setItems(d.feedback || []);
      setViewer(d.viewer || null);
      setErr(d.error || null);
    } catch (e) {
      setErr(String(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Discuss/answer turns are produced ASYNC by Nexus (event → runtime → sync back
  // a few seconds later). While any item is awaiting Nexus (action_state
  // 'in_flight'), quietly re-fetch so the new turn / recommendation appears
  // without a manual refresh.
  useEffect(() => {
    const awaiting = items.some(
      (it: { actionState?: string }) => it.actionState === "in_flight",
    );
    if (!awaiting) return;
    const t = setInterval(() => load(true), 4000);
    return () => clearInterval(t);
  }, [items, load]);

  const act = async (id: string, action: string) => {
    setBusy(id);
    setErr(null);
    try {
      const r = await fetch(`/api/feedback/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: notes[id] || "" }),
      });
      if (!r.ok) {
        const t = await r.text();
        setErr(t === "requires_chairman"
          ? "This is a high-risk change — only the chairman can approve the Build."
          : t || `Action failed (${r.status})`);
      } else {
        setNotes((n) => ({ ...n, [id]: "" }));
        await load();
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  };

  const answer = async (id: string) => {
    setBusy(id);
    setErr(null);
    try {
      const r = await fetch(`/api/feedback/${id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: answers[id] || "" }),
      });
      if (!r.ok) {
        setErr((await r.text()) || `Answer failed (${r.status})`);
      } else {
        setAnswers((a) => ({ ...a, [id]: "" }));
        await load();
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", margin: 0 }}>Feedback</h1>
        <p style={{ color: "#64748b", fontSize: 14, marginTop: 4 }}>
          What your users are asking for. Nexus triages each item; click <strong>Build</strong> to
          ship the change automatically. Status reflects the pipeline — it can&apos;t be edited.
        </p>
      </div>

      {err && (
        <div style={{ ...card, padding: 14, marginBottom: 16, color: "#991b1b",
          background: "#fef2f2", borderColor: "#fecaca" }}>
          {err}
        </div>
      )}

      {/* Status filter chips — default hides done/declined */}
      {items.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {(() => {
            const openCount = items.filter(
              (it) => it.status !== "done" && it.status !== "declined").length;
            const chips: Array<[string, string]> = [
              ["open", `Open (${openCount})`],
              ["all", `All (${items.length})`],
              ["building", "Building"],
              ["declined", "Declined"],
              ["done", `Done (${items.filter((it) => it.status === "done").length})`],
            ];
            return chips.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                style={{
                  fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 999,
                  cursor: "pointer",
                  border: statusFilter === key ? "1px solid #2563eb" : "1px solid #e2e8f0",
                  background: statusFilter === key ? "#2563eb" : "#fff",
                  color: statusFilter === key ? "#fff" : "#475569",
                }}
              >{label}</button>
            ));
          })()}
        </div>
      )}

      {(() => {
        const visible = items.filter((it) =>
          statusFilter === "all" ? true
          : statusFilter === "open" ? it.status !== "done" && it.status !== "declined"
          : it.status === statusFilter);
        return loading ? (
        <div style={{ ...card, padding: 16, color: "#64748b" }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ ...card, padding: 24, color: "#64748b" }}>
          No feedback yet. Submitted items will appear here for triage.
        </div>
      ) : visible.length === 0 ? (
        <div style={{ ...card, padding: 24, color: "#64748b" }}>
          Nothing {statusFilter === "open" ? "open" : `in “${statusFilter}”`} — {items.length} item{items.length === 1 ? "" : "s"} under other filters.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {visible.map((it) => {
            const isOpen = open === it.id;
            const rec = it.triage?.recommendation;
            const highRisk = it.triage?.requiresChairman === true;
            const inFlight = it.actionState === "in_flight" || it.status === "building";
            const terminal = it.status === "done";
            const canChairman = viewer?.isChairman === true;
            const buildBlocked = highRisk && !canChairman;
            return (
              <div key={it.id} style={card}>
                {/* Row header */}
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : it.id)}
                  style={{ width: "100%", textAlign: "left", border: "none", background: "none",
                    cursor: "pointer", padding: "14px 16px", display: "flex", alignItems: "center",
                    gap: 12 }}
                >
                  <span style={typeBadge(it.type)}>{it.type}</span>
                  <span style={{ flex: 1, color: "#0f172a", fontSize: 14, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {it.description}
                  </span>
                  {highRisk && (
                    <span style={{ background: "#fef2f2", color: "#b91c1c", fontSize: 11,
                      fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>
                      High-risk
                    </span>
                  )}
                  {rec && (
                    <span style={{ color: recColor(rec), fontSize: 12, fontWeight: 700,
                      textTransform: "capitalize" }}>
                      {rec}
                    </span>
                  )}
                  <span style={statusPill(it.status)}>{it.status}</span>
                </button>

                {isOpen && (
                  <div style={{ padding: "0 16px 16px", borderTop: "1px solid #f1f5f9" }}>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12,
                      fontSize: 13, color: "#64748b" }}>
                      <span>From: {it.user?.email || it.user?.name || "anonymous"}</span>
                      <PageLink page={it.page} />
                      <span>Submitted: {fmt(it.createdAt)}</span>
                    </div>

                    <p style={{ marginTop: 12, color: "#0f172a", fontSize: 14, whiteSpace: "pre-wrap" }}>
                      {it.description}
                    </p>

                    {/* Recommendation banner */}
                    {rec && (
                      <div style={{ marginTop: 12, padding: 12, borderRadius: 8,
                        background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: recColor(rec) }}>
                          Nexus recommends: <span style={{ textTransform: "capitalize" }}>{rec}</span>
                        </div>
                        {it.triage?.summary && (
                          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#334155" }}>
                            {it.triage.summary}
                          </p>
                        )}
                        {typeof it.triage?.confidence === "number" && (
                          <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600,
                            color: it.triage.confidence >= 75 ? "#15803d"
                              : it.triage.confidence >= 50 ? "#b45309" : "#b91c1c" }}>
                            Overall confidence: {it.triage.confidence}/100
                          </div>
                        )}
                        {it.triage?.scores && (
                          <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 12,
                            color: "#64748b" }}>
                            <span>complexity {it.triage.scores.complexity ?? "—"}</span>
                            <span>fit {it.triage.scores.fit ?? "—"}</span>
                            <span>value {it.triage.scores.value ?? "—"}</span>
                          </div>
                        )}
                        {Array.isArray(it.triage?.riskAreas) && it.triage!.riskAreas!.length > 0 && (
                          <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c" }}>
                            Risk: {it.triage!.riskAreas!.join(", ")}
                          </div>
                        )}
                      </div>
                    )}

                    {highRisk && (
                      <div style={{ marginTop: 12, padding: 10, borderRadius: 8,
                        background: "#fef2f2", border: "1px solid #fecaca", fontSize: 13,
                        color: "#991b1b" }}>
                        {canChairman
                          ? "High-risk change (auth / billing / data-model / infra). You're approving as chairman."
                          : "High-risk change — only the chairman can approve the Build."}
                      </div>
                    )}

                    {/* Discussion thread — Nexus turns + your replies as a
                        conversation (not buried in the History log), with an
                        inline reply box so you continue by replying rather than
                        re-clicking Discuss. */}
                    {(() => {
                      const turns = Array.isArray(it.history)
                        ? it.history.filter((h) => h.kind === "discuss" || h.kind === "answer")
                        : [];
                      if (turns.length === 0 && !it.pendingQuestion) return null;
                      const awaiting = it.actionState === "in_flight";
                      return (
                        <div style={{ marginTop: 12, padding: 12, borderRadius: 8,
                          background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#334155",
                            marginBottom: 8 }}>Discussion with Nexus</div>
                          {turns.map((t, i) => {
                            const isNexus = t.kind === "discuss";
                            return (
                              <div key={i} style={{ display: "flex",
                                justifyContent: isNexus ? "flex-start" : "flex-end",
                                marginBottom: 6 }}>
                                <div style={{ maxWidth: "85%", padding: "8px 10px",
                                  borderRadius: 8, fontSize: 13, whiteSpace: "pre-wrap",
                                  background: isNexus ? "#eff6ff" : "#f1f5f9",
                                  border: `1px solid ${isNexus ? "#bfdbfe" : "#e2e8f0"}`,
                                  color: isNexus ? "#1e3a8a" : "#334155" }}>
                                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2,
                                    color: isNexus ? "#2563eb" : "#64748b" }}>
                                    {isNexus ? "Nexus" : "You"}
                                  </div>
                                  {t.detail}
                                </div>
                              </div>
                            );
                          })}
                          {awaiting && (
                            <div style={{ fontSize: 12, color: "#2563eb", fontStyle: "italic",
                              margin: "2px 0 6px" }}>Nexus is thinking…</div>
                          )}
                          <textarea
                            value={answers[it.id] || ""}
                            onChange={(e) => setAnswers((a) => ({ ...a, [it.id]: e.target.value }))}
                            placeholder="Reply to continue the discussion…"
                            rows={2}
                            style={{ width: "100%", padding: 8, borderRadius: 6, marginTop: 4,
                              border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                          />
                          <button disabled={busy === it.id || !(answers[it.id] || "").trim()}
                            onClick={() => answer(it.id)}
                            style={{ ...btn("#2563eb", "#fff", "#2563eb"), marginTop: 6 }}>
                            {busy === it.id ? "…" : "Send reply"}
                          </button>
                        </div>
                      );
                    })()}

                    {/* History timeline */}
                    {Array.isArray(it.history) && it.history.length > 0 && (
                      <details style={{ marginTop: 12 }}>
                        <summary style={{ cursor: "pointer", fontSize: 13, color: "#64748b" }}>
                          History ({it.history.length})
                        </summary>
                        <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12,
                          color: "#475569" }}>
                          {it.history.map((h, i) => (
                            <li key={i} style={{ marginBottom: 4 }}>
                              <span style={{ color: "#94a3b8" }}>{fmt(h.ts)}</span>{" "}
                              <strong>{h.kind}</strong> — {h.detail}
                              {h.actor ? <span style={{ color: "#94a3b8" }}> ({h.actor})</span> : null}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}

                    {/* Action bar */}
                    <div style={{ marginTop: 14 }}>
                      {terminal ? (
                        <div style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}>
                          ✓ Shipped — this change is live.
                        </div>
                      ) : inFlight ? (
                        <div style={{ fontSize: 13, color: "#5b21b6", fontWeight: 600 }}>
                          Building… the change-request pipeline is running. Status will update to
                          “done” when it merges + deploys.
                        </div>
                      ) : (
                        <>
                          <textarea
                            value={notes[it.id] || ""}
                            onChange={(e) => setNotes((nn) => ({ ...nn, [it.id]: e.target.value }))}
                            placeholder="Optional note for Build · required for Revise"
                            rows={2}
                            style={{ width: "100%", padding: 8, borderRadius: 6,
                              border: "1px solid #e2e8f0", boxSizing: "border-box", marginBottom: 8 }}
                          />
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              disabled={busy === it.id || buildBlocked}
                              title={buildBlocked ? "Requires chairman approval" : ""}
                              onClick={() => act(it.id, "build")}
                              style={btn(
                                buildBlocked ? "#f1f5f9" : "#16a34a",
                                buildBlocked ? "#94a3b8" : "#fff",
                                buildBlocked ? "#e2e8f0" : "#16a34a",
                              )}>
                              {busy === it.id ? "…" : highRisk ? "Approve & Build" : "Build"}
                            </button>
                            <button disabled={busy === it.id} onClick={() => act(it.id, "revise")}
                              style={btn("#fff", "#d97706", "#fcd34d")}>
                              Revise
                            </button>
                            <button disabled={busy === it.id} onClick={() => act(it.id, "discuss")}
                              style={btn("#fff", "#2563eb", "#bfdbfe")}>
                              Discuss
                            </button>
                            <button disabled={busy === it.id} onClick={() => act(it.id, "decline")}
                              style={btn("#fff", "#b91c1c", "#fecaca")}>
                              Decline
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
      })()}
    </div>
  );
}
