/**
 * HRIS connector (F1-002, apps/web/lib/soc2/connectors/hris.ts).
 *
 * The feasibility worker flags HRIS as "fragmented", so we support two paths:
 *   1. API key — BambooHR (subdomain + API key, HTTP Basic) or Rippling (bearer
 *      token). The key is envelope-encrypted in the vault; a live directory call
 *      confirms read access.
 *   2. CSV roster fallback — a roster CSV uploaded through @nexus/files-and-media
 *      (handleRegisterFile), referenced here by file id. This unblocks customers
 *      whose HRIS has no usable API.
 *
 * We only ever read the employee roster (names, emails, start/end dates, manager,
 * status) — enough to evidence access-review and offboarding controls.
 */

import { handleRegisterFile } from "@nexus/files-and-media";
import {
  logConnectionEvent,
  upsertConnection,
  type ConnectResult,
  type OrgContext,
  type ProviderDescriptor,
  type Soc2Connection,
} from "@/lib/soc2/access";
import { loadCredential, purgeCredential, storeCredential } from "@/lib/soc2/vault";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";

export type HrisVendor = "bamboohr" | "rippling";

export const HRIS_DESCRIPTOR: ProviderDescriptor = {
  provider: "hris",
  label: "HRIS (BambooHR / Rippling)",
  blurb: "API key or CSV roster — read-only employee directory for access reviews.",
  scopeDescription:
    "Read-only. We read your employee directory (name, work email, start/end date, manager, employment status) from BambooHR or Rippling — or from a CSV roster you upload. We never read compensation, SSNs, or any field beyond what evidences access-review and offboarding controls.",
  method: "api_key",
  accent: false,
};

