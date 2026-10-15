/**
 * respond — translate a lego HandlerResult into a Next.js response
 * (substrate-lego-wiring-001 Phase 2).
 *
 * Every lego handler returns the same `{ status, body, headers? }` shape
 * (see each lego's api/_lib/handler.ts). The substrate route shims call the
 * handler then hand the result here: JSON body for objects, plain text for
 * strings (errors), passing through any handler-set headers (e.g. Set-Cookie).
 */
import { NextResponse } from "next/server";

export interface LegoHandlerResult {
  readonly status: number;
  readonly body: string | Record<string, unknown>;
  readonly headers?: Record<string, string>;
}

export function respond(result: LegoHandlerResult): NextResponse {
  const init: ResponseInit = { status: result.status };
  if (result.headers) init.headers = result.headers;
  return typeof result.body === "string"
    ? new NextResponse(result.body, init)
    : NextResponse.json(result.body, init);
}
