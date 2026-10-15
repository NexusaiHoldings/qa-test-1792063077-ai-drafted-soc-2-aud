/**
 * Stripe webhook entrypoint.
 *
 * Ported 2026-05-12 from api/webhook.py. CRITICAL: signature verification
 * uses HMAC-SHA256 with timing-safe compare. Stripe signature scheme:
 *   header format: t=<unix_timestamp>,v1=<sig>,v0=<deprecated>
 *   signed payload: "<timestamp>.<raw_body>"
 *   compute HMAC-SHA256(payload, STRIPE_WEBHOOK_SECRET) and compare to v1
 * Reject if timestamp > tolerance (default 300s).
 *
 * Events handled: checkout.session.completed, customer.subscription.{created,
 * updated,deleted}, invoice.payment_{succeeded,failed}.
 */

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { err, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";

const TOLERANCE_SECONDS = 300;

export function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string,
): boolean {
  if (!sigHeader || !secret) return false;
  const parts: Record<string, string> = {};
  for (const chunk of sigHeader.split(",")) {
    const eq = chunk.indexOf("=");
    if (eq > 0) {
      parts[chunk.slice(0, eq).trim()] = chunk.slice(eq + 1).trim();
    }
  }
  const timestamp = parts.t;
  const sigV1 = parts.v1;
  if (!timestamp || !sigV1) return false;

  const tsInt = parseInt(timestamp, 10);
  if (!Number.isFinite(tsInt)) return false;
  if (Math.abs(Date.now() / 1000 - tsInt) > TOLERANCE_SECONDS) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const expected = createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const sigBuf = Buffer.from(sigV1, "hex");
  if (expectedBuf.length !== sigBuf.length) return false;
  return timingSafeEqual(expectedBuf, sigBuf);
}

