/**
 * GET /api/cron/approved-actions — the app-pull half of the cross-boundary
 * mutation bridge (cross-boundary-mutation-bridge-001).
 *
 * The runtime can't reach this company's DB and has no internet egress, so
 * when it approves a confirm-gated tool whose mutation lives HERE (e.g.
 * support-and-help's escalate_to_human), it queues the action in the runtime's
 * runtime_approved_actions ledger. This Vercel Cron route polls the ledger,
 * dispatches each action to the matching lego's local handler (against THIS
 * app's DB), and reports the result back. Same call direction as everything
 * else (app → runtime), reusing the runtime_auth_token bearer.
 *
 * Schedule: every minute (vercel.json crons). Auth: when CRON_SECRET is set,
 * Vercel sends `Authorization: Bearer <CRON_SECRET>`; we validate it. When
 * unset (local/dev), the route runs unguarded — it only executes actions the
 * runtime has ALREADY approved.
 */

import { NextResponse } from "next/server";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import {
  getRuntimeRequestOpts,
  fetchApprovedActions,
  completeApprovedAction,
} from "@/lib/runtime";
import type { HandlerContext, HandlerResult } from "@nexus/identity-and-access";

// Lego mutation handlers (the server-side effect behind each confirm-gated
// agent tool). Only the real legos that ship a confirm-gated mutation are
// imported. Stub legos export nothing callable.
import { handleEscalateTicket } from "@nexus/support-and-help";
import { handleAdvanceStage } from "@nexus/crm-and-lifecycle";
import { handleRequestExport } from "@nexus/profile-and-account";
import { handleChangeRole } from "@nexus/organizations-and-teams";
import { handleProvisionSampleData } from "@nexus/onboarding";
import { handleQuarantineFile } from "@nexus/files-and-media";
import { handleRevokeKey } from "@nexus/developer-surface";
import { handleHideComment } from "@nexus/social-and-engagement";

// Per-company domain agent tools — handlers for CTO-declared new_domain_tools
// (csuite-agent-capability-composition-001 Phase B). Substrate ships an EMPTY
// DOMAIN_DISPATCH; the build agent populates it when the sprint planner emits
// a build task for a new_domain_tool. We merge with LEGO_DISPATCH below.
import { DOMAIN_DISPATCH } from "@/lib/agent-tools/_dispatch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // pg + raw SQL — not edge-compatible
export const maxDuration = 60;

type Args = Record<string, unknown>;

/**
 * Lego dispatch map: agent-tool name → function translating the approved
 * action's `args` into the matching lego handler call. Each lego handler uses
 * its own positional signature (ctx, pathParam?, body); this map adapts the
 * flat `args` from the agent tool to that shape.
 *
 * Merged with the per-company DOMAIN_DISPATCH below — see ALL_DISPATCH.
 */
const LEGO_DISPATCH: Record<string, (ctx: HandlerContext, args: Args) => Promise<HandlerResult>> = {
  escalate_to_human: (ctx, a) =>
    handleEscalateTicket(ctx, String(a.ticket_id ?? ""), {
      reason: a.reason as string | undefined,
      priority_override: a.priority_override as string | undefined,
    }),
  advance_contact_stage: (ctx, a) =>
    handleAdvanceStage(ctx, String(a.contact_id ?? ""), {
      to_stage: a.to_stage as string | undefined,
      reason: a.reason as string | undefined,
    }),
  request_account_export: (ctx, a) =>
    handleRequestExport(ctx, {
      user_id: a.user_id as string | undefined,
      format: a.format as string | undefined,
    }),
  change_member_role: (ctx, a) =>
    handleChangeRole(ctx, String(a.org_id ?? ""), String(a.user_id ?? ""), {
      new_role: a.new_role as string | undefined,
      reason: a.reason as string | undefined,
    }),
  provision_sample_data: (ctx, a) =>
    handleProvisionSampleData(ctx, {
      user_id: a.user_id as string | undefined,
      dataset: a.dataset as string | undefined,
    }),
  quarantine_file: (ctx, a) =>
    handleQuarantineFile(ctx, String(a.file_id ?? ""), {
      reason: a.reason as string | undefined,
    }),
  revoke_api_key: (ctx, a) =>
    handleRevokeKey(ctx, String(a.api_key_id ?? ""), {
      reason: a.reason as string | undefined,
    }),
  hide_comment: (ctx, a) =>
    handleHideComment(ctx, String(a.comment_id ?? ""), {
      reason: a.reason as string | undefined,
    }),
};

// Combined dispatch: lego handlers + per-company domain handlers. Domain
// entries (populated by the build agent for each CTO-declared new_domain_tool)
// take precedence on name collisions, though in practice CTO-declared tool
// names are company-specific and don't collide with lego names.
const DISPATCH: Record<string, (ctx: HandlerContext, args: Args) => Promise<HandlerResult>> = {
  ...LEGO_DISPATCH,
  ...DOMAIN_DISPATCH,
};

function _cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // unguarded in dev; prod sets CRON_SECRET
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!_cronAuthorized(request)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let opts;
  try {
    opts = getRuntimeRequestOpts();
  } catch (e) {
    // Runtime env not configured (e.g. before provisioning Phase 2d) — no-op.
    return NextResponse.json({ skipped: true, reason: String((e as Error).message) });
  }

  let actions;
  try {
    actions = await fetchApprovedActions(opts, 25);
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 502 });
  }

  const ctx: HandlerContext = { db: buildDb(), events: buildEventBus() };
  const results: Array<{ id: string; tool: string; outcome: string }> = [];

  for (const action of actions) {
    const fn = DISPATCH[action.tool_name];
    if (!fn) {
      await completeApprovedAction(opts, action.id, {
        status: "failed",
        error: `unknown_tool: ${action.tool_name}`,
      }).catch(() => {});
      results.push({ id: action.id, tool: action.tool_name, outcome: "unknown_tool" });
      continue;
    }
    try {
      const r = await fn(ctx, action.args ?? {});
      if (r.status >= 400) {
        await completeApprovedAction(opts, action.id, {
          status: "failed",
          error: typeof r.body === "string" ? r.body : JSON.stringify(r.body),
        });
        results.push({ id: action.id, tool: action.tool_name, outcome: "failed" });
      } else {
        await completeApprovedAction(opts, action.id, {
          status: "completed",
          result: typeof r.body === "string" ? { message: r.body } : (r.body as Record<string, unknown>),
        });
        results.push({ id: action.id, tool: action.tool_name, outcome: "completed" });
      }
    } catch (e) {
      await completeApprovedAction(opts, action.id, {
        status: "failed",
        error: String((e as Error).message).slice(0, 500),
      }).catch(() => {});
      results.push({ id: action.id, tool: action.tool_name, outcome: "error" });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
