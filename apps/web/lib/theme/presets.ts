/**
 * Preset theme catalog — curated, AA-validated ThemeContracts.
 *
 * company-theme-authoring-001 (2026-06-09). The CMO agent matches a company to
 * one of these first (source="preset", preset_key); it authors a custom theme
 * only when positioning diverges from every preset. All presets pass
 * validateTheme (text/bg and accentText/accent contrast ≥ 4.5).
 *
 * `creative` is a DARK brand — it declares its own dark color.bg; it does NOT
 * rely on OS dark mode (themes are authoritative).
 */
import type { ThemeContract } from "./contract";

export const PRESETS: Record<string, ThemeContract> = {
  generic: {
    color: {
      bg: "#ffffff", surface: "#fafafa", surfaceAlt: "#f4f4f4",
      text: "#111111", textMuted: "#555555",
      border: "#e2e2e2", borderStrong: "#c9c9c9",
      accent: "#2563eb", accentText: "#ffffff",
      danger: "#c0341d", success: "#15803d",
    },
    type: { fontHeading: "system-sans", fontBody: "system-sans" },
    shape: { radius: 8 },
  },
  law: {
    color: {
      bg: "#ffffff", surface: "#f6f7f9", surfaceAlt: "#eef1f5",
      text: "#1a2332", textMuted: "#566074",
      border: "#dde2ea", borderStrong: "#c2cad6",
      accent: "#1e3a5f", accentText: "#ffffff",
      danger: "#a32d2d", success: "#1f6b45",
    },
    type: { fontHeading: "source-serif", fontBody: "system-sans" },
    shape: { radius: 4 },
  },
  logistics: {
    color: {
      bg: "#ffffff", surface: "#f5f7fa", surfaceAlt: "#eceff4",
      text: "#0f172a", textMuted: "#5b6573",
      border: "#dbe1e8", borderStrong: "#bfc7d2",
      accent: "#1d4ed8", accentText: "#ffffff",
      danger: "#b91c1c", success: "#15803d",
    },
    type: { fontHeading: "inter", fontBody: "inter" },
    shape: { radius: 6 },
  },
  salon: {
    color: {
      bg: "#fffaf6", surface: "#fdf1ea", surfaceAlt: "#f8e7dc",
      text: "#2b2320", textMuted: "#6e5d54",
      border: "#ecdacd", borderStrong: "#dcc1b0",
      accent: "#8a4f5a", accentText: "#ffffff",
      danger: "#b23a3a", success: "#3f7a52",
    },
    type: { fontHeading: "playfair", fontBody: "system-sans" },
    shape: { radius: 12 },
  },
  pets: {
    color: {
      bg: "#ffffff", surface: "#f1faf5", surfaceAlt: "#e3f4ea",
      text: "#152a23", textMuted: "#4f6b60",
      border: "#d3ebdd", borderStrong: "#b3d8c4",
      accent: "#0f766e", accentText: "#ffffff",
      danger: "#c0341d", success: "#15803d",
    },
    type: { fontHeading: "nunito", fontBody: "nunito" },
    shape: { radius: 14 },
  },
  creative: {
    color: {
      bg: "#141414", surface: "#1f1f1f", surfaceAlt: "#262626",
      text: "#f5f5f5", textMuted: "#a3a3a3",
      border: "#333333", borderStrong: "#474747",
      accent: "#ff5c39", accentText: "#141414",
      danger: "#ff6b5e", success: "#4ade80",
    },
    type: { fontHeading: "space-grotesk", fontBody: "inter" },
    shape: { radius: 10 },
  },
};

export type PresetKey = keyof typeof PRESETS;

export function isPresetKey(k: string): boolean {
  return Object.prototype.hasOwnProperty.call(PRESETS, k);
}
