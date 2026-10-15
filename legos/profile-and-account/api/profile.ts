/**
 * Profile + account handlers — profile-and-account lego. Framework-agnostic.
 */

import type { HandlerContext, HandlerResult } from "./_lib/handler";
import { ok, err } from "./_lib/handler";
import type { DbRow } from "./_lib/db";

/** GET /api/account/profile?user_id= — fetch a user's profile (creates default). */
export async function handleGetProfile(
  ctx: HandlerContext,
  userId: string,
): Promise<HandlerResult> {
  if (!userId) return err(400, "user_id is required");
  const rows = await ctx.db.query<DbRow>(
    `SELECT user_id, display_name, avatar_url, bio, timezone, preferences,
            completion_score, last_active_at, updated_at
     FROM user_profiles WHERE user_id = $1`,
    userId,
  );
  if (rows.length === 0) {
    return ok({
      profile: {
        user_id: userId, display_name: null, avatar_url: null, bio: null,
        timezone: null, preferences: {}, completion_score: 0,
      },
    });
  }
  return ok({ profile: rows[0] });
}

/** PUT /api/account/profile — upsert a user's profile fields. */
export async function handleUpdateProfile(
  ctx: HandlerContext,
  body: {
    user_id?: string; display_name?: string; avatar_url?: string;
    bio?: string; timezone?: string; preferences?: Record<string, unknown>;
    required_fields?: string[];
  },
): Promise<HandlerResult> {
  const userId = body.user_id ?? "";
  if (!userId) return err(400, "user_id is required");

  const required = body.required_fields ?? ["display_name", "avatar_url", "timezone"];
  const filled = required.filter((f) => {
    const v = (body as Record<string, unknown>)[f];
    return v !== undefined && v !== null && String(v).trim() !== "";
  }).length;
  const completion = required.length ? Math.round((filled / required.length) * 100) : 0;

  const rows = await ctx.db.query<DbRow>(
    `INSERT INTO user_profiles
        (user_id, display_name, avatar_url, bio, timezone, preferences, completion_score, last_active_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
        display_name = COALESCE(EXCLUDED.display_name, user_profiles.display_name),
        avatar_url   = COALESCE(EXCLUDED.avatar_url, user_profiles.avatar_url),
        bio          = COALESCE(EXCLUDED.bio, user_profiles.bio),
        timezone     = COALESCE(EXCLUDED.timezone, user_profiles.timezone),
        preferences  = EXCLUDED.preferences,
        completion_score = EXCLUDED.completion_score,
        last_active_at = NOW(),
        updated_at = NOW()
     RETURNING user_id, completion_score`,
    userId, body.display_name ?? null, body.avatar_url ?? null, body.bio ?? null,
    body.timezone ?? null, JSON.stringify(body.preferences ?? {}), completion,
  );
  await ctx.events.publish("profile.updated", { user_id: userId, completion_score: completion });
  return ok({ user_id: userId, completion_score: rows[0].completion_score });
}

/** GET /api/account/connected?user_id= — list connected providers. */
export async function handleListConnectedAccounts(
  ctx: HandlerContext,
  userId: string,
): Promise<HandlerResult> {
  if (!userId) return err(400, "user_id is required");
  const rows = await ctx.db.query<DbRow>(
    `SELECT id, provider, external_id, email, connected_at
     FROM connected_accounts WHERE user_id = $1 ORDER BY connected_at DESC`,
    userId,
  );
  return ok({ connected_accounts: rows, count: rows.length });
}

/**
 * POST /api/account/export — create a GDPR data-export request.
 * Server-side mutation behind the request_account_export agent tool (the agent
 * tool routes through approval; on confirm the runtime/app calls this).
 */
export async function handleRequestExport(
  ctx: HandlerContext,
  body: { user_id?: string; format?: string; retention_days?: number },
): Promise<HandlerResult> {
  const userId = body.user_id ?? "";
  if (!userId) return err(400, "user_id is required");
  const format = body.format === "csv" ? "csv" : "json";
  const retention = Math.max(1, body.retention_days ?? 7);
  const rows = await ctx.db.query<DbRow>(
    `INSERT INTO account_export_requests (user_id, format, status, expires_at)
     VALUES ($1, $2, 'requested', NOW() + ($3 || ' days')::interval)
     RETURNING id, status`,
    userId, format, String(retention),
  );
  await ctx.events.publish("account.export_requested", {
    export_id: rows[0].id, user_id: userId, format,
  });
  return ok({ export_id: rows[0].id, status: "requested" }, 201);
}
