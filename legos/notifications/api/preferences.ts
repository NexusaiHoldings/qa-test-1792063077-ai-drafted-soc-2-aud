/**
 * Notification preferences API.
 *
 * Ported 2026-05-12 from api/preferences.py.
 *   GET  /api/notifications/preferences        — user's preference matrix
 *   PUT  /api/notifications/preferences        — bulk-set preferences
 *   POST /api/notifications/web-push/register  — register browser push subscription
 */

import { randomUUID } from "node:crypto";
import { err, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";

const VALID_CHANNELS = new Set(["email", "in_app", "web_push", "sms"]);

// ── handler: get preferences ──────────────────────────────────────────────

export interface GetPreferencesInput {
  readonly userId: string | null;
  readonly ctx: HandlerContext;
}

export async function handleGetPreferences({
  userId,
  ctx,
}: GetPreferencesInput): Promise<HandlerResult> {
  if (!userId) return err(401, "authentication required");

  const rows = await ctx.db.query<{
    channel: string;
    category: string;
    enabled: boolean;
  }>(
    "SELECT channel, category, enabled FROM notification_preferences " +
      "WHERE user_id = $1::uuid ORDER BY category, channel",
    userId,
  );
  return ok({ preferences: rows });
}

// ── handler: set preferences ──────────────────────────────────────────────

export interface SetPreferencesInput {
  readonly userId: string | null;
  readonly body: {
    preferences?: Array<{
      channel?: string;
      category?: string;
      enabled?: boolean;
    }>;
  };
  readonly ctx: HandlerContext;
}

export async function handleSetPreferences({
  userId,
  body,
  ctx,
}: SetPreferencesInput): Promise<HandlerResult> {
  if (!userId) return err(401, "authentication required");

  const prefs = body.preferences;
  if (!Array.isArray(prefs)) return err(400, "preferences must be a list");

  let updatesApplied = 0;
  for (const pref of prefs) {
    const channel = pref.channel;
    const category = pref.category;
    const enabled = pref.enabled;
    if (
      !channel ||
      !VALID_CHANNELS.has(channel) ||
      !category ||
      typeof enabled !== "boolean"
    ) {
      continue;
    }
    await ctx.db.execute(
      "INSERT INTO notification_preferences (id, user_id, channel, category, enabled) " +
        "VALUES ($1::uuid, $2::uuid, $3, $4, $5) " +
        "ON CONFLICT (user_id, channel, category) DO UPDATE SET " +
        "enabled = EXCLUDED.enabled, updated_at = NOW()",
      randomUUID(),
      userId,
      channel,
      category,
      enabled,
    );
    updatesApplied++;
  }

  await ctx.events.publish("notifications.preferences_updated", {
    user_id: userId,
    updates_applied: updatesApplied,
  });
  return ok({ updates_applied: updatesApplied });
}

// ── handler: register web push subscription ───────────────────────────────

export interface RegisterWebPushInput {
  readonly userId: string | null;
  readonly body: {
    endpoint?: string;
    p256dh?: string;
    p256dh_key?: string;
    auth?: string;
    auth_key?: string;
  };
  readonly userAgent: string | null;
  readonly ctx: HandlerContext;
}

export async function handleRegisterWebPush({
  userId,
  body,
  userAgent,
  ctx,
}: RegisterWebPushInput): Promise<HandlerResult> {
  if (!userId) return err(401, "authentication required");

  const endpoint = body.endpoint || "";
  const p256dh = body.p256dh || body.p256dh_key || "";
  const auth = body.auth || body.auth_key || "";

  if (!endpoint || !p256dh || !auth) {
    return err(400, "endpoint, p256dh, and auth required");
  }

  await ctx.db.execute(
    "INSERT INTO web_push_subscriptions (id, user_id, endpoint, p256dh_key, auth_key, user_agent) " +
      "VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6) " +
      "ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, last_used_at = NOW()",
    randomUUID(),
    userId,
    endpoint,
    p256dh,
    auth,
    userAgent || "",
  );
  return ok({ registered: true });
}
