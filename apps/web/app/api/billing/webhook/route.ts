/**
 * POST /api/billing/webhook — Stripe webhook receiver.
 * Substrate shim for @nexus/billing-and-subscriptions (substrate-lego-wiring-001).
 *
 * CRITICAL: the handler verifies the Stripe signature over the RAW request
 * body — read it with request.text() and pass it unparsed. Do NOT JSON.parse
 * here. No session (Stripe is the caller; auth is the signature).
 */
import { NextResponse } from "next/server";
import { handleWebhook } from "@nexus/billing-and-subscriptions";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();
  const result = await handleWebhook({
    rawBody,
    stripeSignatureHeader: request.headers.get("stripe-signature"),
    ctx: { db: buildDb(), events: buildEventBus() },
  });
  const init: ResponseInit = { status: result.status };
  if (result.headers) init.headers = result.headers;
  return typeof result.body === "string"
    ? new NextResponse(result.body, init)
    : NextResponse.json(result.body, init);
}
