"use client";

/**
 * ThreadList — sidebar showing the company's threads.
 *
 * Phase 2c (sprint portfolio-runtime-phase-2-wiring-001, 2026-05-23).
 */

import type { JSX } from "react";
import type { Thread } from "@nexus-substrate/runtime-client";

export function ThreadList({
  threads,
  activeId,
  onSelect,
  onNew,
}: {
  readonly threads: readonly Thread[];
  readonly activeId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onNew: () => Promise<void> | void;
}): JSX.Element {
  return (
    <aside
      style={{
        width: 240,
        minWidth: 200,
        borderRight: "1px solid rgba(0,0,0,0.08)",
        padding: "1rem 0.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      <button
        type="button"
        onClick={() => void onNew()}
        style={{
          padding: "0.5rem 0.75rem",
          borderRadius: 6,
          border: "1px solid rgba(0,0,0,0.15)",
          background: "transparent",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        + New thread
      </button>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {threads.length === 0 ? (
          <div style={{ padding: "0.5rem", fontSize: 12, opacity: 0.55 }}>
            No conversations yet.
          </div>
        ) : (
          threads.map((t) => {
            const isActive = t.id === activeId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelect(t.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "0.5rem 0.75rem",
                  margin: "0.25rem 0",
                  borderRadius: 6,
                  border: "none",
                  background: isActive ? "rgba(59,130,246,0.12)" : "transparent",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: isActive ? 600 : 400 }}>
                  {t.title || "Untitled thread"}
                </div>
                <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>
                  {t.status}
                  {t.last_message_at
                    ? " · " + new Date(t.last_message_at).toLocaleString()
                    : ""}
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
