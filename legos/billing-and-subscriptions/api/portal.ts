/**
 * Stripe Billing Portal session creation.
 *
 * Ported 2026-05-12 from api/portal.py.
 * POST /api/billing/portal — returns a Stripe-hosted portal URL for the user.
 */

import { err, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";
import { stripePost } from "./_lib/stripe";

export interface PortalInput {
  readonly userId: string | null;
  readonly body: { return_url?: string };
  readonly ctx: HandlerContext;
}

export async function handlePortal({
  userId,
  body,
  ctx,
}: PortalInput): Promise<HandlerResult> {
  if (!userId) return err(401, "authentication required");
  const returnUrl = body.return_url || "";
  if (!returnUrl) return err(400, "return_url required");

  const secretKey = process.env.STRIPE_SECRET_KEY || "";
  if (!secretKey) return err(503, "stripe not configured");

  const customerRows = await ctx.db.query<{ stripe_customer_id: string }>(
    "SELECT stripe_customer_id FROM billing_customers WHERE user_id = $1::uuid",
    userId,
  );
  if (customerRows.length === 0) return err(404, "no billing customer for user");

  const resp = await stripePost(
    "billing_portal/sessions",
    {
      customer: customerRows[0].stripe_customer_id,
      return_url: returnUrl,
    },
    secretKey,
  );
  if (resp.status >= 400) return err(502, "failed to create portal session");
  const url = resp.body.url as string | undefined;
  if (!url) return err(502, "invalid stripe response");

  await ctx.events.publish("billing.portal_session_created", {
    user_id: userId,
    stripe_customer_id: customerRows[0].stripe_customer_id,
  });
  return ok({ url });
}
