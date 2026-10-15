/**
 * POST /api/billing/checkout — create a Stripe Checkout session for a tier.
 * Substrate shim for @nexus/billing-and-subscriptions (substrate-lego-wiring-001).
 */
import { NextResponse } from "next/server";
import { handleCheckout, type BillingConfig } from "@nexus/billing-and-subscriptions";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";
import { getLegoConfig } from "@/lib/lego-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  const body = await request.json().catch(() => ({}));
  // Stripe REQUIRES absolute success/cancel URLs; the CheckoutForm passes
  // site-relative paths ("/billing?status=success") which Stripe 400s —
  // every live checkout 502'd on this (billing-flow-qa-001, 2026-07-08).
  // Absolutize against the request's own origin (the company domain).
  const origin = new URL(request.url).origin;
  const abs = (u: unknown): unknown =>
    typeof u === "string" && u.startsWith("/") ? `${origin}${u}` : u;
  body.success_url = abs(body.success_url);
  body.cancel_url = abs(body.cancel_url);
  const result = await handleCheckout({
    userId: user?.id ?? null,
    body,
    config: getLegoConfig("billing-and-subscriptions") as unknown as BillingConfig,
    ctx: { db: buildDb(), events: buildEventBus() },
  });
  const init: ResponseInit = { status: result.status };
  if (result.headers) init.headers = result.headers;
  return typeof result.body === "string"
    ? new NextResponse(result.body, init)
    : NextResponse.json(result.body, init);
}
