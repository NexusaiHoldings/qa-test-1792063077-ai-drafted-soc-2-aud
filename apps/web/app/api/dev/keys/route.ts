/**
 * /api/dev/keys — list (GET) / create (POST) the session user's API keys.
 * Substrate shim for @nexus/developer-surface (substrate-lego-wiring-001 Phase 3).
 *
 * The lego stores only a prefix + SHA-256 hash (it never sees the plaintext).
 * The SHIM generates the secret, hashes it, persists prefix+hash, and returns
 * the plaintext secret EXACTLY ONCE in the create response — it is never
 * retrievable again.
 */
import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { handleListKeys, handleCreateKey } from "@nexus/developer-surface";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";
import { respond } from "@/lib/lego-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await handleListKeys(
    { db: buildDb(), events: buildEventBus() },
    user.id,
  );
  return respond(result);
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const name = (body.name ?? "").toString().trim() || "API key";

  const secret = `sk_${randomBytes(24).toString("hex")}`;
  const prefix = secret.slice(0, 11);
  const key_hash = createHash("sha256").update(secret).digest("hex");

  const result = await handleCreateKey(
    { db: buildDb(), events: buildEventBus() },
    { user_id: user.id, name, key_hash, prefix },
  );

  // On success, return the plaintext secret once (never stored, never re-shown).
  if (result.status >= 200 && result.status < 300 && typeof result.body === "object") {
    return NextResponse.json({ ...result.body, secret }, { status: result.status });
  }
  return respond(result);
}
