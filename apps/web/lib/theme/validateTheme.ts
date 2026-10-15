/**
 * validateTheme — the gate every ThemeContract must pass.
 *
 * company-theme-authoring-001 (2026-06-09). Canonical (TS) implementation; a
 * Python mirror runs as the signal-first gate in csuite-design-engine (kept in
 * lockstep by a drift fixture test). Checks: exact key set (no missing/extra),
 * fonts ∈ registry, radius ∈ [0,16], and WCAG contrast ≥ 4.5 for BOTH
 * text-on-bg AND accentText-on-accent.
 */
import {
  type ThemeContract,
  THEME_COLOR_KEYS,
  THEME_TYPE_KEYS,
  RADIUS_MIN,
  RADIUS_MAX,
  MIN_CONTRAST,
} from "./contract";
import { isFontKey } from "./registry";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function srgbToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

/** Relative luminance per WCAG 2.x. Returns NaN on an unparseable hex. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((hex || "").trim());
  if (!m) return NaN;
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** WCAG contrast ratio (1–21). Returns 0 if either color is unparseable. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  if (Number.isNaN(la) || Number.isNaN(lb)) return 0;
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export function validateTheme(theme: unknown): ValidationResult {
  const errors: string[] = [];
  const t = theme as Partial<ThemeContract> | null;

  if (!t || typeof t !== "object") {
    return { valid: false, errors: ["theme is not an object"] };
  }
  const color = (t.color ?? {}) as Record<string, unknown>;
  const type = (t.type ?? {}) as Record<string, unknown>;
  const shape = (t.shape ?? {}) as Record<string, unknown>;

  // ── color: exact keys, all hex strings ──
  for (const k of THEME_COLOR_KEYS) {
    if (!(k in color)) errors.push(`color.${k} missing`);
    else if (typeof color[k] !== "string" || !/^#?[0-9a-fA-F]{6}$/.test(color[k] as string)) {
      errors.push(`color.${k} not a 6-digit hex: ${String(color[k])}`);
    }
  }
  for (const k of Object.keys(color)) {
    if (!(THEME_COLOR_KEYS as readonly string[]).includes(k)) errors.push(`color.${k} is not a canonical key`);
  }

  // ── type: exact keys, registry fonts ──
  for (const k of THEME_TYPE_KEYS) {
    if (!(k in type)) errors.push(`type.${k} missing`);
    else if (typeof type[k] !== "string" || !isFontKey(type[k] as string)) {
      errors.push(`type.${k} not in font registry: ${String(type[k])}`);
    }
  }
  for (const k of Object.keys(type)) {
    if (!(THEME_TYPE_KEYS as readonly string[]).includes(k)) errors.push(`type.${k} is not a canonical key`);
  }

  // ── shape.radius ──
  if (typeof shape.radius !== "number" || Number.isNaN(shape.radius)) {
    errors.push("shape.radius missing or not a number");
  } else if (shape.radius < RADIUS_MIN || shape.radius > RADIUS_MAX) {
    errors.push(`shape.radius ${shape.radius} out of range [${RADIUS_MIN},${RADIUS_MAX}]`);
  }
  for (const k of Object.keys(shape)) {
    if (k !== "radius") errors.push(`shape.${k} is not a canonical key`);
  }

  // ── contrast (only if the relevant colors parsed) ──
  if (typeof color.text === "string" && typeof color.bg === "string") {
    const c = contrastRatio(color.text as string, color.bg as string);
    if (c < MIN_CONTRAST) errors.push(`contrast(text,bg)=${c.toFixed(2)} < ${MIN_CONTRAST}`);
  }
  if (typeof color.accentText === "string" && typeof color.accent === "string") {
    const c = contrastRatio(color.accentText as string, color.accent as string);
    if (c < MIN_CONTRAST) errors.push(`contrast(accentText,accent)=${c.toFixed(2)} < ${MIN_CONTRAST}`);
  }

  return { valid: errors.length === 0, errors };
}
