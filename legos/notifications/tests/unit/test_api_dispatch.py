"""Tests for api/dispatch.py — notification render + dispatch."""
from __future__ import annotations

import asyncio
import json
import sys
import unittest
import unittest.mock as mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from api.dispatch import (  # type: ignore[import-not-found]
    _render_template,
    handle_send,
    handle_inbox,
    handle_mark_read,
)


def run(c):
    return asyncio.run(c)


def _app(*, db=None, js=None, user_id="user-1"):
    return {
        "db": db, "js": js,
        "authenticated_user_id": user_id,
        "lego_config": {
            "resend_from_email": "notifications@example.com",
            "default_channels": ["email", "in_app"],
            "rate_limit_per_user_per_hour": 30,
        },
    }


def _req(body, *, app, match_info=None):
    r = mock.MagicMock()
    r.json = mock.AsyncMock(return_value=body)
    r.app = app
    r.match_info = match_info or {}
    return r


class TestRenderTemplate(unittest.TestCase):
    def test_substitutes_simple_var(self):
        subject, body = _render_template("welcome", {"first_name": "Alice"},
                                          "<h2>Welcome, {{first_name}}!</h2><p>Hi.</p>")
        self.assertEqual(subject, "Welcome, Alice!")
        self.assertIn("Welcome, Alice!", body)

    def test_substitutes_spaced_var(self):
        subject, body = _render_template("t", {"name": "Bob"},
                                          "<h2>Hi {{ name }}</h2>")
        self.assertEqual(subject, "Hi Bob")

    def test_no_h2_uses_template_name(self):
        subject, body = _render_template("welcome", {}, "<p>No header.</p>")
        self.assertEqual(subject, "welcome")

    def test_subject_caps_at_200(self):
        long = "<h2>" + "x" * 300 + "</h2>"
        subject, _ = _render_template("t", {}, long)
        self.assertLessEqual(len(subject), 200)


def _patch_resend(status, body):
    class _MR:
        def __init__(self, s, b):
            self.status = s
            self._body = b
        async def __aenter__(self):
            return self
        async def __aexit__(self, *a):
            return None
        async def json(self):
            return self._body

    class _MS:
        async def __aenter__(self):
            return self
        async def __aexit__(self, *a):
            return None
        def post(self, *args, **kwargs):
            return _MR(status, body)

    return mock.patch("api.dispatch.aiohttp.ClientSession", return_value=_MS())


class TestHandleSend(unittest.TestCase):
    def test_db_unavailable_503(self):
        resp = run(handle_send(_req({"user_id": "u", "template_name": "t", "html_template": "x"},
                                     app=_app(db=None))))
        self.assertEqual(resp.status, 503)

    def test_missing_required_fields_400(self):
        db = mock.AsyncMock()
        resp = run(handle_send(_req({"user_id": "u"}, app=_app(db=db))))
        self.assertEqual(resp.status, 400)

    @mock.patch.dict("os.environ", {"RESEND_API_KEY": "re_test"}, clear=False)
    def test_email_in_app_dispatch(self):
        db = mock.AsyncMock()
        # No user prefs row → falls back to default_channels (email + in_app)
        db.query = mock.AsyncMock(return_value=[])
        db.execute = mock.AsyncMock(return_value="INSERT 0 1")
        js = mock.AsyncMock()
        with _patch_resend(200, {"id": "msg_xyz"}):
            resp = run(handle_send(_req({
                "user_id": "user-1",
                "template_name": "test",
                "category": "transactional",
                "variables": {"name": "Bob"},
                "to_email": "u@e.c",
                "html_template": "<h2>Hello {{name}}</h2>",
            }, app=_app(db=db, js=js))))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        channels_dispatched = [d["channel"] for d in body["dispatched"]]
        self.assertIn("email", channels_dispatched)
        self.assertIn("in_app", channels_dispatched)

    @mock.patch.dict("os.environ", {"RESEND_API_KEY": "re_test"}, clear=False)
    def test_email_skipped_without_to_email(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[])
        db.execute = mock.AsyncMock(return_value="INSERT 0 1")
        js = mock.AsyncMock()
        resp = run(handle_send(_req({
            "user_id": "user-1",
            "template_name": "test",
            "html_template": "<h2>Hi</h2>",
        }, app=_app(db=db, js=js))))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        skipped_channels = [s["channel"] for s in body["skipped"]]
        self.assertIn("email", skipped_channels)

    @mock.patch.dict("os.environ", {"RESEND_API_KEY": ""}, clear=False)
    def test_resend_not_configured_skips_email(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[])
        db.execute = mock.AsyncMock(return_value="INSERT 0 1")
        resp = run(handle_send(_req({
            "user_id": "user-1",
            "template_name": "test",
            "to_email": "u@e.c",
            "html_template": "<h2>Hi</h2>",
        }, app=_app(db=db))))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        skipped = [s["reason"] for s in body["skipped"]]
        self.assertIn("resend_not_configured", skipped)


class TestInbox(unittest.TestCase):
    def test_unauthenticated_401(self):
        resp = run(handle_inbox(_req({}, app=_app(db=mock.AsyncMock(), user_id=None))))
        self.assertEqual(resp.status, 401)

    def test_returns_inbox(self):
        import datetime
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[
            {
                "id": "n1", "template_name": "welcome", "category": "transactional",
                "payload": {"subject": "Hi", "body": "<p>Welcome</p>"},
                "opened_at": None,
                "created_at": datetime.datetime(2026, 5, 9, 12, tzinfo=datetime.timezone.utc),
            },
        ])
        resp = run(handle_inbox(_req({}, app=_app(db=db))))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        self.assertEqual(len(body["items"]), 1)
        self.assertEqual(body["unread_count"], 1)


class TestMarkRead(unittest.TestCase):
    def test_unauthenticated_401(self):
        resp = run(handle_mark_read(_req({}, app=_app(db=mock.AsyncMock(), user_id=None),
                                          match_info={"id": "n1"})))
        self.assertEqual(resp.status, 401)

    def test_marks_read(self):
        db = mock.AsyncMock()
        db.execute = mock.AsyncMock(return_value="UPDATE 1")
        js = mock.AsyncMock()
        resp = run(handle_mark_read(_req({}, app=_app(db=db, js=js),
                                          match_info={"id": "n1"})))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        self.assertTrue(body["marked_read"])

    def test_already_read_returns_false(self):
        db = mock.AsyncMock()
        db.execute = mock.AsyncMock(return_value="UPDATE 0")
        resp = run(handle_mark_read(_req({}, app=_app(db=db),
                                          match_info={"id": "n1"})))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        self.assertFalse(body["marked_read"])


if __name__ == "__main__":
    unittest.main()
