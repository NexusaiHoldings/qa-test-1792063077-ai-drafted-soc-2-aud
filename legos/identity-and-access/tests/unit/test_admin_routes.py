"""Tests for admin/routes.py — admin management endpoints (Sprint 2.3).

Mirrors the SS2.1/SS2.2 import pattern (hyphenated lego dir).
"""
import sys
import json
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import aiohttp.web

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from admin.routes import (  # type: ignore[import-not-found]
    handle_user_search, handle_user_detail,
    handle_admin_revoke_mfa, handle_admin_force_deletion,
)

_TOKEN = "secret_admin"; _UID = "00000000-0000-0000-0000-000000000001"; _FID = "00000000-0000-0000-0000-000000000002"


def _app(db=None, js=None):
    app = aiohttp.web.Application(); app["db"] = db; app["js"] = js; app["admin_token"] = _TOKEN; return app


def _req(app, *, match_info=None, authed=True, qs=""):
    req = MagicMock(spec=aiohttp.web.Request)
    req.app = app; req.headers = {"X-Admin-Token": _TOKEN} if authed else {}
    req.match_info = match_info or {}
    rel = MagicMock(); rel.query = dict(p.split("=", 1) for p in qs.split("&") if "=" in p); req.rel_url = rel
    return req


_USER_ROW = {"id": _UID, "email": "a@b.com", "status": "active", "created_at": "2026-01-01",
             "deletion_requested_at": None, "deletion_grace_until": None}


class TestUserSearch(unittest.IsolatedAsyncioTestCase):
    async def test_unauthenticated_403(self):
        resp = await handle_user_search(_req(_app(db=AsyncMock()), authed=False))
        self.assertEqual(resp.status, 403)

    async def test_returns_user_list(self):
        db = AsyncMock(); db.query = AsyncMock(return_value=[_USER_ROW])
        resp = await handle_user_search(_req(_app(db=db)))
        self.assertEqual(resp.status, 200); body = json.loads(resp.body)
        self.assertEqual(body["users"][0]["email"], "a@b.com")


class TestUserDetail(unittest.IsolatedAsyncioTestCase):
    async def test_returns_full_detail(self):
        db = AsyncMock()
        async def q(sql, *a):
            if "FROM users" in sql: return [_USER_ROW]
            return []
        db.query = AsyncMock(side_effect=q)
        resp = await handle_user_detail(_req(_app(db=db), match_info={"user_id": _UID}))
        self.assertEqual(resp.status, 200); body = json.loads(resp.body)
        self.assertIn("sessions", body); self.assertIn("mfa_factors", body); self.assertIn("oauth_identities", body)

    async def test_unknown_user_404(self):
        db = AsyncMock(); db.query = AsyncMock(return_value=[])
        resp = await handle_user_detail(_req(_app(db=db), match_info={"user_id": _UID}))
        self.assertEqual(resp.status, 404)


class TestAdminRevokeMfa(unittest.IsolatedAsyncioTestCase):
    async def test_revokes(self):
        db = AsyncMock(); db.execute = AsyncMock(return_value="UPDATE 1")
        resp = await handle_admin_revoke_mfa(_req(_app(db=db), match_info={"user_id": _UID, "factor_id": _FID}))
        self.assertEqual(resp.status, 200)

    async def test_not_found_404(self):
        db = AsyncMock(); db.execute = AsyncMock(return_value="UPDATE 0")
        resp = await handle_admin_revoke_mfa(_req(_app(db=db), match_info={"user_id": _UID, "factor_id": "bad"}))
        self.assertEqual(resp.status, 404)


class TestAdminForceDeletion(unittest.IsolatedAsyncioTestCase):
    async def test_marks_deleted(self):
        db = AsyncMock(); db.execute = AsyncMock(return_value="UPDATE 1")
        resp = await handle_admin_force_deletion(_req(_app(db=db), match_info={"user_id": _UID}))
        self.assertEqual(resp.status, 200); body = json.loads(resp.body)
        self.assertEqual(body["status"], "deleted"); self.assertEqual(db.execute.call_count, 2)
        self.assertIn("status='deleted'", db.execute.call_args_list[0][0][0])

    async def test_revoke_sessions_also_called(self):
        db = AsyncMock(); db.execute = AsyncMock(return_value="UPDATE 1")
        await handle_admin_force_deletion(_req(_app(db=db), match_info={"user_id": _UID}))
        second_call_sql = db.execute.call_args_list[1][0][0]
        self.assertIn("sessions", second_call_sql)


if __name__ == "__main__":
    unittest.main()
