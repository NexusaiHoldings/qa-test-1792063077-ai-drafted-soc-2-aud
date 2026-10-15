/**
 * Profile avatar + dropdown for the top nav (substrate-auth-nav-001, 2026-06-01).
 *
 * Shows a circular avatar (first letter of the email). Clicking opens a small
 * menu with the signed-in email and a Log out action that POSTs
 * /api/auth/logout (which clears the HttpOnly session cookie) then reloads.
 */

"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type JSX } from "react";

/** Self-service surfaces mounted on the substrate (substrate-lego-wiring-001). */
const ACCOUNT_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/account", label: "Account" },
  { href: "/org", label: "Organization" },
  { href: "/billing", label: "Billing" },
  { href: "/notifications", label: "Notifications" },
  { href: "/files", label: "Files" },
  { href: "/onboarding", label: "Getting started" },
  { href: "/developers", label: "Developers" },
  { href: "/help", label: "Help" },
];

export function UserMenu({ email }: { email: string }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const initial = (email.trim()[0] || "?").toUpperCase();

  async function logout(): Promise<void> {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore — clear client state regardless */
    } finally {
      window.location.href = "/";
    }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          border: "1px solid rgba(0,0,0,0.12)",
          background: "var(--substrate-accent, #2563eb)",
          color: "#fff",
          fontSize: 15,
          fontWeight: 700,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: 42,
            minWidth: 220,
            background: "#fff",
            color: "#111",
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 8,
            boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
            zIndex: 100,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid rgba(0,0,0,0.08)",
              fontSize: 13,
            }}
          >
            <div style={{ opacity: 0.55, fontSize: 11, marginBottom: 2 }}>
              Signed in as
            </div>
            <div
              style={{
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {email}
            </div>
          </div>
          <nav style={{ display: "flex", flexDirection: "column", padding: "4px 0", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
            {ACCOUNT_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                style={{
                  display: "block",
                  padding: "8px 14px",
                  color: "#111",
                  textDecoration: "none",
                  fontSize: 14,
                }}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <button
            type="button"
            role="menuitem"
            onClick={logout}
            disabled={busy}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "10px 14px",
              border: "none",
              background: "transparent",
              color: "#b91c1c",
              fontSize: 14,
              fontWeight: 600,
              cursor: busy ? "default" : "pointer",
            }}
          >
            {busy ? "Logging out…" : "Log out"}
          </button>
        </div>
      )}
    </div>
  );
}
