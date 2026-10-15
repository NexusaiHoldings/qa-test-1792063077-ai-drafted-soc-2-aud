/**
 * ThemeContract — the canonical cosmetic design-token set a company wears.
 *
 * company-theme-authoring-001 (2026-06-09). Authored pre-build by the CMO agent,
 * validated, persisted to Postgres, and injected into the substrate's CSS-variable
 * layer at provisioning (see ./active-theme.ts + app/layout.tsx).
 *
 * Cosmetic ONLY — colors, fonts, corner radius. Layout/spacing/max-width/control
 * sizing stay substrate-owned ("generous whitespace baked into the substrate").
 * Every token maps 1:1 to a `--substrate-*` CSS variable in app/globals.css.
 *
 * Font keys are validated against ./registry.ts at runtime (typed as string here
 * to keep this module dependency-free / non-circular).
 */

export interface ThemeColor {
  bg: string;            // page background        → --substrate-bg
  surface: string;       // cards, table headers    → --substrate-surface
  surfaceAlt: string;    // code, subtle fills       → --substrate-surface-2
  text: string;          // primary text             → --substrate-fg
  textMuted: string;     // descriptions, footer     → --substrate-muted
  border: string;        // tables, dividers         → --substrate-border
  borderStrong: string;  // inputs, dashed states    → --substrate-border-strong
  accent: string;        // brand action + links + focus ring → --substrate-accent
  accentText: string;    // legible text ON accent    → --substrate-accent-text
  danger: string;        // errors, destructive       → --substrate-danger
  success: string;       // confirmations, valid       → --substrate-success
}

export interface ThemeType {
  fontHeading: string;   // MUST be a registry key → --substrate-font-heading
  fontBody: string;      // MUST be a registry key → --substrate-font-body
}

export interface ThemeShape {
  radius: number;        // px, 0–16 → --substrate-radius
}

export interface ThemeContract {
  color: ThemeColor;
  type: ThemeType;
  shape: ThemeShape;
}

/** Canonical key lists — validateTheme enforces "exactly these, no more, no less". */
export const THEME_COLOR_KEYS: readonly (keyof ThemeColor)[] = [
  "bg", "surface", "surfaceAlt", "text", "textMuted",
  "border", "borderStrong", "accent", "accentText", "danger", "success",
] as const;

export const THEME_TYPE_KEYS: readonly (keyof ThemeType)[] = [
  "fontHeading", "fontBody",
] as const;

export const RADIUS_MIN = 0;
export const RADIUS_MAX = 16;

/** WCAG AA minimum for normal text (mirrors packages/ui A11Y.minContrast). */
export const MIN_CONTRAST = 4.5;
