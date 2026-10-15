"""Admin routes for Profile & Account lego (profile-and-account-buildout-001).

GET  /admin/account/exports                 — pending/recent export requests
GET  /admin/account/profiles/{user_id}      — a user's profile + connected accounts

Follows the identity-and-access admin contribution shape (X-Admin-Token gate).
"""
from __future__ import annotations

import json
import logging

import aiohttp.web

logger = logging.getLogger(__name__)


def _admin_ok(request: aiohttp.web.Request) -> bool:
    token = (request.headers.get("X-Admin-Token") or "").strip()
    expected = (request.app.get("admin_token") or "").strip()
    return bool(expected and token == expected)


async def handle_exports(request: aiohttp.web.Request) -> aiohttp.web.Response:
    if not _admin_ok(request):
        return aiohttp.web.Response(status=403, text="forbidden")
    db = request.app.get("db")
    rows = await db.query(
        "SELECT id, user_id, format, status, requested_at, completed_at "
        "FROM account_export_requests ORDER BY requested_at DESC LIMIT 100",
    )
    return aiohttp.web.json_response(
        {"exports": [dict(r) for r in rows], "count": len(rows)},
        dumps=lambda o: json.dumps(o, default=str),
    )


async def handle_profile_detail(request: aiohttp.web.Request) -> aiohttp.web.Response:
    if not _admin_ok(request):
        return aiohttp.web.Response(status=403, text="forbidden")
    db = request.app.get("db")
    user_id = request.match_info["user_id"]
    profiles = await db.query("SELECT * FROM user_profiles WHERE user_id = $1::uuid", user_id)
    connected = await db.query(
        "SELECT id, provider, external_id, email, connected_at "
        "FROM connected_accounts WHERE user_id = $1::uuid ORDER BY connected_at DESC",
        user_id,
    )
    return aiohttp.web.json_response(
        {
            "profile": dict(profiles[0]) if profiles else None,
            "connected_accounts": [dict(c) for c in connected],
        },
        dumps=lambda o: json.dumps(o, default=str),
    )


def register_admin_routes(app: aiohttp.web.Application) -> None:
    app.router.add_get("/admin/account/exports", handle_exports)
    app.router.add_get("/admin/account/profiles/{user_id}", handle_profile_detail)
