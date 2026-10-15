"""Admin routes for Organizations & Teams lego (organizations-and-teams-buildout-001).

GET  /admin/orgs                       — list orgs (member + seat counts)
GET  /admin/orgs/{org_id}              — org detail + members
GET  /admin/orgs/{org_id}/audit        — recent audit-log entries

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


async def handle_list_orgs(request: aiohttp.web.Request) -> aiohttp.web.Response:
    if not _admin_ok(request):
        return aiohttp.web.Response(status=403, text="forbidden")
    db = request.app.get("db")
    rows = await db.query(
        "SELECT o.id, o.name, o.slug, o.plan, o.seat_limit, "
        "(SELECT COUNT(*) FROM org_members m WHERE m.org_id = o.id) AS member_count "
        "FROM organizations o ORDER BY o.created_at DESC LIMIT 100",
    )
    return aiohttp.web.json_response(
        {"orgs": [dict(r) for r in rows], "count": len(rows)},
        dumps=lambda o: json.dumps(o, default=str),
    )


async def handle_org_detail(request: aiohttp.web.Request) -> aiohttp.web.Response:
    if not _admin_ok(request):
        return aiohttp.web.Response(status=403, text="forbidden")
    db = request.app.get("db")
    org_id = request.match_info["org_id"]
    orgs = await db.query("SELECT * FROM organizations WHERE id = $1::uuid", org_id)
    if not orgs:
        return aiohttp.web.Response(status=404, text="org not found")
    members = await db.query(
        "SELECT id, user_id, role, joined_at, last_active_at "
        "FROM org_members WHERE org_id = $1::uuid ORDER BY joined_at ASC",
        org_id,
    )
    return aiohttp.web.json_response(
        {"org": dict(orgs[0]), "members": [dict(m) for m in members]},
        dumps=lambda o: json.dumps(o, default=str),
    )


async def handle_org_audit(request: aiohttp.web.Request) -> aiohttp.web.Response:
    if not _admin_ok(request):
        return aiohttp.web.Response(status=403, text="forbidden")
    db = request.app.get("db")
    org_id = request.match_info["org_id"]
    rows = await db.query(
        "SELECT id, actor_id, actor_type, action, detail, created_at "
        "FROM org_audit_log WHERE org_id = $1::uuid ORDER BY created_at DESC LIMIT 100",
        org_id,
    )
    return aiohttp.web.json_response(
        {"audit": [dict(r) for r in rows], "count": len(rows)},
        dumps=lambda o: json.dumps(o, default=str),
    )


def register_admin_routes(app: aiohttp.web.Application) -> None:
    app.router.add_get("/admin/orgs", handle_list_orgs)
    app.router.add_get("/admin/orgs/{org_id}", handle_org_detail)
    app.router.add_get("/admin/orgs/{org_id}/audit", handle_org_audit)
