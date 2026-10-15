/** Analytics handlers — analytics-and-telemetry lego. Framework-agnostic. */
import type { HandlerContext, HandlerResult } from "./_lib/handler";
import { ok, err } from "./_lib/handler";
import type { DbRow } from "./_lib/db";

/** POST /api/analytics/events — record an event. */
export async function handleRecordEvent(
  ctx: HandlerContext,
  body: { name?: string; user_id?: string; properties?: Record<string, unknown> },
): Promise<HandlerResult> {
  const name = (body.name ?? "").trim();
  if (!name) return err(400, "name is required");
  const rows = await ctx.db.query<DbRow>(
    `INSERT INTO analytics_events (name, user_id, properties)
     VALUES ($1, $2, $3::jsonb) RETURNING id`,
    name, body.user_id ?? null, JSON.stringify(body.properties ?? {}),
  );
  await ctx.events.publish("analytics.event_recorded", { name });
  return ok({ event_id: rows[0].id }, 201);
}

/** GET /api/analytics/counts?name=&days= — event counts by day. */
export async function handleEventCounts(
  ctx: HandlerContext,
  query: { name?: string; days?: number },
): Promise<HandlerResult> {
  const days = Math.max(1, Math.min(90, query.days ?? 30));
  const params: unknown[] = [days];
  let nameClause = "";
  if (query.name) {
    params.push(query.name);
    nameClause = ` AND name = $${params.length}`;
  }
  const rows = await ctx.db.query<DbRow>(
    `SELECT name, DATE(occurred_at) AS day, COUNT(*) AS count
     FROM analytics_events
     WHERE occurred_at > NOW() - ($1 || ' days')::interval${nameClause}
     GROUP BY name, DATE(occurred_at) ORDER BY day DESC`,
    ...params,
  );
  return ok({ counts: rows });
}

/** GET /api/analytics/funnels — list defined funnels. */
export async function handleListFunnels(
  ctx: HandlerContext,
): Promise<HandlerResult> {
  const rows = await ctx.db.query<DbRow>(
    `SELECT id, name, steps, created_at FROM analytics_funnels ORDER BY name`,
  );
  return ok({ funnels: rows, count: rows.length });
}

function toInt(v: unknown): number {
  // pg returns COUNT(*) (bigint) as a string — coerce so the UI gets numbers.
  const n = typeof v === "number" ? v : parseInt(String(v ?? "0"), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * GET /api/analytics/summary?days= — one rich aggregate for the admin
 * dashboard: window totals, a gap-filled daily series (for the trend chart),
 * top pages (from page_view `path`), and per-event-name counts. Read-only.
 */
export async function handleAnalyticsSummary(
  ctx: HandlerContext,
  query: { days?: number },
): Promise<HandlerResult> {
  const days = Math.max(1, Math.min(90, query.days ?? 30));

  const totalsRows = await ctx.db.query<DbRow>(
    `SELECT
       COUNT(*)                                                        AS events,
       COUNT(*) FILTER (WHERE name = 'page_view')                      AS page_views,
       COUNT(DISTINCT properties->>'path')
         FILTER (WHERE name = 'page_view' AND properties->>'path' IS NOT NULL) AS unique_paths,
       COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)      AS active_users,
       COUNT(DISTINCT DATE(occurred_at))                              AS active_days
     FROM analytics_events
     WHERE occurred_at > NOW() - ($1 || ' days')::interval`,
    days,
  );
  const t = totalsRows[0] ?? {};

  const series = await ctx.db.query<DbRow>(
    `SELECT to_char(d::date, 'YYYY-MM-DD') AS day, COALESCE(e.cnt, 0) AS count
     FROM generate_series(
       (CURRENT_DATE - ($1::int - 1)), CURRENT_DATE, '1 day'
     ) AS d
     LEFT JOIN (
       SELECT DATE(occurred_at) AS day, COUNT(*) AS cnt
       FROM analytics_events
       WHERE occurred_at > NOW() - ($1 || ' days')::interval
       GROUP BY DATE(occurred_at)
     ) e ON e.day = d::date
     ORDER BY day`,
    days,
  );

  const topPages = await ctx.db.query<DbRow>(
    `SELECT properties->>'path' AS path, COUNT(*) AS views
     FROM analytics_events
     WHERE name = 'page_view'
       AND properties->>'path' IS NOT NULL
       AND occurred_at > NOW() - ($1 || ' days')::interval
     GROUP BY properties->>'path'
     ORDER BY views DESC
     LIMIT 10`,
    days,
  );

  const byEvent = await ctx.db.query<DbRow>(
    `SELECT name, COUNT(*) AS count
     FROM analytics_events
     WHERE occurred_at > NOW() - ($1 || ' days')::interval
     GROUP BY name
     ORDER BY count DESC
     LIMIT 20`,
    days,
  );

  return ok({
    window_days: days,
    totals: {
      events: toInt(t.events),
      page_views: toInt(t.page_views),
      unique_paths: toInt(t.unique_paths),
      active_users: toInt(t.active_users),
      active_days: toInt(t.active_days),
    },
    series: series.map((r) => ({ day: String(r.day), count: toInt(r.count) })),
    top_pages: topPages.map((r) => ({ path: String(r.path), views: toInt(r.views) })),
    by_event: byEvent.map((r) => ({ name: String(r.name), count: toInt(r.count) })),
  });
}
