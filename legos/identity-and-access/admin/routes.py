"""Admin routes for Identity & Access lego (Sprint 2.3).

GET  /admin/users                              — paginated user search
GET  /admin/users/{user_id}                    — full user detail
POST /admin/users/{user_id}/mfa-factors/{factor_id}/revoke
POST /admin/users/{user_id}/sessions/revoke-all
POST /admin/users/{user_id}/force-deletion
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
    except Exception as exc:
        logger.warning(json.dumps({"event": "publish_error", "subject": subject, "error": str(exc)}))


async def handle_user_search(request: aiohttp.web.Request) -> aiohttp.web.Response:
    if not _admin_ok(request):
        return aiohttp.web.Response(status=403, text="admin access required")
    db: Any = request.app.get("db")
    if db is None:
        return aiohttp.web.Response(status=503, text="db unavailable")
    q = request.rel_url.query
    limit = min(int(q.get("limit") or 50), 200)
    offset = int(q.get("offset") or 0)
    parts: list[str] = []; params: list[Any] = []; i = 1
    if q.get("email"):
        parts.append(f"LOWER(email) LIKE LOWER(${i})"); params.append(f"%{q['email']}%"); i += 1
    if q.get("status"):
        parts.append(f"status = ${i}"); params.append(q["status"]); i += 1
    if q.get("deletion_pending", "").lower() == "true":
        parts.append("deletion_requested_at IS NOT NULL AND status != 'deleted'")
    where = ("WHERE " + " AND ".join(parts)) if parts else ""
    params += [limit, offset]
    sql = (f"SELECT id, email, status, created_at, deletion_requested_at "
           f"FROM users {where} ORDER BY created_at DESC LIMIT ${i} OFFSET ${i+1}")
    try:
        rows = await db.query(sql, *params)
    except Exception as exc:
        logger.error(json.dumps({"event": "admin_user_search_error", "error": str(exc)})); return aiohttp.web.Response(status=500, text="internal error")
    users = [{"id": str(r["id"]), "email": r["email"], "status": r["status"],
              "created_at": str(r["created_at"]), "deletion_pending": r["deletion_requested_at"] is not None}
             for r in rows]
    return aiohttp.web.json_response({"users": users, "offset": offset, "limit": limit})


async def handle_user_detail(request: aiohttp.web.Request) -> aiohttp.web.Response:
    if not _admin_ok(request):
        return aiohttp.web.Response(status=403, text="admin access required")
    db: Any = request.app.get("db")
    if db is None:
        return aiohttp.web.Response(status=503, text="db unavailable")
    uid = request.match_info["user_id"]
    try:
        users = await db.query("SELECT id, email, status, created_at FROM users WHERE id=$1::uuid LIMIT 1", uid)
        if not users:
            return aiohttp.web.Response(status=404, text="user not found")
        sessions = await db.query("SELECT id, created_at, ip_address FROM sessions WHERE user_id=$1::uuid AND expires_at > NOW() LIMIT 20", uid)
        factors = await db.query("SELECT id, factor_type, status FROM mfa_factors WHERE user_id=$1::uuid", uid)
        oauth = await db.query("SELECT id, provider, email FROM oauth_identities WHERE user_id=$1::uuid", uid)
        history = await db.query("SELECT login_at, method, success FROM login_history WHERE user_id=$1::uuid ORDER BY login_at DESC LIMIT 20", uid)
    except Exception as exc:
        logger.error(json.dumps({"event": "admin_user_detail_error", "error": str(exc)})); return aiohttp.web.Response(status=500, text="internal error")
    u = users[0]
    return aiohttp.web.json_response({
        "user": {"id": str(u["id"]), "email": u["email"], "status": u["status"], "created_at": str(u["created_at"])},
        "sessions": [{"id": str(s["id"]), "ip_address": str(s["ip_address"] or ""), "created_at": str(s["created_at"])} for s in sessions],
        "mfa_factors": [{"id": str(f["id"]), "factor_type": f["factor_type"], "status": f["status"]} for f in factors],
        "oauth_identities": [{"id": str(o["id"]), "provider": o["provider"], "email": o["email"] or ""} for o in oauth],
        "recent_login_history": [{"login_at": str(h["login_at"]), "method": h["method"] or "", "success": h["success"]} for h in history],
    })


async def handle_admin_revoke_mfa(request: aiohttp.web.Request) -> aiohttp.web.Response:
    if not _admin_ok(request):
        return aiohttp.web.Response(status=403, text="admin access required")
    db: Any = request.app.get("db")
    if db is None:
        return aiohttp.web.Response(status=503, text="db unavailable")
    uid = request.match_info["user_id"]; fid = request.match_info["factor_id"]
    try:
        status = await db.execute("UPDATE mfa_factors SET status='revoked' WHERE id=$1::uuid AND user_id=$2::uuid", fid, uid)
    except Exception as exc:
        logger.error(json.dumps({"event": "admin_revoke_mfa_error", "error": str(exc)})); return aiohttp.web.Response(status=500, text="internal error")
    if status == "UPDATE 0":
        return aiohttp.web.Response(status=404, text="factor not found")
    await _publish(request.app.get("js"), "user.mfa_factor_admin_revoked", {"user_id": uid, "factor_id": fid})
    return aiohttp.web.json_response({"status": "revoked"})


async def handle_admin_revoke_sessions(request: aiohttp.web.Request) -> aiohttp.web.Response:
    if not _admin_ok(request):
        return aiohttp.web.Response(status=403, text="admin access required")
    db: Any = request.app.get("db")
    if db is None:
        return aiohttp.web.Response(status=503, text="db unavailable")
    uid = request.match_info["user_id"]
    try:
        await db.execute("UPDATE sessions SET expires_at=NOW() WHERE user_id=$1::uuid", uid)
    except Exception as exc:
        logger.error(json.dumps({"event": "admin_revoke_sessions_error", "error": str(exc)})); return aiohttp.web.Response(status=500, text="internal error")
    await _publish(request.app.get("js"), "user.sessions_admin_revoked", {"user_id": uid})
    return aiohttp.web.json_response({"status": "all_sessions_revoked"})


async def handle_admin_force_deletion(request: aiohttp.web.Request) -> aiohttp.web.Response:
    if not _admin_ok(request):
        return aiohttp.web.Response(status=403, text="admin access required")
    db: Any = request.app.get("db")
    if db is None:
        return aiohttp.web.Response(status=503, text="db unavailable")
    uid = request.match_info["user_id"]
    try:
        await db.execute(
            "UPDATE users SET status='deleted', deletion_requested_at=COALESCE(deletion_requested_at, NOW()), deletion_grace_until=NOW() WHERE id=$1::uuid", uid)
        await db.execute("UPDATE sessions SET expires_at=NOW() WHERE user_id=$1::uuid", uid)
    except Exception as exc:
        logger.error(json.dumps({"event": "admin_force_deletion_error", "error": str(exc)})); return aiohttp.web.Response(status=500, text="internal error")
    await _publish(request.app.get("js"), "user.deleted", {"user_id": uid, "source": "admin"})
    logger.info(json.dumps({"event": "admin_force_deletion", "user_id": uid}))
    return aiohttp.web.json_response({"status": "deleted"})


def register_admin_routes(app: aiohttp.web.Application) -> None:
    app.router.add_get("/admin/users", handle_user_search)
    app.router.add_get("/admin/users/{user_id}", handle_user_detail)
    app.router.add_post("/admin/users/{user_id}/mfa-factors/{factor_id}/revoke", handle_admin_revoke_mfa)
    app.router.add_post("/admin/users/{user_id}/sessions/revoke-all", handle_admin_revoke_sessions)
    app.router.add_post("/admin/users/{user_id}/force-deletion", handle_admin_force_deletion)
