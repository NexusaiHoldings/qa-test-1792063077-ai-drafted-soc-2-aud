"""Unit tests for api/system_config.py."""
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock
import aiohttp.web

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from api.system_config import handle_list_config, handle_get_config, handle_put_config

_TOKEN = "tok"
_PLAIN = {"key": "app_name", "value": "Nexus", "updated_at": "2026-01-01 00:00:00"}
_SECRET = {"key": "stripe_api_key", "value": "sk_live_abc", "updated_at": "2026-01-01 00:00:00"}
_PW = {"key": "db_password", "value": "hunter2", "updated_at": "2026-01-01"}


def _app(db=None):
    app = aiohttp.web.Application()
    app["db"] = db; app["js"] = None; app["admin_token"] = _TOKEN
    app["admin_user_id"] = "00000000-0000-0000-0000-000000000002"
    return app


def _req(app, *, body=None, match_info=None, authed=True):
    req = MagicMock(spec=aiohttp.web.Request)
    req.app = app; req.headers = {"X-Admin-Token": _TOKEN} if authed else {}
    req.match_info = match_info or {}
    if body is not None: req.json = AsyncMock(return_value=body)
    return req


class TestSystemConfig(unittest.IsolatedAsyncioTestCase):
    async def test_redacts_api_key(self):
        db = AsyncMock(); db.query = AsyncMock(return_value=[_SECRET])
        body = json.loads((await handle_list_config(_req(_app(db=db)))).body)
        self.assertEqual(body["config"][0]["value"], "<redacted>")

    async def test_plain_value_not_redacted(self):
        db = AsyncMock(); db.query = AsyncMock(return_value=[_PLAIN])
        body = json.loads((await handle_list_config(_req(_app(db=db)))).body)
        self.assertEqual(body["config"][0]["value"], "Nexus")

    async def test_get_redacts_password(self):
        db = AsyncMock(); db.query = AsyncMock(return_value=[_PW])
        resp = await handle_get_config(_req(_app(db=db), match_info={"key": "db_password"}))
        self.assertEqual(json.loads(resp.body)["value"], "<redacted>")

    async def test_get_not_found_404(self):
        db = AsyncMock(); db.query = AsyncMock(return_value=[])
        self.assertEqual((await handle_get_config(_req(_app(db=db), match_info={"key": "nope"}))).status, 404)

    async def test_put_sets_value_and_audit(self):
        db = AsyncMock(); db.execute = AsyncMock(return_value="INSERT 1")
        resp = await handle_put_config(_req(_app(db=db), body={"value": "v2"}, match_info={"key": "app_name"}))
        self.assertEqual(json.loads(resp.body)["status"], "updated")
        audit_calls = [c for c in db.execute.call_args_list if "admin_audit_log" in c[0][0]]
        self.assertEqual(len(audit_calls), 1)

    async def test_put_missing_value_400(self):
        db = AsyncMock()
        self.assertEqual((await handle_put_config(_req(_app(db=db), body={}, match_info={"key": "k"}))).status, 400)

    async def test_unauthenticated_403(self):
        db = AsyncMock()
        self.assertEqual((await handle_list_config(_req(_app(db=db), authed=False))).status, 403)


if __name__ == "__main__":
    unittest.main()
