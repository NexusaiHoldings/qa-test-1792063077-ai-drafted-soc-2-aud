"use client";
import React, { useCallback, useEffect, useState } from "react";

/**
 * AnalyticsDashboard — first-class product-analytics surface (slot:
 * analytics_dashboard). Reads one rich aggregate from
 * /api/analytics/summary?days= : window totals, a gap-filled daily series
 * (rendered as an inline-SVG bar trend — no chart dependency), top pages,
 * and per-event-name counts. Styled entirely with substrate CSS variables so
 * it tracks each company's ThemeContract; renders inside <main>, so substrate
 * helper classes are available too.
 */
interface Totals {
  events: number;
  page_views: number;
  unique_paths: number;
  active_users: number;
  active_days: number;
}
interface SeriesPoint {
  day: string;
  count: number;
}
interface PathRow {
  path: string;
  views: number;
}
interface EventRow {
  name: string;
  count: number;
}
interface Summary {
  window_days: number;
  totals: Totals;
  series: SeriesPoint[];
  top_pages: PathRow[];
  by_event: EventRow[];
}

interface AnalyticsDashboardProps {
  apiBase?: string;
}

const WINDOWS = [7, 30, 90] as const;

function fmt(n: number): string {
  return n.toLocaleString();
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      className="card"
      style={{ display: "flex", flexDirection: "column", gap: 4, margin: 0 }}
    >
      <span
        style={{
          fontSize: "0.78rem",
          fontWeight: 600,
          letterSpacing: "0.02em",
          color: "var(--substrate-muted)",
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: "1.9rem", fontWeight: 700, lineHeight: 1.1 }}>{value}</span>
      {hint ? (
        <span style={{ fontSize: "0.76rem", color: "var(--substrate-muted)" }}>{hint}</span>
      ) : null}
    </div>
  );
}

function TrendChart({ series }: { series: SeriesPoint[] }) {
  const max = Math.max(1, ...series.map((s) => s.count));
  const W = 720;
  const H = 160;
  const padB = 22;
  const n = series.length || 1;
  const gap = n > 45 ? 1 : 3;
  const barW = Math.max(1, (W - (n - 1) * gap) / n);
  // Label ~6 evenly spaced ticks so a 90-day window stays readable.
  const tickEvery = Math.max(1, Math.ceil(n / 6));

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={`Daily events for the last ${n} days, peak ${max}`}
        style={{ display: "block" }}
      >
        {series.map((pt, i) => {
          const h = Math.round(((H - padB) * pt.count) / max);
          const x = i * (barW + gap);
          const y = H - padB - h;
          return (
            <g key={pt.day}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(pt.count > 0 ? 2 : 0, h)}
                rx={barW > 4 ? 2 : 0}
                fill="var(--substrate-accent)"
                opacity={pt.count > 0 ? 0.9 : 0.15}
              >
                <title>{`${pt.day}: ${fmt(pt.count)}`}</title>
              </rect>
              {i % tickEvery === 0 ? (
                <text
                  x={x + barW / 2}
                  y={H - 6}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--substrate-fg)"
                >
                  {pt.day.slice(5)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function BarRow({ label, value, max, href }: { label: string; value: number; max: number; href?: boolean }) {
  const pct = Math.round((100 * value) / Math.max(1, max));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 0" }}>
      <span
        style={{
          flex: "0 0 46%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontSize: "0.9rem",
          fontFamily: href ? "var(--substrate-font-body)" : undefined,
        }}
        title={label}
      >
        {label}
      </span>
      <span
        aria-hidden="true"
        style={{
          flex: 1,
          height: 8,
          borderRadius: 999,
          background: "var(--substrate-surface-2, var(--substrate-surface))",
          position: "relative",
        }}
      >
        <span
          style={{
            position: "absolute",
            inset: 0,
            width: `${pct}%`,
            background: "var(--substrate-accent)",
            borderRadius: 999,
            opacity: 0.85,
          }}
        />
      </span>
      <strong style={{ flex: "0 0 auto", minWidth: 44, textAlign: "right", fontSize: "0.9rem" }}>
        {fmt(value)}
      </strong>
    </div>
  );
}

export function AnalyticsDashboard({ apiBase = "" }: AnalyticsDashboardProps) {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal: AbortSignal, d: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/api/analytics/summary?days=${d}`, { signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as Summary;
        setData(json);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Couldn't load analytics.");
      } finally {
        setLoading(false);
      }
    },
    [apiBase],
  );

  useEffect(() => {
    const c = new AbortController();
    void load(c.signal, days);
    return () => c.abort();
  }, [load, days]);

  const t = data?.totals;
  const hasData = !!t && t.events > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          Product usage from the last {days} days, recorded first-party in this app&rsquo;s own
          database.
        </p>
        <div role="group" aria-label="Time window" style={{ display: "inline-flex", gap: 4 }}>
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setDays(w)}
              aria-pressed={days === w}
              className={days === w ? "btn" : "btn secondary"}
              style={{ fontSize: "0.82rem", padding: "0.3rem 0.7rem" }}
            >
              {w}d
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          style={{
            border: "1px solid color-mix(in srgb, var(--substrate-danger) 40%, var(--substrate-border))",
            background: "color-mix(in srgb, var(--substrate-danger) 8%, var(--substrate-bg))",
            color: "var(--substrate-danger)",
            borderRadius: "var(--substrate-radius)",
            padding: "0.75rem 1rem",
          }}
        >
          {error}
        </div>
      ) : loading && !data ? (
        <p className="muted">Loading analytics…</p>
      ) : !hasData ? (
        <div className="empty">
          <p style={{ marginTop: 0, fontWeight: 600 }}>No usage recorded yet in this window.</p>
          <p className="muted" style={{ margin: 0 }}>
            Page views and product events appear here as people use the app. Try a longer window,
            or check back once the app has live traffic.
          </p>
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: "1rem",
            }}
          >
            <KpiCard label="Total events" value={fmt(t!.events)} hint={`over ${days} days`} />
            <KpiCard label="Page views" value={fmt(t!.page_views)} />
            <KpiCard label="Unique pages" value={fmt(t!.unique_paths)} hint="distinct paths viewed" />
            <KpiCard
              label={t!.active_users > 0 ? "Signed-in users" : "Active days"}
              value={fmt(t!.active_users > 0 ? t!.active_users : t!.active_days)}
              hint={t!.active_users > 0 ? "distinct users seen" : "days with activity"}
            />
          </div>

          <section className="surface" style={{ margin: 0 }}>
            <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Daily activity</h2>
            <TrendChart series={data!.series} />
          </section>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1.25rem",
            }}
          >
            <section className="surface" style={{ margin: 0 }}>
              <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Top pages</h2>
              {data!.top_pages.length > 0 ? (
                <div>
                  {data!.top_pages.map((p) => (
                    <BarRow
                      key={p.path}
                      label={p.path}
                      value={p.views}
                      max={data!.top_pages[0].views}
                      href
                    />
                  ))}
                </div>
              ) : (
                <p className="muted" style={{ margin: 0 }}>No page views recorded in this window.</p>
              )}
            </section>

            <section className="surface" style={{ margin: 0 }}>
              <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Events by type</h2>
              <div>
                {data!.by_event.map((e) => (
                  <BarRow key={e.name} label={e.name} value={e.count} max={data!.by_event[0].count} />
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
