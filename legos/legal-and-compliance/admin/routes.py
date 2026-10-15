"""Legal & Compliance admin contribution.

Registered with admin-console via POST /api/admin/sections/register at install time.

GET  /admin/legal/documents              — list all docs (active + archived)
GET  /admin/legal/documents/{doc_type}   — version history for one doc type
POST /admin/legal/documents/{doc_type}/publish — publish new version
GET  /admin/legal/acknowledgments        — paginated acknowledgment query
POST /admin/legal/force-reacknowledge    — force all users to re-acknowledge a doc
"""
from __future__ import annotations

import json
import logging
from typing import Any

import aiohttp.web

logger = logging.getLogger(__name__)


def _ok(request: aiohttp.web.Request) -> bool:
    token = (request.app.get("admin_token") or "").strip()
    header = (request.headers.get("X-Admin-Token") or "").strip()
    return bool(token and header == token)


async def handle_admin_list_documents(request: aiohttp.web.Request) -> aiohttp.web.Response:
    """List all legal documents across all versions and jurisdictions."""
    if not _ok(request):
        return aiohttp.web.Response(status=403, text="admin access required")

    db: Any = request.app.get("db")
    if db is None:
        return aiohttp.web.Response(status=503, text="db unavailable")

    try:
        rows = await db.query(
            """SELECT id, doc_type, version, jurisdiction, content_summary,
                      effective_at, published_by, created_at
               FROM legal_documents
               ORDER BY doc_type, jurisdiction, effective_at DESC"""
        )
    except Exception as exc:
        logger.error(json.dumps({"event": "admin_list_docs_err", "error": str(exc)}))
        return aiohttp.web.Response(status=500, text="internal error")

    docs = [
        {
            "id": str(r["id"]),
            "doc_type": r["doc_type"],
            "version": r["version"],
            "jurisdiction": r["jurisdiction"],
            "content_summary": r.get("content_summary"),
            "effective_at": r["effective_at"].isoformat() if hasattr(r["effective_at"], "isoformat") else str(r["effective_at"]),
            "created_at": r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"]),
        }
        for r in rows
    ]
    return aiohttp.web.json_response({"documents": docs, "count": len(docs)})


async def handle_admin_doc_type_history(request: aiohttp.web.Request) -> aiohttp.web.Response:
    """Version history for a specific doc type across all jurisdictions."""
    if not _ok(request):
        return aiohttp.web.Response(status=403, text="admin access required")

    db: Any = request.app.get("db")
    if db is None:
        return aiohttp.web.Response(status=503, text="db unavailable")

    doc_type = request.match_info.get("doc_type", "")
    try:
        rows = await db.query(
            """SELECT id, doc_type, version, jurisdiction, content_summary,
                      effective_at, published_by, created_at
               FROM legal_documents
               WHERE doc_type = $1
               ORDER BY jurisdiction, effective_at DESC""",
            doc_type,
        )
    except Exception as exc:
        logger.error(json.dumps({"event": "admin_doc_history_err", "error": str(exc)}))
        return aiohttp.web.Response(status=500, text="internal error")

    if not rows:
        return aiohttp.web.Response(status=404, text="no documents found for this type")

    versions = [
        {
            "id": str(r["id"]),
            "version": r["version"],
            "jurisdiction": r["jurisdiction"],
            "effective_at": r["effective_at"].isoformat() if hasattr(r["effective_at"], "isoformat") else str(r["effective_at"]),
            "content_summary": r.get("content_summary"),
        }
        for r in rows
    ]
    return aiohttp.web.json_response({"doc_type": doc_type, "versions": versions})


async def handle_admin_list_acknowledgments(request: aiohttp.web.Request) -> aiohttp.web.Response:
    """Paginated acknowledgment query with optional filters."""
    if not _ok(request):
        return aiohttp.web.Response(status=403, text="admin access required")

    db: Any = request.app.get("db")
    if db is None:
        return aiohttp.web.Response(status=503, text="db unavailable")

    user_id = request.rel_url.query.get("user_id")
    doc_id = request.rel_url.query.get("doc_id")
    limit = min(int(request.rel_url.query.get("limit", "50")), 500)
    offset = int(request.rel_url.query.get("offset", "0"))

    try:
        wheres = ["1=1"]
        params: list = []
        if user_id:
            params.append(user_id)
            wheres.append(f"la.user_id = ${len(params)}")
        if doc_id:
            params.append(doc_id)
            wheres.append(f"la.doc_id = ${len(params)}")

        params.extend([limit, offset])
        rows = await db.query(
            f"""SELECT la.id, la.user_id, la.doc_id, la.acknowledged_at,
                       ld.doc_type, ld.version
                FROM legal_acknowledgments la
                JOIN legal_documents ld ON ld.id = la.doc_id
                WHERE {' AND '.join(wheres)}
                ORDER BY la.acknowledged_at DESC
                LIMIT ${len(params) - 1} OFFSET ${len(params)}""",
            *params,
        )
    except Exception as exc:
        logger.error(json.dumps({"event": "admin_list_acks_err", "error": str(exc)}))
        return aiohttp.web.Response(status=500, text="internal error")

    acks = [
        {
            "id": str(r["id"]),
            "user_id": str(r["user_id"]),
            "doc_id": str(r["doc_id"]),
            "doc_type": r["doc_type"],
            "version": r["version"],
            "acknowledged_at": r["acknowledged_at"].isoformat(),
        }
        for r in rows
    ]
    return aiohttp.web.json_response({"acknowledgments": acks, "count": len(acks)})


async def handle_admin_force_reacknowledge(request: aiohttp.web.Request) -> aiohttp.web.Response:
    """Force all users to re-acknowledge a specific document version."""
    if not _ok(request):
        return aiohttp.web.Response(status=403, text="admin access required")

    db: Any = request.app.get("db")
    if db is None:
        return aiohttp.web.Response(status=503, text="db unavailable")

    try:
        body = await request.json()
    except Exception:
        return aiohttp.web.Response(status=400, text="invalid JSON body")

    doc_id = body.get("doc_id")
    if not doc_id:
        return aiohttp.web.Response(status=400, text="missing doc_id")

    try:
        result = await db.execute(
            "DELETE FROM legal_acknowledgments WHERE doc_id = $1", doc_id
        )
        deleted = int(str(result).split()[-1]) if result else 0
    except Exception as exc:
        logger.error(json.dumps({"event": "force_reack_err", "error": str(exc)}))
        return aiohttp.web.Response(status=500, text="internal error")

    logger.info(json.dumps({"event": "force_reacknowledge", "doc_id": doc_id,
                             "acks_cleared": deleted}))
    return aiohttp.web.json_response({
        "status": "reacknowledgment_required",
        "doc_id": doc_id,
        "acknowledgments_cleared": deleted,
    })
