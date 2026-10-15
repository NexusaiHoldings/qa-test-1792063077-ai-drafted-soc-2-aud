/**
 * GitHub App webhook (F1-002, apps/web/app/api/webhooks/github/route.ts).
 *
 * External fixed-path callback (URL-determinism exception) that GitHub calls for
 * the Nexus SOC 2 GitHub App. We verify the HMAC-SHA256 signature against the
 * raw body (GITHUB_WEBHOOK_SECRET) and act on `installation` lifecycle events to
 * flip the matching soc2_connections row between Healthy / Failing. `ping` is
 * acknowledged so GitHub's test delivery succeeds.
 *
 * We deliberately read NO repository contents here — only installation metadata.
 */

import { NextResponse } from "next/server";
import {
  handleInstallationWebhook,
  parseInstallationEvent,
  verifyWebhookSignature,
} from "@/lib/soc2/connectors/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  // Read the RAW body first — signature verification must run over the exact
  // bytes GitHub signed, before any JSON parsing.
  const rawBody = await req.text();
  const signature =
    req.headers.get("x-hub-signature-256") || req.headers.get("X-Hub-Signature-256");
  const event = req.headers.get("x-github-event") || "unknown";
  const delivery = req.headers.get("x-github-delivery") || "";

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.error(
      JSON.stringify({ level: "warn", scope: "webhook.github", msg: "signature_invalid", event, delivery }),
    );
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // GitHub's initial test delivery.
  if (event === "ping") {
    return NextResponse.json({ ok: true, pong: true }, { status: 200 });
  }

  if (event === "installation" || event === "installation_repositories") {
    try {
      const parsed = parseInstallationEvent(payload);
      const result = await handleInstallationWebhook(parsed);
      console.log(
        JSON.stringify({
          level: "info",
          scope: "webhook.github",
          msg: "installation_processed",
          event,
          action: parsed.action,
          installation_id: parsed.installationId,
          matched: result.matched,
          delivery,
        }),
      );
      return NextResponse.json({ ok: true, matched: result.matched }, { status: 200 });
    } catch (err) {
      console.error(
        JSON.stringify({ level: "error", scope: "webhook.github", msg: "installation_failed", error: String(err), delivery }),
      );
      return NextResponse.json({ error: "processing failed" }, { status: 500 });
    }
  }

  // Any other event is accepted (so GitHub doesn't retry) but not acted on.
  console.log(
    JSON.stringify({ level: "info", scope: "webhook.github", msg: "event_ignored", event, delivery }),
  );
  return NextResponse.json({ ok: true, ignored: event }, { status: 200 });
}
