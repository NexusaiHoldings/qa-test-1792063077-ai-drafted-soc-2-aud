/**
 * Stripe Checkout session creation.
 *
 * Ported 2026-05-12 from api/checkout.py.
 * POST /api/billing/checkout — creates a Stripe Checkout session for a tier.
 */

import { randomUUID } from "node:crypto";
import { err, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";
import { stripePost } from "./_lib/stripe";

export interface BillingTier {
  readonly name: string;
  readonly price_id: string;
  readonly amount?: number;
}

export interface BillingConfig {
  readonly tier_ladder?: BillingTier[];
  readonly trial_days?: number;
  readonly default_currency?: string;
}

function findTier(config: BillingConfig, name: string): BillingTier | undefined {
  return (config.tier_ladder || []).find((t) => t.name === name);
}

async function ensureCustomer(
  ctx: HandlerContext,
  userId: string,
  email: string,
  secretKey: string,
): Promise<{ customerId: string; stripeCustomerId: string } | null> {
  const existing = await ctx.db.query<{
    id: string;
    stripe_customer_id: string;
  }>(
    "SELECT id, stripe_customer_id FROM billing_customers WHERE user_id = $1::uuid",
    userId,
  );
  if (existing.length > 0) {
    return {
      customerId: existing[0].id,
      stripeCustomerId: existing[0].stripe_customer_id,
    };
  }

  const resp = await stripePost(
    "customers",
    { email, metadata: { user_id: userId } },
    secretKey,
  );
  if (resp.status >= 400) return null;
  const stripeCustomerId = resp.body.id as string | undefined;
  if (!stripeCustomerId) return null;

  const customerId = randomUUID();
  await ctx.db.execute(
    "INSERT INTO billing_customers (id, user_id, stripe_customer_id, email) " +
      "VALUES ($1::uuid, $2::uuid, $3, $4) ON CONFLICT (user_id) DO NOTHING",
    customerId,
    userId,
    stripeCustomerId,
    email,
  );
  return { customerId, stripeCustomerId };
}

export interface CheckoutInput {
  readonly userId: string | null;
  readonly body: {
    tier_name?: string;
    success_url?: string;
    cancel_url?: string;
    user_email?: string;
  };
  readonly config: BillingConfig;
  readonly ctx: HandlerContext;
}

export async function handleCheckout({
  userId,
  body,
  config,
  ctx,
}: CheckoutInput): Promise<HandlerResult> {
  if (!userId) return err(401, "authentication required");

  const tierName = body.tier_name || "";
  const successUrl = body.success_url || "";
  const cancelUrl = body.cancel_url || "";
  const userEmail = body.user_email || "";

  if (!tierName || !successUrl || !cancelUrl) {
    return err(400, "tier_name, success_url, cancel_url required");
  }
  if (!userEmail) return err(400, "user_email required");

  const tier = findTier(config, tierName);
  if (!tier) return err(404, `unknown tier: ${tierName}`);

  const secretKey = process.env.STRIPE_SECRET_KEY || "";
  if (!secretKey) return err(503, "stripe not configured");

  const customer = await ensureCustomer(ctx, userId, userEmail, secretKey);
  if (!customer) return err(502, "failed to create stripe customer");

  const trialDays = config.trial_days || 0;
  const formData: Record<string, unknown> = {
    mode: "subscription",
    customer: customer.stripeCustomerId,
    line_items: [{ price: tier.price_id, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { user_id: userId, tier_name: tierName },
  };
  if (trialDays > 0) {
    formData.subscription_data = { trial_period_days: trialDays };
  }

  const resp = await stripePost("checkout/sessions", formData, secretKey);
  if (resp.status >= 400) {
    return err(502, "failed to create checkout session");
  }
  const sessionIdStripe = resp.body.id as string | undefined;
  const sessionUrl = resp.body.url as string | undefined;
  if (!sessionIdStripe || !sessionUrl) {
    return err(502, "invalid stripe response");
  }

  try {
    await ctx.db.execute(
      "INSERT INTO billing_checkout_sessions " +
        "(id, user_id, stripe_session_id, stripe_price_id, tier_name, amount_cents, currency, success_url, cancel_url) " +
        "VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9)",
      randomUUID(),
      userId,
      sessionIdStripe,
      tier.price_id,
      tierName,
      tier.amount ?? 0,
      config.default_currency || "usd",
      successUrl,
      cancelUrl,
    );
  } catch {
    // Stripe session is created; persist failure is non-fatal.
  }

  await ctx.events.publish("billing.checkout_session_created", {
    user_id: userId,
    tier_name: tierName,
    stripe_session_id: sessionIdStripe,
  });

  return ok({
    session_id: sessionIdStripe,
    url: sessionUrl,
    tier_name: tierName,
  });
}
