/**
 * active-theme — the resolved ThemeContract this company wears.
 * Written by provisioning (_step_substrate_install): an approved mood
 * board's derived theme wins, else the CMO's authored ThemeContract
 * (company-theme-authoring-001 / visual phase 3b). Do NOT hand-edit.
 */
import type { ThemeContract } from "./contract";

export const activeTheme: ThemeContract = {
  "type": {
    "fontBody": "inter",
    "fontHeading": "inter"
  },
  "color": {
    "bg": "#ffffff",
    "text": "#0f1b2d",
    "accent": "#1d4ed8",
    "border": "#d7deea",
    "danger": "#b42318",
    "success": "#16794a",
    "surface": "#f5f7fb",
    "textMuted": "#51607a",
    "accentText": "#ffffff",
    "surfaceAlt": "#e9eef7",
    "borderStrong": "#b5c0d3"
  },
  "shape": {
    "radius": 6
  }
};
