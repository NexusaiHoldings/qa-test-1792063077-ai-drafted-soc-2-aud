/**
 * Font registry — the ONLY fonts a ThemeContract may name.
 *
 * company-theme-authoring-001 (2026-06-09). validateTheme rejects any
 * type.fontHeading / type.fontBody that isn't a key here. `system-*` need no
 * loader; `google` fonts are loaded via a single <link> built in app/layout.tsx
 * from the active theme's two fonts (see fontHref).
 *
 * Note (deviation from the contract's "next/font" mention): next/font/google
 * requires STATIC imports and can't dynamically select a family from build-time
 * theme data without importing every font. A Google Fonts <link> built from the
 * resolved theme loads only the two chosen families and stays fully theme-driven.
 */

export interface FontEntry {
  /** CSS font-family stack applied to --substrate-font-* */
  stack: string;
  /** "none" = system (no network); "google" = load via Google Fonts <link> */
  loader: "none" | "google";
  /** Google Fonts family query (e.g. "Inter:wght@400;500;700"); null for system */
  googleFamily: string | null;
  tone: string;
}

export const FONT_REGISTRY: Record<string, FontEntry> = {
  "system-sans": {
    stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    loader: "none", googleFamily: null, tone: "neutral default",
  },
  "system-mono": {
    stack: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
    loader: "none", googleFamily: null, tone: "code, precise",
  },
  "inter": {
    stack: "'Inter', sans-serif",
    loader: "google", googleFamily: "Inter:wght@400;500;700", tone: "clean, modern, technical",
  },
  "nunito": {
    stack: "'Nunito', sans-serif",
    loader: "google", googleFamily: "Nunito:wght@400;600;800", tone: "friendly, rounded",
  },
  "source-serif": {
    stack: "'Source Serif 4', Georgia, serif",
    loader: "google", googleFamily: "Source+Serif+4:wght@400;600;700", tone: "authoritative, editorial",
  },
  "playfair": {
    stack: "'Playfair Display', Georgia, serif",
    loader: "google", googleFamily: "Playfair+Display:wght@500;700", tone: "elegant, luxury",
  },
  "space-grotesk": {
    stack: "'Space Grotesk', sans-serif",
    loader: "google", googleFamily: "Space+Grotesk:wght@400;500;700", tone: "bold, creative, display",
  },
};

export type FontKey = keyof typeof FONT_REGISTRY;

export function isFontKey(k: string): boolean {
  return Object.prototype.hasOwnProperty.call(FONT_REGISTRY, k);
}

export function fontStack(k: string): string {
  return FONT_REGISTRY[k]?.stack ?? FONT_REGISTRY["system-sans"].stack;
}

/**
 * Build a single Google Fonts stylesheet URL for the (heading, body) pair,
 * skipping system fonts and de-duplicating. Returns null when both are system.
 */
export function fontHref(fontHeading: string, fontBody: string): string | null {
  const families = new Set<string>();
  for (const k of [fontHeading, fontBody]) {
    const fam = FONT_REGISTRY[k]?.googleFamily;
    if (fam) families.add(fam);
  }
  if (families.size === 0) return null;
  const q = Array.from(families).map((f) => `family=${f}`).join("&");
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}
