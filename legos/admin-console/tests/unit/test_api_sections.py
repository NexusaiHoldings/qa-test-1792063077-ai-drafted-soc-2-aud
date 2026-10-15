"""Unit tests for api/sections.py."""
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock
import aiohttp.web

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from api.sections import handle_list_sections, handle_register_section, handle_unregister_section

_TOKEN = "tok"; _LEGO = "identity-and-access"
_ROW = {"id": "00000000-0000-0000-0000-000000000001", "lego_name": _LEGO, "section_name": "Users",
        "section_order": 1, "permissions": ["admin", "owner"], "routes": ["/admin/users"]}


def _app(db=None, roles=None):
    app = aiohttp.web.Application(); app["db"] = db; app["js"] = None; app["admin_token"] = _TOKEN
    if roles is not None: app["user_roles"] = roles
    return app


def _req(app, *, authed=True, body=None, match_info=None):
    req = MagicMock(spec=aiohttp.web.Request)
    req.app = app; req.headers = {"X-Admin-Token": _TOKEN} if authed else {}
    req.match_info = match_info or {}
    if body is not None: req.json = AsyncMock(return_value=body)
    return req


class TestListSections(unittest.IsolatedAsyncioTestCase):
    async def test_unauthenticated_403(self):
        self.assertEqual((await handle_list_sections(_req(_app(db=AsyncMock()), authed=False))).status, 403)

    async def test_db_none_503(self):
        self.assertEqual((await handle_list_sections(_req(_app()))).status, 503)

    async def test_returns_sections(self):
        db = AsyncMock(); db.query = AsyncMock(return_value=[_ROW])
        resp = await handle_list_sections(_req(_app(db=db)))
        self.assertEqual(resp.status, 200)
        self.assertEqual(json.loads(resp.body)["sections"][0]["section_name"], "Users")

    async def test_rbac_filters_viewer_and_allows_admin(self):
        db = AsyncMock(); db.query = AsyncMock(return_value=[_ROW])
        self.assertEqual(len(json.loads((await handle_list_sections(_req(_app(db=db, roles=["viewer"])))).body)["sections"]), 0)
        self.assertEqual(len(json.loads((await handle_list_sections(_req(_app(db=db, roles=["admin"])))).body)["sections"]), 1)


class TestRegisterSection(unittest.IsolatedAsyncioTestCase):
    async def test_missing_fields_400(self):
        self.assertEqual((await handle_register_section(_req(_app(db=AsyncMock()), body={"lego_name": _LEGO}))).status, 400)

    async def test_registers_with_upsert(self):
        db = AsyncMock(); db.execute = AsyncMock(return_value="INSERT 1")
        body = {"lego_name": _LEGO, "section_name": "Users", "section_order": 1, "permissions": ["admin"], "routes": ["/admin/users"]}
        resp = await handle_register_section(_req(_app(db=db), body=body))
        self.assertEqual(json.loads(resp.body)["status"], "registered")
        self.assertIn("ON CONFLICT", db.execute.call_args[0][0])

    async def test_unregisters(self):
        db = AsyncMock(); db.execute = AsyncMock(return_value="DELETE 1")
        resp = await handle_unregister_section(_req(_app(db=db), match_info={"lego_name": _LEGO}))
        self.assertEqual(json.loads(resp.body)["status"], "unregistered")


if __name__ == "__main__":
    unittest.main()
