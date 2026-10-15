/**
 * Dunning state machine — called by webhook on payment failure/success.
 *
 * Ported 2026-05-12 from api/dunning.py.
 *
 * State graph:
 *   healthy → at_risk (1st failure)
 *           → past_due (2nd failure)
 *           → final_warning (3rd failure)
 *           → cancelled (4th failure or 14 days)
 *
 * Each transition emits billing.dunning_state_changed + queues an email
 * template via Notifications lego (when wired).
 *
 * Public surface (not HTTP — called by webhook handler):
 *   recordPaymentFailure(ctx, subscription_id) → new state
 *   recordPaymentSuccess(ctx, subscription_id) → state_changed bool
 *   listAtRiskSubscriptions(ctx, limit) → array of audit rows
 */

import { err, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";

interface TransitionKey {
  state: string;
  count: number;
}

const TRANSITIONS: Array<{ from: TransitionKey; to: string }> = [
  { from: { state: "healthy", count: 1 }, to: "at_risk" },
  { from: { state: "at_risk", count: 2 }, to: "past_due" },
  { from: { state: "past_due", count: 3 }, to: "final_warning" },
  { from: { state: "final_warning", count: 4 }, to: "cancelled" },
];

function nextState(current: string, count: number): string {
  const t = TRANSITIONS.find(
    (x) => x.from.state === current && x.from.count === count,
  );
  if (t) return t.to;
  if (count >= 4) return "cancelled";
  return current;
}

const EMAIL_TEMPLATES: Record<string, string> = {
  at_risk: "billing_payment_failed_first",
  past_due: "billing_payment_failed_retry",
  final_warning: "billing_payment_final_warning",
  cancelled: "billing_subscription_cancelled_dunning",
};

function nextActionDelayMs(state: string): number {
  if (state === "at_risk") return 2 * 86400_000;
  if (state === "past_due") return 3 * 86400_000;
  if (state === "final_warning") return 7 * 86400_000;
  return 0;
}

export async function recordPaymentFailure(
  ctx: HandlerContext,
  subscriptionId: string,
): Promise<string> {
  const rows = await ctx.db.query<{
    state: string;
    failed_payment_count: number;
  }>(
    "SELECT state, failed_payment_count FROM billing_dunning_state WHERE subscription_id = $1::uuid",
    subscriptionId,
  );

  const currentState = rows.length > 0 ? rows[0].state : "healthy";
  const newCount =
    rows.length > 0 ? (rows[0].failed_payment_count || 0) + 1 : 1;
  const newState = nextState(currentState, newCount);

  const nextActionAt = new Date(Date.now() + nextActionDelayMs(newState));
  const template = EMAIL_TEMPLATES[newState] ?? null;

  if (rows.length > 0) {
    await ctx.db.execute(
      "UPDATE billing_dunning_state SET " +
        "state = $1, failed_payment_count = $2, last_failed_at = NOW(), " +
        "next_action_at = $3, last_email_template = $4, last_email_sent_at = NOW(), " +
        "updated_at = NOW(), resolved_at = NULL WHERE subscription_id = $5::uuid",
      newState,
      newCount,
      nextActionAt.toISOString(),
      template,
      subscriptionId,
    );
  } else {
    await ctx.db.execute(
      "INSERT INTO billing_dunning_state " +
        "(subscription_id, state, failed_payment_count, first_failed_at, last_failed_at, " +
        "next_action_at, last_email_template, last_email_sent_at) " +
        "VALUES ($1::uuid, $2, $3, NOW(), NOW(), $4, $5, NOW())",
      subscriptionId,
      newState,
      newCount,
      nextActionAt.toISOString(),
      template,
    );
  }

  await ctx.events.publish("billing.dunning_state_changed", {
    subscription_id: subscriptionId,
    from_state: currentState,
    to_state: newState,
    failed_payment_count: newCount,
    next_action_at: nextActionAt.toISOString(),
    email_template: template,
  });

  return newState;
}

export async function recordPaymentSuccess(
  ctx: HandlerContext,
  subscriptionId: string,
): Promise<boolean> {
  const rows = await ctx.db.query<{ state: string }>(
    "SELECT state FROM billing_dunning_state WHERE subscription_id = $1::uuid",
    subscriptionId,
  );
  if (rows.length === 0 || rows[0].state === "healthy") return false;

  await ctx.db.execute(
    "UPDATE billing_dunning_state SET " +
      "state = 'healthy', failed_payment_count = 0, resolved_at = NOW(), " +
      "updated_at = NOW(), next_action_at = NULL WHERE subscription_id = $1::uuid",
    subscriptionId,
  );
  await ctx.events.publish("billing.dunning_resolved", {
    subscription_id: subscriptionId,
    from_state: rows[0].state,
  });
  return true;
}

interface AtRiskRow {
  subscription_id: string;
  state: string;
  failed_payment_count: number;
  first_failed_at: string | null;
  last_failed_at: string | null;
  next_action_at: string | null;
  tier_name: string;
  stripe_subscription_id: string;
  user_id: string;
  email: string;
}

// HTTP-shaped wrapper for admin audit endpoint
export interface ListAtRiskInput {
  readonly ctx: HandlerContext;
  readonly limit?: number;
}

export async function handleListAtRisk({
  ctx,
  limit = 100,
}: ListAtRiskInput): Promise<HandlerResult> {
  try {
    const rows = await ctx.db.query<AtRiskRow>(
      "SELECT d.subscription_id, d.state, d.failed_payment_count, " +
        "d.first_failed_at, d.last_failed_at, d.next_action_at, " +
        "s.tier_name, s.stripe_subscription_id, c.user_id, c.email " +
        "FROM billing_dunning_state d " +
        "JOIN billing_subscriptions s ON s.id = d.subscription_id " +
        "JOIN billing_customers c ON c.id = s.customer_id " +
        "WHERE d.state IN ('at_risk', 'past_due', 'final_warning') " +
        "ORDER BY d.next_action_at NULLS LAST, d.last_failed_at DESC " +
        "LIMIT $1",
      limit,
    );
    return ok({ at_risk: rows });
  } catch {
    return err(500, "internal error");
  }
}