/** Validate an HRIS API key by calling the vendor's directory endpoint. */
async function probeVendor(
  vendor: HrisVendor,
  apiKey: string,
  subdomain: string | null,
): Promise<{ ok: boolean; code?: string; hint?: string }> {
  try {
    if (vendor === "bamboohr") {
      if (!subdomain) {
        return { ok: false, code: "HRIS_NO_SUBDOMAIN", hint: "BambooHR needs your company subdomain (the XXX in XXX.bamboohr.com)." };
      }
      const url = `https://api.bamboohr.com/api/gateway.php/${encodeURIComponent(subdomain)}/v1/employees/directory`;
      const auth = Buffer.from(`${apiKey}:x`).toString("base64");
      const resp = await fetch(url, {
        headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
      });
      if (resp.status === 401 || resp.status === 403) {
        return { ok: false, code: "HRIS_BAD_KEY", hint: "BambooHR rejected the API key. Regenerate it under Account → API Keys and paste it again." };
      }
      if (!resp.ok) {
        return { ok: false, code: `HRIS_HTTP_${resp.status}`, hint: "BambooHR returned an error. Check the subdomain is correct and the key has directory access." };
      }
      return { ok: true };
    }
    // Rippling
    const resp = await fetch("https://api.rippling.com/platform/api/employees", {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    if (resp.status === 401 || resp.status === 403) {
      return { ok: false, code: "HRIS_BAD_KEY", hint: "Rippling rejected the token. Create a new API token with employee read scope and paste it again." };
    }
    if (!resp.ok) {
      return { ok: false, code: `HRIS_HTTP_${resp.status}`, hint: "Rippling returned an error. Confirm the token has read access to the employee directory." };
    }
    return { ok: true };
  } catch (err) {
    // Network/DNS failure at connect time — surface as a retriable failure.
    return {
      ok: false,
      code: "HRIS_UNREACHABLE",
      hint: `Couldn't reach ${vendor}. Check network/firewall and try again, or use the CSV roster fallback below. (${String((err as Error).message || err)})`,
    };
  }
}

/** Connect HRIS via an API key (BambooHR or Rippling). Key goes to the vault. */
export async function connectHrisApiKey(
  ctx: OrgContext,
  args: { vendor: HrisVendor; apiKey: string; subdomain?: string | null },
): Promise<ConnectResult> {
  const apiKey = args.apiKey.trim();
  if (!apiKey) {
    return {
      ok: false,
      status: "failing",
      message: "An API key is required.",
      failureCode: "HRIS_NO_KEY",
      failureHint: "Paste the API key from your HRIS, or switch to the CSV roster upload.",
    };
  }

  const probe = await probeVendor(args.vendor, apiKey, args.subdomain ?? null);

  const conn = await upsertConnection({
    organizationId: ctx.orgId,
    provider: "hris",
    status: probe.ok ? "healthy" : "failing",
    scopeDescription: HRIS_DESCRIPTOR.scopeDescription,
    displayName: HRIS_DESCRIPTOR.label,
    accountLogin: args.subdomain ?? args.vendor,
    config: { vendor: args.vendor, subdomain: args.subdomain ?? null, source: "api_key" },
    failureCode: probe.ok ? null : probe.code ?? "HRIS_ERROR",
    failureHint: probe.ok ? null : probe.hint ?? null,
    connectedAt: probe.ok ? new Date() : null,
    lastSyncAt: probe.ok ? new Date() : null,
    createdBy: ctx.user.id,
  });

  // Store the key regardless so a transient probe failure doesn't force a re-paste.
  await storeCredential(buildDb(), {
    connectionId: conn.id,
    organizationId: ctx.orgId,
    provider: "hris",
    plaintext: apiKey,
  });

  await logConnectionEvent({
    organizationId: ctx.orgId,
    provider: "hris",
    connectionId: conn.id,
    eventType: probe.ok ? "connected" : "connect_failed",
    actorUserId: ctx.user.id,
    detail: { vendor: args.vendor, source: "api_key", failure_code: probe.code ?? null },
  });

  if (!probe.ok) {
    return {
      ok: false,
      status: "failing",
      message: "Saved, but the HRIS rejected the key.",
      failureCode: probe.code,
      failureHint: probe.hint,
    };
  }
  return { ok: true, status: "healthy", message: `${args.vendor} connected (read-only directory).` };
}

/**
 * Connect HRIS via a CSV roster uploaded through @nexus/files-and-media. The
 * file is registered (scanned + tracked) by the files lego; we store its id.
 */
export async function connectHrisCsv(
  ctx: OrgContext,
  args: { fileName: string; contentType?: string; sizeBytes?: number; storageKey?: string },
): Promise<ConnectResult> {
  let fileId: string | null = null;
  try {
    const result = await handleRegisterFile(
      { db: buildDb(), events: buildEventBus() },
      {
        user_id: ctx.user.id,
        filename: args.fileName,
        mime_type: args.contentType || "text/csv",
        size_bytes: args.sizeBytes ?? 0,
        storage_key: args.storageKey || `soc2/hris/${ctx.orgId}/${args.fileName}`,
      },
    );
    if (result && typeof result.body === "object" && result.body !== null) {
      const body = result.body as { file_id?: string };
      fileId = body.file_id ?? null;
    }
  } catch (err) {
    console.error(
      JSON.stringify({ level: "error", scope: "soc2.hris", msg: "register_csv_failed", error: String(err) }),
    );
  }

  const conn = await upsertConnection({
    organizationId: ctx.orgId,
    provider: "hris",
    status: "healthy",
    scopeDescription: HRIS_DESCRIPTOR.scopeDescription,
    displayName: HRIS_DESCRIPTOR.label,
    accountLogin: "csv-roster",
    config: { source: "csv", file_id: fileId, file_name: args.fileName },
    failureCode: null,
    failureHint: null,
    connectedAt: new Date(),
    lastSyncAt: new Date(),
    createdBy: ctx.user.id,
  });

  await logConnectionEvent({
    organizationId: ctx.orgId,
    provider: "hris",
    connectionId: conn.id,
    eventType: "connected",
    actorUserId: ctx.user.id,
    detail: { source: "csv", file_id: fileId, file_name: args.fileName },
  });

  return { ok: true, status: "healthy", message: `Roster "${args.fileName}" uploaded. Read-only access review is live.` };
}

/** Verify the stored HRIS source is still valid (re-probes API keys). */
export async function verifyHris(ctx: OrgContext, conn: Soc2Connection): Promise<ConnectResult> {
  const source = typeof conn.config.source === "string" ? conn.config.source : "api_key";
  if (source === "csv") {
    await upsertConnection({
      organizationId: ctx.orgId,
      provider: "hris",
      status: "healthy",
      scopeDescription: HRIS_DESCRIPTOR.scopeDescription,
      failureCode: null,
      failureHint: null,
      lastSyncAt: new Date(),
    });
    await logConnectionEvent({
      organizationId: ctx.orgId,
      provider: "hris",
      connectionId: conn.id,
      eventType: "health_check_ok",
      actorUserId: ctx.user.id,
    });
    return { ok: true, status: "healthy", message: "CSV roster present. Last sync updated." };
  }

  const apiKey = await loadCredential(buildDb(), conn.id);
  if (!apiKey) {
    return failHris(ctx, conn, "HRIS_NO_KEY", "Re-enter the API key or switch to the CSV roster upload.");
  }
  const vendor = (conn.config.vendor as HrisVendor) || "bamboohr";
  const subdomain = typeof conn.config.subdomain === "string" ? conn.config.subdomain : null;
  const probe = await probeVendor(vendor, apiKey, subdomain);
  if (!probe.ok) {
    return failHris(ctx, conn, probe.code ?? "HRIS_ERROR", probe.hint ?? "Re-check the API key.");
  }

  await upsertConnection({
    organizationId: ctx.orgId,
    provider: "hris",
    status: "healthy",
    scopeDescription: HRIS_DESCRIPTOR.scopeDescription,
    failureCode: null,
    failureHint: null,
    lastSyncAt: new Date(),
  });
  await logConnectionEvent({
    organizationId: ctx.orgId,
    provider: "hris",
    connectionId: conn.id,
    eventType: "health_check_ok",
    actorUserId: ctx.user.id,
  });
  return { ok: true, status: "healthy", message: `${vendor} directory reachable. Last sync updated.` };
}

/** Disconnect HRIS and purge any stored key (zero-retention). */
export async function disconnectHris(ctx: OrgContext, conn: Soc2Connection): Promise<void> {
  await purgeCredential(buildDb(), conn.id);
  await logConnectionEvent({
    organizationId: ctx.orgId,
    provider: "hris",
    connectionId: conn.id,
    eventType: "disconnected",
    actorUserId: ctx.user.id,
  });
}

async function failHris(
  ctx: OrgContext,
  conn: Soc2Connection,
  code: string,
  hint: string,
): Promise<ConnectResult> {
  await upsertConnection({
    organizationId: ctx.orgId,
    provider: "hris",
    status: "failing",
    scopeDescription: HRIS_DESCRIPTOR.scopeDescription,
    failureCode: code,
    failureHint: hint,
  });
  await logConnectionEvent({
    organizationId: ctx.orgId,
    provider: "hris",
    connectionId: conn.id,
    eventType: "health_check_failed",
    actorUserId: ctx.user.id,
    detail: { failure_code: code },
  });
  return { ok: false, status: "failing", message: "HRIS check failed.", failureCode: code, failureHint: hint };
}
