"""Tests for api/oauth.py — OAuth provider handlers (Sprint 2.3).

Mirrors the SS2.1/SS2.2 import pattern: lego dir has a hyphen
(`legos/identity-and-access/`) which isn't a valid Python module name,
so sys.path.insert the lego root and import bare.
"""
import sys
import time
import json
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import aiohttp.web

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from api.oauth import _OAUTH_STATES, handle_oauth_start, handle_oauth_callback  # type: ignore[import-not-found]


def _app(db=None, js=None):
    app = aiohttp.web.Application()
    app["db"] = db; app["js"] = js; app["lego_config"] = {}; app["base_url"] = "http://localhost"
    return app


def _req(app, *, match_info=None, qs=""):
    req = MagicMock(spec=aiohttp.web.Request)
    req.app = app; req.match_info = match_info or {}
    rel = MagicMock()
    rel.query = dict(p.split("=", 1) for p in qs.split("&") if "=" in p)
    req.rel_url = rel
    return req


class TestOAuthStart(unittest.IsolatedAsyncioTestCase):
    async def test_stub_redirects_to_callback(self):
        req = _req(_app(), match_info={"provider": "google"})
        with patch.dict("os.environ", {"OAUTH_STUB_MODE": "true"}):
            resp = await handle_oauth_start(req)
        self.assertIsInstance(resp, aiohttp.web.HTTPFound)
        self.assertIn("/callback", resp.location)

    async def test_unknown_provider_404(self):
        resp = await handle_oauth_start(_req(_app(), match_info={"provider": "facebook"}))
        self.assertEqual(resp.status, 404)

    async def test_unconfigured_provider_503(self):
        req = _req(_app(), match_info={"provider": "google"})
        with patch.dict("os.environ", {"OAUTH_STUB_MODE": "false",
                                        "GOOGLE_OAUTH_CLIENT_ID": "", "GOOGLE_OAUTH_CLIENT_SECRET": ""}):
            resp = await handle_oauth_start(req)
        self.assertEqual(resp.status, 503)


class TestOAuthCallback(unittest.IsolatedAsyncioTestCase):
    def setUp(self): _OAUTH_STATES.clear()

    async def test_state_mismatch_400(self):
        _OAUTH_STATES["good"] = ("google", time.time() + 300)
        resp = await handle_oauth_callback(_req(_app(db=AsyncMock()), match_info={"provider": "google"}, qs="code=x&state=bad"))
        self.assertEqual(resp.status, 400)

    async def test_provider_error_400(self):
        resp = await handle_oauth_callback(_req(_app(db=AsyncMock()), match_info={"provider": "google"}, qs="error=denied&state="))
        self.assertEqual(resp.status, 400)

    async def test_stub_new_user_creates_session(self):
        db = AsyncMock(); db.query = AsyncMock(return_value=[]); db.execute = AsyncMock(return_value="INSERT 0 1")
        _OAUTH_STATES["st"] = ("github", time.time() + 300)
        with patch.dict("os.environ", {"OAUTH_STUB_MODE": "true"}):
            resp = await handle_oauth_callback(_req(_app(db=db), match_info={"provider": "github"}, qs="code=stub_code&state=st"))
        self.assertEqual(resp.status, 200)
        self.assertIn("session_token", json.loads(resp.body))

    async def test_stub_existing_user_returns_session(self):
        uid = "00000000-0000-0000-0000-000000000001"
        db = AsyncMock(); db.query = AsyncMock(return_value=[{"user_id": uid}]); db.execute = AsyncMock(return_value="INSERT 0 1")
        _OAUTH_STATES["st2"] = ("google", time.time() + 300)
        with patch.dict("os.environ", {"OAUTH_STUB_MODE": "true"}):
            resp = await handle_oauth_callback(_req(_app(db=db), match_info={"provider": "google"}, qs="code=stub_code&state=st2"))
        self.assertEqual(resp.status, 200)
        self.assertEqual(json.loads(resp.body)["user_id"], uid)

    async def test_expired_state_400(self):
        _OAUTH_STATES["ex"] = ("google", time.time() - 1)
        resp = await handle_oauth_callback(_req(_app(db=AsyncMock()), match_info={"provider": "google"}, qs="code=x&state=ex"))
        self.assertEqual(resp.status, 400)


if __name__ == "__main__":
    unittest.main()
