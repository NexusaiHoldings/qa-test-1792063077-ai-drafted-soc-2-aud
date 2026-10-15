"""Admin routes for Social & Engagement lego (social-and-engagement-buildout-001)."""
from __future__ import annotations
import json
import aiohttp.web


def _admin_ok(request: aiohttp.web.Request) -> bool:
    token = (request.headers.get("X-Admin-Token") or "").strip()
    expected = (request.app.get("admin_token") or "").strip()
    return bool(expected and token == expected)


async def handle_moderation_queue(request: aiohttp.web.Request) -> aiohttp.web.Response:
    if not _admin_ok(request):
        return aiohttp.web.Response(status=403, text="forbidden")
    db = request.app.get("db")
    rows = await db.query(
        "SELECT id, entity_type, entity_id, author_id, body, status, created_at "
        "FROM social_comments WHERE status IN ('pending', 'spam') "
        "ORDER BY created_at ASC LIMIT 100",
    )
    return aiohttp.web.json_response(
        {"moderation_queue": [dict(r) for r in rows], "count": len(rows)},
        dumps=lambda o: json.dumps(o, default=str),
    )


def register_admin_routes(app: aiohttp.web.Application) -> None:
    app.router.add_get("/admin/social/moderation-queue", handle_moderation_queue)
