"""Admin routes for CRM & Lifecycle lego (crm-and-lifecycle-buildout-001).

GET  /admin/crm/pipeline                 — pipeline rollup (count + value by stage)
GET  /admin/crm/contacts/{contact_id}    — contact detail + interactions
GET  /admin/crm/outreach                 — outreach drafts pending approval

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


async def handle_pipeline(request: aiohttp.web.Request) -> aiohttp.web.Response:
    if not _admin_ok(request):
        return aiohttp.web.Response(status=403, text="forbidden")
    db = request.app.get("db")
    rows = await db.query(
        "SELECT stage, COUNT(*) AS count, "
        "COUNT(*) FILTER (WHERE is_hot) AS hot_count, "
        "ROUND(AVG(lead_score)) AS avg_score "
        "FROM crm_contacts GROUP BY stage ORDER BY stage",
    )
    return aiohttp.web.json_response(
        {"pipeline": [dict(r) for r in rows]},
        dumps=lambda o: json.dumps(o, default=str),
    )


async def handle_contact_detail(request: aiohttp.web.Request) -> aiohttp.web.Response:
    if not _admin_ok(request):
        return aiohttp.web.Response(status=403, text="forbidden")
    db = request.app.get("db")
    contact_id = request.match_info["contact_id"]
    contacts = await db.query("SELECT * FROM crm_contacts WHERE id = $1::uuid", contact_id)
    if not contacts:
        return aiohttp.web.Response(status=404, text="contact not found")
    interactions = await db.query(
        "SELECT id, kind, direction, body, actor_type, created_at "
        "FROM crm_interactions WHERE contact_id = $1::uuid ORDER BY created_at DESC LIMIT 100",
        contact_id,
    )
    return aiohttp.web.json_response(
        {"contact": dict(contacts[0]), "interactions": [dict(i) for i in interactions]},
        dumps=lambda o: json.dumps(o, default=str),
    )


async def handle_outreach_queue(request: aiohttp.web.Request) -> aiohttp.web.Response:
    if not _admin_ok(request):
        return aiohttp.web.Response(status=403, text="forbidden")
    db = request.app.get("db")
    rows = await db.query(
        "SELECT id, contact_id, channel, subject, body, status, created_at "
        "FROM crm_outreach_drafts WHERE status IN ('draft', 'approved') "
        "ORDER BY created_at ASC LIMIT 100",
    )
    return aiohttp.web.json_response(
        {"drafts": [dict(r) for r in rows], "count": len(rows)},
        dumps=lambda o: json.dumps(o, default=str),
    )


def register_admin_routes(app: aiohttp.web.Application) -> None:
    app.router.add_get("/admin/crm/pipeline", handle_pipeline)
    app.router.add_get("/admin/crm/contacts/{contact_id}", handle_contact_detail)
    app.router.add_get("/admin/crm/outreach", handle_outreach_queue)
