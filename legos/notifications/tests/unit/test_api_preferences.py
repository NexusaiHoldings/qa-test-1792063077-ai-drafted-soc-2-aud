"""Tests for api/preferences.py — preferences + web push registration."""
from __future__ import annotations

import asyncio
import json
import sys
import unittest
import unittest.mock as mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from api.preferences import (  # type: ignore[import-not-found]
    handle_get_preferences,
    handle_set_preference,
    handle_register_web_push,
)


def run(c):
    return asyncio.run(c)


def _app(*, db=None, js=None, user_id="user-1"):
    return {"db": db, "js": js, "authenticated_user_id": user_id}


def _req(body, *, app, headers=None):
    r = mock.MagicMock()
    r.json = mock.AsyncMock(return_value=body)
    r.app = app
    r.headers = headers or {}
    return r


class TestGetPreferences(unittest.TestCase):
    def test_unauthenticated_401(self):
        resp = run(handle_get_preferences(_req({}, app=_app(db=mock.AsyncMock(), user_id=None))))
        self.assertEqual(resp.status, 401)

    def test_returns_preferences(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[
            {"channel": "email", "category": "billing", "enabled": True},
            {"channel": "sms", "category": "billing", "enabled": False},
        ])
        resp = run(handle_get_preferences(_req({}, app=_app(db=db))))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        self.assertEqual(len(body["preferences"]), 2)


class TestSetPreference(unittest.TestCase):
    def test_unauthenticated_401(self):
        resp = run(handle_set_preference(_req({"preferences": []},
                                                app=_app(db=mock.AsyncMock(), user_id=None))))
        self.assertEqual(resp.status, 401)

    def test_invalid_body_400(self):
        db = mock.AsyncMock()
        resp = run(handle_set_preference(_req({"preferences": "not-a-list"}, app=_app(db=db))))
        self.assertEqual(resp.status, 400)

    def test_bulk_set(self):
        db = mock.AsyncMock()
        db.execute = mock.AsyncMock(return_value="INSERT 0 1")
        js = mock.AsyncMock()
        resp = run(handle_set_preference(_req({"preferences": [
            {"channel": "email", "category": "billing", "enabled": False},
            {"channel": "sms", "category": "security", "enabled": True},
        ]}, app=_app(db=db, js=js))))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        self.assertEqual(body["updates_applied"], 2)

    def test_invalid_channel_skipped(self):
        db = mock.AsyncMock()
        db.execute = mock.AsyncMock(return_value="INSERT 0 1")
        resp = run(handle_set_preference(_req({"preferences": [
            {"channel": "fax", "category": "billing", "enabled": False},
            {"channel": "email", "category": "billing", "enabled": True},
        ]}, app=_app(db=db))))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        self.assertEqual(body["updates_applied"], 1)


class TestRegisterWebPush(unittest.TestCase):
    def test_missing_fields_400(self):
        db = mock.AsyncMock()
        resp = run(handle_register_web_push(_req({"endpoint": "https://x"},
                                                   app=_app(db=db))))
        self.assertEqual(resp.status, 400)

    def test_register(self):
        db = mock.AsyncMock()
        db.execute = mock.AsyncMock(return_value="INSERT 0 1")
        resp = run(handle_register_web_push(_req({
            "endpoint": "https://push.example.com/endpoint/abc",
            "p256dh": "BNc...",
            "auth": "auth123",
        }, app=_app(db=db), headers={"User-Agent": "TestAgent"})))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        self.assertTrue(body["registered"])

    def test_unauthenticated_401(self):
        resp = run(handle_register_web_push(_req({}, app=_app(db=mock.AsyncMock(), user_id=None))))
        self.assertEqual(resp.status, 401)


if __name__ == "__main__":
    unittest.main()
