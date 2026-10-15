"""Tests for api/account.py — account lifecycle endpoints (Sprint 2.3).

Mirrors the SS2.1/SS2.2 import pattern (hyphenated lego dir).
"""
import sys
import json
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import aiohttp.web

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from api.account import (  # type: ignore[import-not-found]
    handle_delete_account, handle_cancel_deletion,
    handle_list_sessions, handle_revoke_session,
)

_UID = "00000000-0000-0000-0000-000000000001"


def _app(db=None, js=None):
    app = aiohttp.web.Application(); app["db"] = db; app["js"] = js; return app


def _req(app, *, match_info=None, token="tok"):
    req = MagicMock(spec=aiohttp.web.Request)
    req.app = app; req.headers = {"Authorization": f"Bearer {token}"}; req.match_info = match_info or {}
    return req


def _db_authed(extra_rows=None):
    db = AsyncMock()
    async def q(sql, *a):
        if "JOIN users" in sql: return [{"user_id": _UID}]
        return extra_rows or []
    db.query = AsyncMock(side_effect=q); db.execute = AsyncMock(return_value="UPDATE 1")
    return db


class TestDeleteAccount(unittest.IsolatedAsyncioTestCase):
    async def test_schedules_deletion(self):
        db = _db_authed(); app = _app(db=db); resp = await handle_delete_account(_req(app))
        self.assertEqual(resp.status, 200); body = json.loads(resp.body)
        self.assertEqual(body["grace_days"], 30)
        self.assertIn("deletion_requested_at", db.execute.call_args[0][0])

    async def test_unauthenticated_401(self):
        db = AsyncMock(); db.query = AsyncMock(return_value=[])
        resp = await handle_delete_account(_req(_app(db=db)))
        self.assertEqual(resp.status, 401)


class TestCancelDeletion(unittest.IsolatedAsyncioTestCase):
    async def test_cancel_active_deletion(self):
        db = AsyncMock()
        async def q(sql, *a):
            if "JOIN users" in sql: return [{"user_id": _UID}]
            return [{"deletion_grace_until": "2026-06-08", "status": "active"}]
        db.query = AsyncMock(side_effect=q); db.execute = AsyncMock(return_value="UPDATE 1")
        resp = await handle_cancel_deletion(_req(_app(db=db)))
        self.assertEqual(resp.status, 200)
        self.assertEqual(json.loads(resp.body)["status"], "deletion_cancelled")

    async def test_already_deleted_410(self):
        db = AsyncMock()
        async def q(sql, *a):
            if "JOIN users" in sql: return [{"user_id": _UID}]
            return [{"deletion_grace_until": "2026-01-01", "status": "deleted"}]
        db.query = AsyncMock(side_effect=q)
        resp = await handle_cancel_deletion(_req(_app(db=db)))
        self.assertEqual(resp.status, 410)

    async def test_no_deletion_pending_400(self):
        db = AsyncMock()
        async def q(sql, *a):
            if "JOIN users" in sql: return [{"user_id": _UID}]
            return [{"deletion_grace_until": None, "status": "active"}]
        db.query = AsyncMock(side_effect=q)
        resp = await handle_cancel_deletion(_req(_app(db=db)))
        self.assertEqual(resp.status, 400)


class TestSessionList(unittest.IsolatedAsyncioTestCase):
    async def test_returns_session_list(self):
        session = {"id": "s1", "ip_address": "1.2.3.4", "user_agent": "UA", "created_at": "2026-01-01", "last_used_at": None}
        db = _db_authed(extra_rows=[session])
        resp = await handle_list_sessions(_req(_app(db=db)))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        self.assertEqual(len(body["sessions"]), 1)
        self.assertEqual(body["sessions"][0]["ip_address"], "1.2.3.4")


class TestSessionRevoke(unittest.IsolatedAsyncioTestCase):
    async def test_revoke_success(self):
        resp = await handle_revoke_session(_req(_app(db=_db_authed()), match_info={"session_id": "s1"}))
        self.assertEqual(resp.status, 200)

    async def test_revoke_not_found_404(self):
        db = AsyncMock()
        async def q(sql, *a):
            if "JOIN users" in sql: return [{"user_id": _UID}]
            return []
        db.query = AsyncMock(side_effect=q); db.execute = AsyncMock(return_value="UPDATE 0")
        resp = await handle_revoke_session(_req(_app(db=db), match_info={"session_id": "bad"}))
        self.assertEqual(resp.status, 404)


if __name__ == "__main__":
    unittest.main()
