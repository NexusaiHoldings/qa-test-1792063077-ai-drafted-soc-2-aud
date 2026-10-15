/**
 * getLegoConfig — resolve a lego's runtime config (substrate-lego-wiring-001).
 *
 * Layer 1 (install defaults from manifest config_schema) + Layer 2
 * (provision-derived values, e.g. billing tier_ladder) are both baked into
 * the generated `legos.config.ts` at install time. Layer 3 (admin runtime
 * override via admin-console `system_config`) is a fast-follow — when added,
 * merge it over the result here. Secrets always come from process.env, never
 * this file.
 */
import { LEGOS } from "@/lib/legos.config";

export function getLegoConfig(legoName: string): Record<string, unknown> {
  const lego = LEGOS.find((l) => l.name === legoName);
  return (lego?.config as Record<string, unknown>) ?? {};
}
