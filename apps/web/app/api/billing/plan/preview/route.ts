/**
 * POST /api/billing/plan/preview — proration preview for a plan change.
 * Substrate shim for @nexus/billing-and-subscriptions (substrate-lego-wiring-001).
 */
import { NextResponse } from "next/server";
import { handlePreviewPlanChange, type BillingConfig } from "@nexus/billing-and-subscriptions";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";
import { getLegoConfig } from "@/lib/lego-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  const body = await request.json().catch(() => ({}));
  const result = await handlePreviewPlanChange({
    userId: user?.id ?? null,
    body,
    config: getLegoConfig("billing-and-subscriptions") as unknown as BillingConfig & { enable_proration?: boolean },
    ctx: { db: buildDb(), events: buildEventBus() },
  });
  const init: ResponseInit = { status: result.status };
  if (result.headers) init.headers = result.headers;
  return typeof result.body === "string"
    ? new NextResponse(result.body, init)
    : NextResponse.json(result.body, init);
}
