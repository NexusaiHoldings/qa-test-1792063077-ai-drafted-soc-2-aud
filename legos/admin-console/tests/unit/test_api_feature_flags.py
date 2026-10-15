"""Unit tests for api/feature_flags.py."""
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock
import aiohttp.web

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from api.feature_flags import handle_list_flags, handle_get_flag, handle_create_flag, handle_update_flag, handle_delete_flag

_TOKEN = "tok"; _KEY = "dark-mode"
_FLAG = {"id": "00000000-0000-0000-0000-000000000001", "key": _KEY, "enabled": False,
         "description": "Dark mode", "rollout_percent": 0, "target_segments": []}


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


class TestFlagsCRUD(unittest.IsolatedAsyncioTestCase):
    async def test_list_returns_flags(self):
        db = AsyncMock(); db.query = AsyncMock(return_value=[_FLAG])
        resp = await handle_list_flags(_req(_app(db=db)))
        self.assertEqual(resp.status, 200); self.assertEqual(json.loads(resp.body)["flags"][0]["key"], _KEY)

    async def test_get_not_found_404(self):
        db = AsyncMock(); db.query = AsyncMock(return_value=[])
        self.assertEqual((await handle_get_flag(_req(_app(db=db), match_info={"key": "nope"}))).status, 404)

    async def test_create_201_and_audit(self):
        db = AsyncMock(); db.execute = AsyncMock(return_value="INSERT 1")
        resp = await handle_create_flag(_req(_app(db=db), body={"key": _KEY}))
        self.assertEqual(resp.status, 201)
        audit_calls = [c for c in db.execute.call_args_list if "admin_audit_log" in c[0][0]]
        self.assertEqual(len(audit_calls), 1)

    async def test_invalid_rollout_400(self):
        db = AsyncMock()
        self.assertEqual((await handle_create_flag(_req(_app(db=db), body={"key": _KEY, "rollout_percent": 150}))).status, 400)
        self.assertEqual((await handle_update_flag(_req(_app(db=db), body={"rollout_percent": -1}, match_info={"key": _KEY}))).status, 400)

    async def test_update_not_found_404(self):
        db = AsyncMock(); db.execute = AsyncMock(return_value="UPDATE 0")
        self.assertEqual((await handle_update_flag(_req(_app(db=db), body={"enabled": False}, match_info={"key": "nope"}))).status, 404)

    async def test_delete_not_found_404(self):
        db = AsyncMock(); db.execute = AsyncMock(return_value="DELETE 0")
        self.assertEqual((await handle_delete_flag(_req(_app(db=db), match_info={"key": "nope"}))).status, 404)

    async def test_unauthenticated_403(self):
        db = AsyncMock()
        self.assertEqual((await handle_list_flags(_req(_app(db=db), authed=False))).status, 403)


if __name__ == "__main__":
    unittest.main()
