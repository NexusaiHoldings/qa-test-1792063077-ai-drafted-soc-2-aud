"""Unit tests for api/audit_log.py."""
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock
import aiohttp.web

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from api.audit_log import handle_list_audit

_TOKEN = "tok"
_ENTRY = {"id": "00000000-0000-0000-0000-000000000001", "admin_user_id": "00000000-0000-0000-0000-000000000002",
          "action": "create_flag", "target_type": "feature_flag", "target_id": "dark-mode",
          "payload": {"key": "dark-mode"}, "performed_at": "2026-01-01 00:00:00"}


def _app(db=None):
    app = aiohttp.web.Application(); app["db"] = db; app["admin_token"] = _TOKEN; return app


def _req(app, *, authed=True, qs=""):
    req = MagicMock(spec=aiohttp.web.Request)
    req.app = app; req.headers = {"X-Admin-Token": _TOKEN} if authed else {}
    rel = MagicMock(); rel.query = dict(p.split("=", 1) for p in qs.split("&") if "=" in p); req.rel_url = rel
    return req


class TestListAudit(unittest.IsolatedAsyncioTestCase):
    async def test_unauthenticated_403(self):
        self.assertEqual((await handle_list_audit(_req(_app(db=AsyncMock()), authed=False))).status, 403)

    async def test_db_none_503(self):
        self.assertEqual((await handle_list_audit(_req(_app()))).status, 503)

    async def test_returns_entries_with_pagination(self):
        db = AsyncMock(); db.query = AsyncMock(return_value=[_ENTRY])
        resp = await handle_list_audit(_req(_app(db=db), qs="limit=10&offset=0"))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        self.assertEqual(body["entries"][0]["action"], "create_flag")
        self.assertEqual(body["limit"], 10); self.assertEqual(body["offset"], 0)

    async def test_filter_by_action_in_sql(self):
        db = AsyncMock(); db.query = AsyncMock(return_value=[])
        await handle_list_audit(_req(_app(db=db), qs="action=create_flag"))
        self.assertIn("action=", db.query.call_args[0][0])

    async def test_filter_by_target_type(self):
        db = AsyncMock(); db.query = AsyncMock(return_value=[])
        await handle_list_audit(_req(_app(db=db), qs="target_type=feature_flag"))
        self.assertIn("target_type=", db.query.call_args[0][0])


if __name__ == "__main__":
    unittest.main()
