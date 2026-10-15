/**
 * CookieBanner — bottom-fixed banner shown when no current consent exists.
 * Three buttons: Accept All, Reject All, Customize.
 * Customize opens a panel with category toggles (v1: simple JSON object).
 * Persists via POST /api/legal/cookies/consent.
 */
"use client";
import React, { useState, useEffect } from "react";

interface CookieBannerProps {
  anonymousId?: string;
  onConsented?: (decision: string) => void;
}

const DEFAULT_CATEGORIES = {
  essential: true,
  analytics: false,
  marketing: false,
};

export function CookieBanner({ anonymousId, onConsented }: CookieBannerProps) {
  const [visible, setVisible] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Check if consent already on file
    fetch("/api/legal/cookies/consent/current", {
      headers: anonymousId ? { "X-Anonymous-Id": anonymousId } : {},
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.consent) setVisible(true);
      })
      .catch(() => setVisible(true)); // Show on error — safer than assuming consent
  }, [anonymousId]);

  const persist = async (decision: string, cats?: typeof categories) => {
    setSaving(true);
    try {
      await fetch("/api/legal/cookies/consent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(anonymousId ? { "X-Anonymous-Id": anonymousId } : {}),
        },
        body: JSON.stringify({
          decision,
          categories: cats ?? (decision === "accepted_all" ? { essential: true, analytics: true, marketing: true } : { essential: true }),
          anonymous_id: anonymousId,
        }),
      });
      setVisible(false);
      onConsented?.(decision);
    } catch {
      /* Non-blocking — user experience degrades silently */
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  // company-theme-authoring-001 / substrate-ui-baseline: the substrate has no
  // Tailwind, so this banner is styled with inline styles off the --substrate-*
  // design tokens (mirrors TopNav/Footer). 'use client' component, outside
  // <main>, so globals.css element rules don't reach it.
  const radius = "var(--substrate-radius, 8px)";
  const banner: React.CSSProperties = {
    position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
    background: "var(--substrate-bg, #fff)",
    borderTop: "1px solid var(--substrate-border, #e2e2e2)",
    boxShadow: "0 -2px 14px rgba(0,0,0,0.08)",
    fontFamily: "var(--substrate-font-body)",
  };
  const inner: React.CSSProperties = {
    maxWidth: "var(--substrate-max-width, 1080px)", margin: "0 auto", padding: "16px 24px",
  };
  const row: React.CSSProperties = {
    display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16,
  };
  const text: React.CSSProperties = {
    flex: 1, minWidth: 240, fontSize: 14, lineHeight: 1.5,
    color: "var(--substrate-muted, #555)", margin: 0,
  };
  const btnGroup: React.CSSProperties = { display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" };
  const btnBase: React.CSSProperties = {
    padding: "8px 16px", fontSize: 14, fontWeight: 550, borderRadius: radius,
    cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1,
  };
  const btnSecondary: React.CSSProperties = {
    ...btnBase,
    border: "1px solid var(--substrate-border-strong, #c9c9c9)",
    background: "var(--substrate-bg, #fff)", color: "var(--substrate-fg, #111)",
  };
  const btnPrimary: React.CSSProperties = {
    ...btnBase,
    border: "1px solid var(--substrate-accent, #2563eb)",
    background: "var(--substrate-accent, #2563eb)", color: "var(--substrate-accent-text, #fff)",
  };

  return (
    <div className="cookie-banner" style={banner}>
      <div style={inner}>
        {!showCustomize ? (
          <div style={row}>
            <p style={text}>
              We use cookies to improve your experience. Essential cookies are always active.
              You can choose whether to allow analytics and marketing cookies.
            </p>
            <div style={btnGroup}>
              <button onClick={() => setShowCustomize(true)} style={btnSecondary} disabled={saving}>
                Customize
              </button>
              <button onClick={() => persist("rejected_all")} style={btnSecondary} disabled={saving}>
                Reject All
              </button>
              <button onClick={() => persist("accepted_all")} style={btnPrimary} disabled={saving}>
                Accept All
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--substrate-fg, #111)", margin: 0 }}>
              Customize cookie preferences
            </p>
            {(Object.keys(DEFAULT_CATEGORIES) as Array<keyof typeof DEFAULT_CATEGORIES>).map((cat) => (
              <label key={cat} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--substrate-fg, #111)", textTransform: "capitalize" }}>
                <input
                  type="checkbox"
                  checked={cat === "essential" ? true : categories[cat]}
                  disabled={cat === "essential"}
                  onChange={(e) =>
                    setCategories((prev) => ({ ...prev, [cat]: e.target.checked }))
                  }
                  style={{ width: 16, height: 16 }}
                />
                <span>{cat}</span>
                {cat === "essential" && (
                  <span style={{ fontSize: 12, color: "var(--substrate-muted, #888)", textTransform: "none" }}>
                    (always active)
                  </span>
                )}
              </label>
            ))}
            <div style={{ display: "flex", gap: 8, paddingTop: 4, flexWrap: "wrap" }}>
              <button onClick={() => setShowCustomize(false)} style={btnSecondary} disabled={saving}>
                Back
              </button>
              <button onClick={() => persist("custom", categories)} style={btnPrimary} disabled={saving}>
                Save preferences
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