async function persistEvent(
  ctx: HandlerContext,
  stripeEventId: string,
  eventType: string,
  payload: unknown,
): Promise<boolean> {
  try {
    const rows = await ctx.db.query<{ id: string }>(
      "INSERT INTO billing_webhook_events (id, stripe_event_id, event_type, payload) " +
        "VALUES ($1::uuid, $2, $3, $4::jsonb) " +
        "ON CONFLICT (stripe_event_id) DO NOTHING RETURNING id",
      randomUUID(),
      stripeEventId,
      eventType,
      JSON.stringify(payload),
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function markProcessed(
  ctx: HandlerContext,
  stripeEventId: string,
  error: string | null,
): Promise<void> {
  try {
    await ctx.db.execute(
      "UPDATE billing_webhook_events SET processed_at = NOW(), processing_error = $2 " +
        "WHERE stripe_event_id = $1",
      stripeEventId,
      error,
    );
  } catch {
    // Best-effort.
  }
}

async function handleCheckoutCompleted(
  ctx: HandlerContext,
  event: Record<string, unknown>,
): Promise<void> {
  const obj = ((event.data as Record<string, unknown>)?.object as Record<string, unknown>) || {};
  const stripeSessionId = obj.id as string | undefined;
  if (!stripeSessionId) return;
  await ctx.db.execute(
    "UPDATE billing_checkout_sessions SET status = 'complete', completed_at = NOW() WHERE stripe_session_id = $1",
    stripeSessionId,
  );
  const metadata = (obj.metadata as Record<string, unknown>) || {};
  await ctx.events.publish("billing.checkout_session_completed", {
    stripe_session_id: stripeSessionId,
    user_id: metadata.user_id,
    tier_name: metadata.tier_name,
  });
}

async function upsertSubscription(
  ctx: HandlerContext,
  subObj: Record<string, unknown>,
): Promise<string | null> {
  const stripeSubId = subObj.id as string | undefined;
  const stripeCustomerId = subObj.customer as string | undefined;
  if (!stripeSubId || !stripeCustomerId) return null;

  const customerRows = await ctx.db.query<{ id: string }>(
    "SELECT id FROM billing_customers WHERE stripe_customer_id = $1",
    stripeCustomerId,
  );
  if (customerRows.length === 0) return null;
  const customerId = customerRows[0].id;

  const items = ((subObj.items as Record<string, unknown>)?.data as Array<Record<string, unknown>>) || [];
  if (items.length === 0) return null;
  const price = (items[0].price as Record<string, unknown>) || {};
  const stripePriceId = (price.id as string) || "";
  const metadata = (subObj.metadata as Record<string, unknown>) || {};
  const tierName = (metadata.tier_name as string) || (price.nickname as string) || "unknown";

  const status = (subObj.status as string) || "incomplete";
  const cancelAtPeriodEnd = subObj.cancel_at_period_end === true;
  const currentPeriodStart = (subObj.current_period_start as number) || 0;
  const currentPeriodEnd = (subObj.current_period_end as number) || 0;
  const trialEnd = subObj.trial_end as number | null;
  const cancelledAt = subObj.canceled_at as number | null;

  const subUuid = randomUUID();
  await ctx.db.execute(
    "INSERT INTO billing_subscriptions " +
      "(id, customer_id, stripe_subscription_id, stripe_price_id, tier_name, status, " +
      " current_period_start, current_period_end, cancel_at_period_end, cancelled_at, trial_end, metadata) " +
      "VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, " +
      "        to_timestamp($7), to_timestamp($8), $9, " +
      "        CASE WHEN $10::bigint IS NULL THEN NULL ELSE to_timestamp($10) END, " +
      "        CASE WHEN $11::bigint IS NULL THEN NULL ELSE to_timestamp($11) END, $12::jsonb) " +
      "ON CONFLICT (stripe_subscription_id) DO UPDATE SET " +
      "  status = EXCLUDED.status, " +
      "  cancel_at_period_end = EXCLUDED.cancel_at_period_end, " +
      "  current_period_start = EXCLUDED.current_period_start, " +
      "  current_period_end = EXCLUDED.current_period_end, " +
      "  cancelled_at = EXCLUDED.cancelled_at, " +
      "  trial_end = EXCLUDED.trial_end, " +
      "  metadata = EXCLUDED.metadata, " +
      "  updated_at = NOW()",
    subUuid,
    customerId,
    stripeSubId,
    stripePriceId,
    tierName,
    status,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    cancelledAt,
    trialEnd,
    JSON.stringify(metadata),
  );
  return subUuid;
}

export interface WebhookInput {
  readonly rawBody: string;
  readonly stripeSignatureHeader: string | null;
  readonly ctx: HandlerContext;
}

export async function handleWebhook({
  rawBody,
  stripeSignatureHeader,
  ctx,
}: WebhookInput): Promise<HandlerResult> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET || "";
  if (!verifyStripeSignature(rawBody, stripeSignatureHeader || "", secret)) {
    return err(400, "signature verification failed");
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return err(400, "invalid JSON");
  }

  const stripeEventId = (event.id as string) || "";
  const eventType = (event.type as string) || "";
  if (!stripeEventId || !eventType) return err(400, "missing event id/type");

  const inserted = await persistEvent(ctx, stripeEventId, eventType, event);
  if (!inserted) {
    await ctx.events.publish("billing.webhook_received", {
      stripe_event_id: stripeEventId,
      event_type: eventType,
      duplicate: true,
    });
    return { status: 200, body: "duplicate" };
  }

  let errorMsg: string | null = null;
  try {
    const subObj = ((event.data as Record<string, unknown>)?.object as Record<string, unknown>) || {};
    if (eventType === "checkout.session.completed") {
      await handleCheckoutCompleted(ctx, event);
    } else if (eventType === "customer.subscription.created") {
      const sid = await upsertSubscription(ctx, subObj);
      if (sid) {
        await ctx.events.publish("billing.subscription_created", {
          stripe_subscription_id: subObj.id,
        });
      }
    } else if (eventType === "customer.subscription.updated") {
      const sid = await upsertSubscription(ctx, subObj);
      if (sid) {
        await ctx.events.publish("billing.subscription_updated", {
          stripe_subscription_id: subObj.id,
        });
      }
    } else if (eventType === "customer.subscription.deleted") {
      const sid = await upsertSubscription(ctx, subObj);
      if (sid) {
        await ctx.events.publish("billing.subscription_cancelled", {
          stripe_subscription_id: subObj.id,
        });
      }
    } else if (eventType === "invoice.payment_succeeded") {
      await ctx.events.publish("billing.payment_succeeded", {
        stripe_invoice_id: subObj.id,
        amount_paid_cents: subObj.amount_paid,
      });
    } else if (eventType === "invoice.payment_failed") {
      await ctx.events.publish("billing.payment_failed", {
        stripe_invoice_id: subObj.id,
        attempt_count: subObj.attempt_count,
      });
    }
  } catch (e) {
    errorMsg = String(e);
  }

  await markProcessed(ctx, stripeEventId, errorMsg);
  await ctx.events.publish("billing.webhook_received", {
    stripe_event_id: stripeEventId,
    event_type: eventType,
    processed: errorMsg === null,
  });
  return { status: 200, body: "ok" };
}
