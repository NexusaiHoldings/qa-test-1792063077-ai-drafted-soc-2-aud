/**
 * Per-company DOMAIN_DISPATCH — handlers for agent tools no lego provides.
 * csuite-agent-capability-composition-001 Phase B.
 *
 * The substrate's approved-actions cron route imports DOMAIN_DISPATCH and
 * merges it with the lego LEGO_DISPATCH map. Entries here override entries
 * with the same name in LEGO_DISPATCH (but in practice the CTO-declared
 * new_domain_tools have company-specific names that don't collide).
 *
 * The build agent populates this file when the sprint planner emits a build
 * task for a CTO-declared new_domain_tool (analysis-class or mutation-class):
 *
 *   1. The agent writes the handler under `apps/web/lib/agent-tools/<name>.ts`,
 *      exporting an async function with the lego-handler signature:
 *      `(ctx: HandlerContext, args: Record<string, unknown>) => Promise<HandlerResult>`
 *
 *   2. The agent imports + registers the handler in this map:
 *      `import { handleScoreClinicalUrgency } from "./score_clinical_urgency";`
 *      `score_clinical_urgency: (ctx, a) => handleScoreClinicalUrgency(ctx, a),`
 *
 * Substrate ships this file with an EMPTY map; companies whose CTO declared no
 * new_domain_tools keep it empty. The cron route handles an empty map
 * gracefully (falls through to the lego DISPATCH or returns `unknown_tool`).
 */

import type { HandlerContext, HandlerResult } from "@nexus/identity-and-access";

type Args = Record<string, unknown>;

export const DOMAIN_DISPATCH: Record<
  string,
  (ctx: HandlerContext, args: Args) => Promise<HandlerResult>
> = {
  // Build agent appends entries here per CTO-declared new_domain_tool.
};
