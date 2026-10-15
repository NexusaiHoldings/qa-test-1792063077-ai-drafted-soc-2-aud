"""Unit tests for api/cookies.py."""
import asyncio
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import aiohttp.web

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from api.cookies import handle_give_consent, handle_get_current_consent

_USER = "user-0000-0000-0000-000000000001"
_ANON = "anon-abc123"


def _app(db=None, js=None, user_id=None):
    app = aiohttp.web.Application()
    app["db"] = db
    app["js"] = js
    if user_id:
        app["current_user_id"] = user_id
    return app


def _req(app, *, body=None, headers=None):
    req = MagicMock(spec=aiohttp.web.Request)
    req.app = app
    req.headers = headers or {}
    req.rel_url = MagicMock()
    req.rel_url.query = {}
    if body is not None:
        req.json = AsyncMock(return_value=body)
    return req


def run(c):
    return asyncio.run(c)


class TestGiveConsent(unittest.TestCase):
    def test_db_unavailable_503(self):
        resp = run(handle_give_consent(_req(_app(), body={"decision": "accepted_all", "anonymous_id": _ANON})))
        self.assertEqual(resp.status, 503)

    def test_invalid_decision_400(self):
        db = AsyncMock()
        resp = run(handle_give_consent(_req(_app(db=db), body={"decision": "maybe", "anonymous_id": _ANON})))
        self.assertEqual(resp.status, 400)
        self.assertIn("invalid decision", resp.text)

    def test_no_identity_400(self):
        db = AsyncMock()
        resp = run(handle_give_consent(_req(_app(db=db), body={"decision": "accepted_all"})))
        self.assertEqual(resp.status, 400)

    def test_accepted_all_authenticated(self):
        db = AsyncMock()
        db.execute = AsyncMock(return_value="INSERT 1")
        js = AsyncMock()
        js.publish = AsyncMock()
        resp = run(handle_give_consent(_req(_app(db=db, js=js, user_id=_USER), body={"decision": "accepted_all"})))
        self.assertEqual(resp.status, 200)
        data = json.loads(resp.body)
        self.assertEqual(data["decision"], "accepted_all")
        self.assertIn("consent_id", data)
        self.assertIn("expires_at", data)
        js.publish.assert_called_once()
        self.assertEqual(js.publish.call_args[0][0], "legal.cookie_consent_given")

    def test_rejected_all_publishes_declined_event(self):
        db = AsyncMock()
        db.execute = AsyncMock(return_value="INSERT 1")
        js = AsyncMock()
        js.publish = AsyncMock()
        resp = run(handle_give_consent(_req(_app(db=db, js=js, user_id=_USER), body={"decision": "rejected_all"})))
        self.assertEqual(resp.status, 200)
        self.assertEqual(js.publish.call_args[0][0], "legal.cookie_consent_declined")

    def test_anonymous_user_links_anonymous_id(self):
        db = AsyncMock()
        db.execute = AsyncMock(return_value="INSERT 1")
        body = {"decision": "rejected_all", "anonymous_id": _ANON}
        resp = run(handle_give_consent(_req(_app(db=db), body=body)))
        self.assertEqual(resp.status, 200)
        insert_sql = db.execute.call_args[0][0]
        self.assertIn("anonymous_id", insert_sql)

    def test_custom_with_categories(self):
        db = AsyncMock()
        db.execute = AsyncMock(return_value="INSERT 1")
        body = {"decision": "custom", "categories": {"essential": True, "analytics": True, "marketing": False}, "anonymous_id": _ANON}
        resp = run(handle_give_consent(_req(_app(db=db), body=body)))
        self.assertEqual(resp.status, 200)
        data = json.loads(resp.body)
        self.assertEqual(data["decision"], "custom")

    def test_expires_at_one_year(self):
        db = AsyncMock()
        db.execute = AsyncMock(return_value="INSERT 1")
        resp = run(handle_give_consent(_req(_app(db=db, user_id=_USER), body={"decision": "accepted_all"})))
        data = json.loads(resp.body)
        from datetime import datetime, timezone
        expires = datetime.fromisoformat(data["expires_at"])
        now = datetime.now(tz=timezone.utc)
        diff_days = (expires - now).days
        # Should be approximately 365 days (allow 1-day slack for test timing)
        self.assertGreaterEqual(diff_days, 364)
        self.assertLessEqual(diff_days, 366)


class TestGetCurrentConsent(unittest.TestCase):
    def test_db_unavailable_503(self):
        resp = run(handle_get_current_consent(_req(_app())))
        self.assertEqual(resp.status, 503)

    def test_no_consent_returns_null_with_default(self):
        db = AsyncMock()
        db.query = AsyncMock(return_value=[])
        resp = run(handle_get_current_consent(_req(_app(db=db, user_id=_USER))))
        self.assertEqual(resp.status, 200)
        data = json.loads(resp.body)
        self.assertIsNone(data["consent"])
        self.assertEqual(data["default"], "rejected_all")

    def test_authenticated_user_returns_consent(self):
        from datetime import datetime, timedelta, timezone
        now = datetime.now(tz=timezone.utc)
        db = AsyncMock()
        db.query = AsyncMock(return_value=[{
            "id": "con-001",
            "decision": "accepted_all",
            "categories": "{}",
            "given_at": now,
            "expires_at": now + timedelta(days=365),
        }])
        resp = run(handle_get_current_consent(_req(_app(db=db, user_id=_USER))))
        self.assertEqual(resp.status, 200)
        data = json.loads(resp.body)
        self.assertEqual(data["consent"]["decision"], "accepted_all")
