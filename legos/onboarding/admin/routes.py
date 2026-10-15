"""Admin routes for Onboarding lego (onboarding-buildout-001). X-Admin-Token gated."""
from __future__ import annotations
import json
import aiohttp.web


def _admin_ok(request: aiohttp.web.Request) -> bool:
    token = (request.headers.get("X-Admin-Token") or "").strip()
    expected = (request.app.get("admin_token") or "").strip()
    return bool(expected and token == expected)


async def handle_funnel(request: aiohttp.web.Request) -> aiohttp.web.Response:
    if not _admin_ok(request):
        return aiohttp.web.Response(status=403, text="forbidden")
    db = request.app.get("db")
    rows = await db.query(
        "SELECT step_key, status, COUNT(*) AS count FROM onboarding_progress "
        "GROUP BY step_key, status ORDER BY step_key",
    )
    return aiohttp.web.json_response(
        {"funnel": [dict(r) for r in rows]}, dumps=lambda o: json.dumps(o, default=str),
    )


def register_admin_routes(app: aiohttp.web.Application) -> None:
    app.router.add_get("/admin/onboarding/funnel", handle_funnel)
