/**
 * Health check endpoint — used by Vercel + uptime monitors.
 * Returns 200 with company identity + substrate version.
 *
 * Runtime note: this route uses the `edge` runtime so `maxDuration` does
 * not apply (edge has its own 25s ceiling). For serverless routes (the
 * default), add `export const maxDuration = N` per file when you need
 * more than the 10s default. See substrate README §Conventions.
 */

import { NextResponse } from "next/server";

export const runtime = "edge";

export function GET(): NextResponse {
  return NextResponse.json({
    status: "ok",
    company: process.env.COMPANY_NAME || "unknown",
    slug: process.env.COMPANY_SLUG || "unknown",
    substrate_version: "0.1.0",
    timestamp: new Date().toISOString(),
  });
}
