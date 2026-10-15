/** Onboarding handlers — onboarding lego. Framework-agnostic. */
import type { HandlerContext, HandlerResult } from "./_lib/handler";
import { ok, err } from "./_lib/handler";
import type { DbRow } from "./_lib/db";

/** GET /api/onboarding/progress?user_id= — a user's onboarding progress. */
export async function handleGetProgress(
  ctx: HandlerContext,
  userId: string,
): Promise<HandlerResult> {
  if (!userId) return err(400, "user_id is required");
  const rows = await ctx.db.query<DbRow>(
    `SELECT step_key, status, completed_at FROM onboarding_progress
     WHERE user_id = $1 ORDER BY created_at ASC`,
    userId,
  );
  const total = rows.length;
  const done = rows.filter((r) => r.status === "completed").length;
  return ok({ progress: rows, completed: done, total, percent: total ? Math.round((done / total) * 100) : 0 });
}

/** POST /api/onboarding/steps — upsert a step's status. */
export async function handleUpdateStep(
  ctx: HandlerContext,
  body: { user_id?: string; step_key?: string; status?: string },
): Promise<HandlerResult> {
  if (!body.user_id || !body.step_key) return err(400, "user_id and step_key required");
  const status = ["pending", "in_progress", "completed", "skipped"].includes(body.status ?? "")
    ? body.status! : "in_progress";
  await ctx.db.execute(
    `INSERT INTO onboarding_progress (user_id, step_key, status, completed_at)
     VALUES ($1, $2, $3, CASE WHEN $3 = 'completed' THEN NOW() ELSE NULL END)
     ON CONFLICT (user_id, step_key) DO UPDATE SET
        status = EXCLUDED.status,
        completed_at = CASE WHEN EXCLUDED.status = 'completed' THEN NOW() ELSE onboarding_progress.completed_at END`,
    body.user_id, body.step_key, status,
  );
  await ctx.events.publish(
    status === "completed" ? "onboarding.step_completed" : "onboarding.step_updated",
    { user_id: body.user_id, step_key: body.step_key, status },
  );
  return ok({ user_id: body.user_id, step_key: body.step_key, status });
}

/**
 * POST /api/onboarding/sample-data — provision sample data for a user.
 * Server-side mutation behind the provision_sample_data agent tool (confirm).
 */
export async function handleProvisionSampleData(
  ctx: HandlerContext,
  body: { user_id?: string; dataset?: string },
): Promise<HandlerResult> {
  if (!body.user_id) return err(400, "user_id is required");
  const rows = await ctx.db.query<DbRow>(
    `INSERT INTO onboarding_sample_data_runs (user_id, status, detail)
     VALUES ($1, 'requested', $2::jsonb) RETURNING id, status`,
    body.user_id, JSON.stringify({ dataset: body.dataset ?? "default" }),
  );
  await ctx.events.publish("onboarding.sample_data_requested", { run_id: rows[0].id, user_id: body.user_id });
  return ok({ run_id: rows[0].id, status: "requested" }, 201);
}
