"""Admin routes for Analytics & Telemetry lego (analytics-and-telemetry-buildout-001)."""
from __future__ import annotations
import json
import aiohttp.web


def _admin_ok(request: aiohttp.web.Request) -> bool:
    token = (request.headers.get("X-Admin-Token") or "").strip()
    expected = (request.app.get("admin_token") or "").strip()
    return bool(expected and token == expected)


async def handle_top_events(request: aiohttp.web.Request) -> aiohttp.web.Response:
    if not _admin_ok(request):
        return aiohttp.web.Response(status=403, text="forbidden")
    db = request.app.get("db")
    rows = await db.query(
        "SELECT name, COUNT(*) AS count FROM analytics_events "
        "WHERE occurred_at > NOW() - interval '30 days' GROUP BY name ORDER BY count DESC LIMIT 50",
    )
    return aiohttp.web.json_response(
        {"top_events": [dict(r) for r in rows]}, dumps=lambda o: json.dumps(o, default=str),
    )


def register_admin_routes(app: aiohttp.web.Application) -> None:
    app.router.add_get("/admin/analytics/top-events", handle_top_events)
