"""Admin-console contribution surface (spec §4.5).

Routes registered under /admin/memory/* in the Admin Console lego.
"""
from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from aiohttp import web

logger = logging.getLogger(__name__)


def _parse_uuid(value: Any) -> UUID | None:
    if not value:
        return None
    try:
        return UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


async def admin_recent_memories(request: web.Request) -> web.Response:
    """GET /admin/memory/recent?portfolio_company_id=<uuid>&limit=<int>

    Returns the most-recent memories across both tiers for an admin operator.
    """
    db = request.app["db"]
    company_id = _parse_uuid(request.query.get("portfolio_company_id"))
    if not company_id:
        return web.json_response({"error": "portfolio_company_id_required"}, status=400)

    try:
        limit = int(request.query.get("limit") or 50)
    except (ValueError, TypeError):
        limit = 50
    limit = max(1, min(limit, 200))

    long_term = await db.fetch(
        """
        SELECT id, discipline, memory_type, importance, retrieval_count,
               contradiction_count, status, created_at, last_retrieved_at
        FROM memory_items
        WHERE portfolio_company_id = $1::uuid AND memory_tier = 'long_term'
        ORDER BY created_at DESC LIMIT $2
        """,
        str(company_id),
        limit,
    )
    working = await db.fetch(
        """
        SELECT id, memory_kind, workflow_id, last_accessed_at, expires_at, created_at
        FROM portfolio_runtime_memory
        WHERE portfolio_company_id = $1::uuid AND expires_at > now()
        ORDER BY last_accessed_at DESC LIMIT $2
        """,
        str(company_id),
        limit,
    )
    forget_log = await db.fetch(
        """
        SELECT id, portfolio_user_id, requested_by_user_id, reason,
               rows_deleted_memory_items, rows_deleted_runtime_memory, created_at
        FROM portfolio_memory_forget_log
        WHERE portfolio_company_id = $1::uuid
        ORDER BY created_at DESC LIMIT 20
        """,
        str(company_id),
    )

    return web.json_response({
        "long_term": [dict(r) for r in long_term],
        "working": [dict(r) for r in working],
        "forget_log": [dict(r) for r in forget_log],
    })


async def admin_force_demote(request: web.Request) -> web.Response:
    """POST /admin/memory/demote — admin override to demote a specific memory."""
    db = request.app["db"]
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid_json"}, status=400)

    memory_id = _parse_uuid(body.get("memory_id"))
    if not memory_id:
        return web.json_response({"error": "memory_id_required"}, status=400)

    row = await db.fetchrow(
        "UPDATE memory_items SET status = 'demoted' "
        "WHERE id = $1::uuid AND status = 'active' "
        "RETURNING id",
        str(memory_id),
    )
    if not row:
        return web.json_response({"error": "memory_not_found_or_already_demoted"}, status=404)
    return web.json_response({"memory_id": str(memory_id), "status": "demoted"})


def setup_routes(app: web.Application) -> None:
    app.router.add_get("/admin/memory/recent", admin_recent_memories)
    app.router.add_post("/admin/memory/demote", admin_force_demote)
