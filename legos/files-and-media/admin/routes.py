"""Admin routes for Files & Media lego (files-and-media-buildout-001). X-Admin-Token gated."""
from __future__ import annotations
import json
import aiohttp.web


def _admin_ok(request: aiohttp.web.Request) -> bool:
    token = (request.headers.get("X-Admin-Token") or "").strip()
    expected = (request.app.get("admin_token") or "").strip()
    return bool(expected and token == expected)


async def handle_quarantine_queue(request: aiohttp.web.Request) -> aiohttp.web.Response:
    if not _admin_ok(request):
        return aiohttp.web.Response(status=403, text="forbidden")
    db = request.app.get("db")
    rows = await db.query(
        "SELECT id, user_id, filename, mime_type, scan_status, status, created_at "
        "FROM files WHERE status = 'quarantined' OR scan_status = 'infected' "
        "ORDER BY created_at DESC LIMIT 100",
    )
    return aiohttp.web.json_response(
        {"flagged": [dict(r) for r in rows], "count": len(rows)}, dumps=lambda o: json.dumps(o, default=str),
    )


def register_admin_routes(app: aiohttp.web.Application) -> None:
    app.router.add_get("/admin/files/quarantine-queue", handle_quarantine_queue)
