/**
 * Substrate UI primitives — design tokens, accessibility primitives, shared
 * component vocabulary. Spec §7 (Layer 4 invariants — a11y, theming, etc.).
 *
 * Lives as a workspace package so legos and the main app share one design
 * system. Per-company theming overrides happen via CSS variables / theme
 * provider in apps/web/app/layout.tsx — not by editing this package.
 */

export const DESIGN_TOKENS = {
  spacing: { sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 4, md: 8, lg: 12 },
  fontSize: { sm: 14, md: 16, lg: 18, xl: 24 },
} as const;

export const A11Y = {
  minTouchTarget: 44,
  minContrastRatio: 4.5,
} as const;
