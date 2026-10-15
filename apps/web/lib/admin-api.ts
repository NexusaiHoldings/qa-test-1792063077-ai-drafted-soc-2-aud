/**
 * Shared helpers for /api/admin/* route shims (substrate-admin-surface-001).
 *
 * Every admin API shim: (1) authorizes by SESSION USER via getAdminUser()
 * (the real gate — 403 if not an allow-listed admin), then (2) calls the lego
 * handler, passing the internal token as BOTH adminTokenHeader and adminToken
 * so the lego's checkAdminAuth passes server-side. The browser never sends or
 * sees the real admin token.
 */

import { NextResponse } from "next/server";
import { getAdminUser, adminToken, type AdminUser } from "@/lib/admin-auth";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";

export interface HandlerResultLike {
  status: number;
  body: string | Record<string, unknown>;
  headers?: Record<string, string>;
}

/** Request-scoped lego HandlerContext. */
export function adminCtx() {
  return { db: buildDb(), events: buildEventBus() };
}

/** Internal token passed as both header + expected (satisfies checkAdminAuth). */
export function tok(): string {
  return adminToken();
}

/** Resolve the admin user or return a 403 response. */
export async function requireAdmin(): Promise<
  { admin: AdminUser } | { admin: null; response: NextResponse }
> {
  const admin = await getAdminUser();
  if (!admin) {
    return { admin: null, response: new NextResponse("forbidden", { status: 403 }) };
  }
  return { admin };
}

/** Translate a lego HandlerResult into a NextResponse. */
export function translate(result: HandlerResultLike): NextResponse {
  const init: ResponseInit = { status: result.status };
  if (result.headers) init.headers = result.headers;
  // 204/304 must have a null body — constructing one with "" throws.
  if (result.status === 204 || result.status === 304) {
    return new NextResponse(null, init);
  }
  if (typeof result.body === "string") {
    return new NextResponse(result.body, init);
  }
  return NextResponse.json(result.body, init);
}
