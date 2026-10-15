/**
 * Usage metering — record + summarize.
 *
 * Ported 2026-05-12 from api/usage.py.
 *   POST /api/billing/usage/event   — record idempotent usage event
 *   GET  /api/billing/usage/summary — current-period usage by meter
 *
 * Stripe reporter (background job) runs separately; this endpoint just
 * persists locally and emits a NATS event. reported_to_stripe_at stays
 * NULL until the reporter runs.
 */

import { randomUUID } from "node:crypto";
import { err, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";

async function resolveSubscriptionId(
  ctx: HandlerContext,
  userId: string,
): Promise<string | null> {
  const rows = await ctx.db.query<{ id: string }>(
    "SELECT s.id FROM billing_subscriptions s " +
      "JOIN billing_customers c ON c.id = s.customer_id " +
      "WHERE c.user_id = $1::uuid AND s.status IN ('trialing', 'active') " +
      "ORDER BY s.created_at DESC LIMIT 1",
    userId,
  );
  return rows.length > 0 ? rows[0].id : null;
}

export interface RecordUsageInput {
  readonly userId: string | null;
  readonly body: {
    meter_name?: string;
    quantity?: number;
    idempotency_key?: string;
    metadata?: Record<string, unknown>;
  };
  readonly ctx: HandlerContext;
}

export async function handleRecordUsage({
  userId,
  body,
  ctx,
}: RecordUsageInput): Promise<HandlerResult> {
  if (!userId) return err(401, "authentication required");

  const meterName = (body.meter_name || "").trim();
  const quantityRaw = body.quantity;
  if (!meterName) return err(400, "meter_name required");
  if (quantityRaw === undefined || quantityRaw === null) {
    return err(400, "quantity required");
  }
  const qtyNum = Number(quantityRaw);
  if (!Number.isFinite(qtyNum)) return err(400, "quantity must be numeric");
  if (qtyNum < 0) return err(400, "quantity must be >= 0");

  const subId = await resolveSubscriptionId(ctx, userId);
  if (!subId) return err(404, "no active subscription");

  const eventId = randomUUID();
  let inserted = false;
  try {
    const rows = await ctx.db.query<{ id: string }>(
      "INSERT INTO billing_usage_events " +
        "(id, subscription_id, meter_name, quantity, idempotency_key, metadata) " +
        "VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb) " +
        "ON CONFLICT (subscription_id, meter_name, idempotency_key) DO NOTHING " +
        "RETURNING id",
      eventId,
      subId,
      meterName,
      qtyNum,
      body.idempotency_key || null,
      JSON.stringify(body.metadata || {}),
    );
    inserted = rows.length > 0;
  } catch {
    return err(500, "internal error");
  }

  await ctx.events.publish("billing.usage_event_recorded", {
    user_id: userId,
    subscription_id: subId,
    meter_name: meterName,
    quantity: qtyNum,
    idempotent_skip: !inserted,
  });

  return ok({
    event_id: inserted ? eventId : null,
    meter_name: meterName,
    quantity: qtyNum,
    idempotent_skip: !inserted,
  });
}

export interface UsageSummaryInput {
  readonly userId: string | null;
  readonly ctx: HandlerContext;
}

interface SubPeriodRow {
  sub_id: string;
  current_period_start: string;
  current_period_end: string;
  tier_name: string;
}

interface MeterRow {
  meter_name: string;
  total_quantity: number;
  last_event_at: string | null;
  event_count: number;
}

export async function handleGetUsageSummary({
  userId,
  ctx,
}: UsageSummaryInput): Promise<HandlerResult> {
  if (!userId) return err(401, "authentication required");

  const subRows = await ctx.db.query<SubPeriodRow>(
    "SELECT s.id AS sub_id, s.current_period_start, s.current_period_end, s.tier_name " +
      "FROM billing_subscriptions s JOIN billing_customers c ON c.id = s.customer_id " +
      "WHERE c.user_id = $1::uuid AND s.status IN ('trialing', 'active') " +
      "ORDER BY s.created_at DESC LIMIT 1",
    userId,
  );
  if (subRows.length === 0) return err(404, "no active subscription");

  const sub = subRows[0];
  const meterRows = await ctx.db.query<MeterRow>(
    "SELECT meter_name, COALESCE(SUM(quantity), 0)::float AS total_quantity, " +
      "MAX(occurred_at) AS last_event_at, COUNT(*)::int AS event_count " +
      "FROM billing_usage_events " +
      "WHERE subscription_id = $1::uuid " +
      "AND occurred_at >= $2::timestamptz AND occurred_at < $3::timestamptz " +
      "GROUP BY meter_name ORDER BY meter_name",
    sub.sub_id,
    sub.current_period_start,
    sub.current_period_end,
  );

  return ok({
    tier_name: sub.tier_name,
    period_start: sub.current_period_start,
    period_end: sub.current_period_end,
    meters: meterRows.map((r) => ({
      meter_name: r.meter_name,
      total_quantity: r.total_quantity,
      event_count: r.event_count,
      last_event_at: r.last_event_at,
    })),
  });
}
