"use client";
/* Usage widget — shows current period usage by meter. */
import React, { useEffect, useState } from "react";

interface MeterRow {
  meter_name: string;
  total_quantity: number;
  event_count: number;
  last_event_at: string | null;
}

interface UsageSummary {
  tier_name: string;
  period_start: string | null;
  period_end: string | null;
  meters: MeterRow[];
}

export function UsageWidget() {
  const [summary, setSummary] = useState<UsageSummary | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/billing/usage/summary")
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json();
      })
      .then((d) => { if (!cancelled) setSummary(d); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);

  if (summary === undefined) return <div className="usage-widget loading">Loading usage...</div>;
  if (error) return <div className="usage-widget error">Failed to load usage: {error}</div>;
  if (!summary || summary.meters.length === 0) {
    return <div className="usage-widget empty">No usage recorded this period.</div>;
  }

  return (
    <div className="usage-widget">
      <h4>
        Current Period — {summary.tier_name}
        {summary.period_end && (
          <span className="period-end">resets {new Date(summary.period_end).toLocaleDateString()}</span>
        )}
      </h4>
      <table>
        <thead>
          <tr>
            <th>Meter</th>
            <th>Total</th>
            <th>Events</th>
            <th>Last Event</th>
          </tr>
        </thead>
        <tbody>
          {summary.meters.map((m) => (
            <tr key={m.meter_name}>
              <td>{m.meter_name}</td>
              <td>{m.total_quantity.toLocaleString()}</td>
              <td>{m.event_count.toLocaleString()}</td>
              <td>{m.last_event_at ? new Date(m.last_event_at).toLocaleString() : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
