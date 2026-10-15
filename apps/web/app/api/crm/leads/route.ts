/**
 * POST /api/crm/leads — capture a lead (PUBLIC — used by marketing lead forms).
 * Substrate shim for @nexus/crm-and-lifecycle (substrate-lego-wiring-001).
 * The agent triages + scores the lead on arrival. No auth: lead forms are public.
 */
import { NextResponse } from "next/server";
import { handleCaptureLead } from "@nexus/crm-and-lifecycle";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.json().catch(() => ({}));
  const result = await handleCaptureLead(
    { db: buildDb(), events: buildEventBus() },
    body,
  );
  return respond(result);
}
