/**
 * Subscription read + cancel/resume.
 *
 * Ported 2026-05-12 from api/subscriptions.py.
 * Webhook is canonical source of truth; this just reads state and forwards
 * cancel/resume to Stripe. Local state updates happen on webhook receipt.
 */

import { err, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";
import { stripePost } from "./_lib/stripe";

interface SubRow {
  id: string;
  stripe_subscription_id: string;
  tier_name: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_end: string | null;
}

function serialize(row: SubRow): Record<string, unknown> {
  return {
    id: row.id,
    stripe_subscription_id: row.stripe_subscription_id,
    tier_name: row.tier_name,
    status: row.status,
    current_period_start: row.current_period_start,
    current_period_end: row.current_period_end,
    cancel_at_period_end: row.cancel_at_period_end,
    trial_end: row.trial_end,
  };
}

export interface SubInput {
  readonly userId: string | null;
  readonly ctx: HandlerContext;
}

export async function handleGetSubscription({
  userId,
  ctx,
}: SubInput): Promise<HandlerResult> {
  if (!userId) return err(401, "authentication required");
  try {
    const rows = await ctx.db.query<SubRow>(
      "SELECT s.id, s.stripe_subscription_id, s.tier_name, s.status, " +
        "s.current_period_start, s.current_period_end, s.cancel_at_period_end, s.trial_end " +
        "FROM billing_subscriptions s JOIN billing_customers c ON c.id = s.customer_id " +
        "WHERE c.user_id = $1::uuid AND s.status IN ('trialing', 'active', 'past_due') " +
        "ORDER BY s.created_at DESC LIMIT 1",
      userId,
    );
    if (rows.length === 0) return ok({ subscription: null });
    return ok({ subscription: serialize(rows[0]) });
  } catch {
    return err(500, "internal error");
  }
}

export async function handleCancelSubscription({
  userId,
  ctx,
}: SubInput): Promise<HandlerResult> {
  if (!userId) return err(401, "authentication required");
  const secretKey = process.env.STRIPE_SECRET_KEY || "";
  if (!secretKey) return err(503, "stripe not configured");

  const rows = await ctx.db.query<{
    id: string;
    stripe_subscription_id: string;
    tier_name: string;
  }>(
    "SELECT s.id, s.stripe_subscription_id, s.tier_name FROM billing_subscriptions s " +
      "JOIN billing_customers c ON c.id = s.customer_id " +
      "WHERE c.user_id = $1::uuid AND s.status IN ('trialing', 'active') LIMIT 1",
    userId,
  );
  if (rows.length === 0) return err(404, "no active subscription found");
  const sub = rows[0];

  const resp = await stripePost(
    `subscriptions/${sub.stripe_subscription_id}`,
    { cancel_at_period_end: "true" },
    secretKey,
  );
  if (resp.status >= 400) {
    return err(502, "failed to schedule cancellation with stripe");
  }

  await ctx.db.execute(
    "UPDATE billing_subscriptions SET cancel_at_period_end = TRUE, updated_at = NOW() WHERE id = $1::uuid",
    sub.id,
  );

  await ctx.events.publish("billing.subscription_cancelled", {
    user_id: userId,
    stripe_subscription_id: sub.stripe_subscription_id,
    tier_name: sub.tier_name,
    cancellation_type: "scheduled",
  });

  return ok({
    status: "cancellation_scheduled",
    stripe_subscription_id: sub.stripe_subscription_id,
  });
}

// ── handler: list all subscriptions (admin) ────────────────────────────────

interface AdminSubRow {
  id: string;
  stripe_subscription_id: string;
  tier_name: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_end: string | null;
  created_at: string;
  user_id: string;
  email: string;
  stripe_customer_id: string;
}

export interface ListSubscriptionsInput {
  readonly query: { status?: string; tier?: string; limit?: number; offset?: number };
  readonly ctx: HandlerContext;
}

/**
 * Admin: list every subscription across all customers, with the customer's
 * email and tier. Optional status / tier filters, paginated. Returns counts by
 * status and active-tier so the admin page can show a portfolio-level summary.
 * Read-only — no Stripe call (webhook is the source of truth for local state).
 */
export async function handleListSubscriptions({
  query,
  ctx,
}: ListSubscriptionsInput): Promise<HandlerResult> {
  const limit = Math.min(Math.max(Number(query.limit) || 200, 1), 1000);
  const offset = Math.max(Number(query.offset) || 0, 0);

  // Build the WHERE clause from value-bound filters (never identifiers).
  const where: string[] = [];
  const params: unknown[] = [];
  if (query.status) {
    params.push(query.status);
    where.push(`s.status = $${params.length}`);
  }
  if (query.tier) {
    params.push(query.tier);
    where.push(`s.tier_name = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  try {
    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const rows = await ctx.db.query<AdminSubRow>(
      "SELECT s.id, s.stripe_subscription_id, s.tier_name, s.status, " +
        "s.current_period_start, s.current_period_end, s.cancel_at_period_end, " +
        "s.trial_end, s.created_at, c.user_id, c.email, c.stripe_customer_id " +
        "FROM billing_subscriptions s " +
        "JOIN billing_customers c ON c.id = s.customer_id " +
        `${whereSql} ORDER BY s.created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      ...params,
    );

    const byStatus = await ctx.db.query<{ status: string; n: string }>(
      "SELECT status, COUNT(*)::text AS n FROM billing_subscriptions GROUP BY status",
    );
    const byTier = await ctx.db.query<{ tier_name: string; n: string }>(
      "SELECT tier_name, COUNT(*)::text AS n FROM billing_subscriptions " +
        "WHERE status IN ('trialing', 'active', 'past_due') GROUP BY tier_name",
    );

    const totalRow = await ctx.db.query<{ n: string }>(
      "SELECT COUNT(*)::text AS n FROM billing_subscriptions",
    );

    return ok({
      subscriptions: rows,
      total: Number(totalRow[0]?.n || 0),
      by_status: Object.fromEntries(byStatus.map((r) => [r.status, Number(r.n)])),
      by_active_tier: Object.fromEntries(byTier.map((r) => [r.tier_name, Number(r.n)])),
      limit,
      offset,
    });
  } catch {
    return err(500, "internal error");
  }
}

export async function handleResumeSubscription({
  userId,
  ctx,
}: SubInput): Promise<HandlerResult> {
  if (!userId) return err(401, "authentication required");
  const secretKey = process.env.STRIPE_SECRET_KEY || "";
  if (!secretKey) return err(503, "stripe not configured");

  const rows = await ctx.db.query<{
    id: string;
    stripe_subscription_id: string;
    cancel_at_period_end: boolean;
  }>(
    "SELECT s.id, s.stripe_subscription_id, s.cancel_at_period_end FROM billing_subscriptions s " +
      "JOIN billing_customers c ON c.id = s.customer_id " +
      "WHERE c.user_id = $1::uuid AND s.status IN ('trialing', 'active') LIMIT 1",
    userId,
  );
  if (rows.length === 0) return err(404, "no active subscription");
  if (!rows[0].cancel_at_period_end) {
    return err(400, "subscription is not pending cancellation");
  }

  const resp = await stripePost(
    `subscriptions/${rows[0].stripe_subscription_id}`,
    { cancel_at_period_end: "false" },
    secretKey,
  );
  if (resp.status >= 400) return err(502, "failed to resume with stripe");

  await ctx.db.execute(
    "UPDATE billing_subscriptions SET cancel_at_period_end = FALSE, updated_at = NOW() WHERE id = $1::uuid",
    rows[0].id,
  );
  await ctx.events.publish("billing.subscription_updated", {
    user_id: userId,
    stripe_subscription_id: rows[0].stripe_subscription_id,
    change: "resumed",
  });
  return ok({
    status: "resumed",
    stripe_subscription_id: rows[0].stripe_subscription_id,
  });
}
