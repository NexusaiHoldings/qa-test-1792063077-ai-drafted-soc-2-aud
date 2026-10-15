/**
 * GET /api/admin/billing/subscriptions — admin list of every subscription
 * (admin-billing-001). Admin-gated via requireAdmin(); calls the billing lego's
 * handleListSubscriptions, which reads the company's own billing_* tables.
 * Read-only; no Stripe call. Optional ?status= / ?tier= / ?limit= / ?offset=.
 */
import { NextResponse } from "next/server";
import { handleListSubscriptions } from "@nexus/billing-and-subscriptions";
import { requireAdmin, adminCtx } from "@/lib/admin-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const g = await requireAdmin();
  if (!g.admin) return g.response;

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit"));
  const offsetRaw = Number(url.searchParams.get("offset"));

  const result = await handleListSubscriptions({
    query: {
      status: url.searchParams.get("status") || undefined,
      tier: url.searchParams.get("tier") || undefined,
      limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined,
      offset: Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : undefined,
    },
    ctx: adminCtx(),
  });

  const init: ResponseInit = { status: result.status };
  return typeof result.body === "string"
    ? new NextResponse(result.body, init)
    : NextResponse.json(result.body, init);
}
