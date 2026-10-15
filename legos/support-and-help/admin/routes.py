"""Admin routes for Support & Help lego (support-and-help-buildout-001).

GET  /admin/support/queue                  — human-queue tickets (escalated / pending)
GET  /admin/support/tickets/{ticket_id}    — ticket detail + thread
POST /admin/support/tickets/{ticket_id}/assign   — claim a ticket for a human
POST /admin/support/tickets/{ticket_id}/resolve   — resolve a ticket

Mirrors the identity-and-access admin/routes.py contribution shape: an
X-Admin-Token gate, a fire-and-forget event publish helper, and aiohttp
handlers the substrate's admin-console mounts.
"""
from __future__ import annotations

import json
import logging
from typing import Any

import aiohttp.web

logger = logging.getLogger(__name__)


def _admin_ok(request: aiohttp.web.Request) -> bool:
    token = (request.headers.get("X-Admin-Token") or "").strip()
    expected = (request.app.get("admin_token") or "").strip()
    return bool(expected and token == expected)


async def _publish(js: Any, subject: str, payload: dict) -> None:
    if js is None:
        return
    try:
        await js.publish(subject, json.dumps(payload).encode())
    except Exception as exc:  # fire-and-forget — never fail the request
        logger.warning("support admin publish failed subject=%s: %s", subject, exc)


async def handle_queue(request: aiohttp.web.Request) -> aiohttp.web.Response:
    """GET /admin/support/queue — open/pending tickets in the human queue."""
    if not _admin_ok(request):
        return aiohttp.web.Response(status=403, text="forbidden")
    db = request.app.get("db")
    limit = min(100, int(request.query.get("limit", "50")))
    rows = await db.query(
        "SELECT id, subject, status, priority, category, assignee_type, "
        "escalated_at, created_at "
        "FROM support_tickets "
        "WHERE status IN ('open', 'pending') "
        "ORDER BY assignee_type = 'human' DESC, "
        "CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 "
        "WHEN 'normal' THEN 2 ELSE 3 END, created_at ASC "
        "LIMIT $1",
        limit,
    )
    return aiohttp.web.json_response({
        "queue": [dict(r) for r in rows], "count": len(rows),
    }, dumps=lambda o: json.dumps(o, default=str))


async def handle_ticket_detail(request: aiohttp.web.Request) -> aiohttp.web.Response:
    """GET /admin/support/tickets/{ticket_id}."""
    if not _admin_ok(request):
        return aiohttp.web.Response(status=403, text="forbidden")
    db = request.app.get("db")
    ticket_id = request.match_info["ticket_id"]
    tickets = await db.query(
        "SELECT * FROM support_tickets WHERE id = $1::uuid", ticket_id,
    )
    if not tickets:
        return aiohttp.web.Response(status=404, text="ticket not found")
    messages = await db.query(
        "SELECT id, author_type, author_id, body, is_internal, created_at "
        "FROM support_messages WHERE ticket_id = $1::uuid ORDER BY created_at ASC",
        ticket_id,
    )
    return aiohttp.web.json_response({
        "ticket": dict(tickets[0]),
        "messages": [dict(m) for m in messages],
    }, dumps=lambda o: json.dumps(o, default=str))


async def handle_assign(request: aiohttp.web.Request) -> aiohttp.web.Response:
    """POST /admin/support/tickets/{ticket_id}/assign — claim for a human."""
    if not _admin_ok(request):
        return aiohttp.web.Response(status=403, text="forbidden")
    db = request.app.get("db")
    ticket_id = request.match_info["ticket_id"]
    rows = await db.query(
        "UPDATE support_tickets SET assignee_type = 'human', status = 'pending', "
        "updated_at = NOW() WHERE id = $1::uuid RETURNING id",
        ticket_id,
    )
    if not rows:
        return aiohttp.web.Response(status=404, text="ticket not found")
    await _publish(request.app.get("js"), "ticket.assigned",
                   {"ticket_id": ticket_id, "assignee_type": "human"})
    return aiohttp.web.json_response({"ticket_id": ticket_id, "assignee_type": "human"})


async def handle_resolve(request: aiohttp.web.Request) -> aiohttp.web.Response:
    """POST /admin/support/tickets/{ticket_id}/resolve."""
    if not _admin_ok(request):
        return aiohttp.web.Response(status=403, text="forbidden")
    db = request.app.get("db")
    ticket_id = request.match_info["ticket_id"]
    rows = await db.query(
        "UPDATE support_tickets SET status = 'resolved', resolved_at = NOW(), "
        "updated_at = NOW() WHERE id = $1::uuid AND status <> 'closed' RETURNING id",
        ticket_id,
    )
    if not rows:
        return aiohttp.web.Response(status=404, text="ticket not found or closed")
    await _publish(request.app.get("js"), "ticket.resolved", {"ticket_id": ticket_id})
    return aiohttp.web.json_response({"ticket_id": ticket_id, "status": "resolved"})


def register_admin_routes(app: aiohttp.web.Application) -> None:
    """Mount the support admin contribution onto the admin-console app."""
    app.router.add_get("/admin/support/queue", handle_queue)
    app.router.add_get("/admin/support/tickets/{ticket_id}", handle_ticket_detail)
    app.router.add_post("/admin/support/tickets/{ticket_id}/assign", handle_assign)
    app.router.add_post("/admin/support/tickets/{ticket_id}/resolve", handle_resolve)
