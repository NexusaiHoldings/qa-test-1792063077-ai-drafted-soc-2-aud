"""Tests for api/subscriptions.py — GET / cancel / resume."""
from __future__ import annotations

import asyncio
import datetime
import json
import sys
import unittest
import unittest.mock as mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from api.subscriptions import (  # type: ignore[import-not-found]
    handle_get_subscription,
    handle_cancel_subscription,
    handle_resume_subscription,
)


def run(c):
    return asyncio.run(c)


def _now() -> datetime.datetime:
    return datetime.datetime(2026, 5, 9, 12, 0, tzinfo=datetime.timezone.utc)


def _sub_row(*, status="active", cancel_at_period_end=False):
    return {
        "id": "sub-uuid",
        "stripe_subscription_id": "sub_stripe123",
        "tier_name": "pro",
        "status": status,
        "current_period_start": _now(),
        "current_period_end": _now() + datetime.timedelta(days=30),
        "cancel_at_period_end": cancel_at_period_end,
        "trial_end": None,
    }


def _app(*, db=None, js=None, user_id="user-1"):
    return {"db": db, "js": js, "authenticated_user_id": user_id}


def _req(app):
    r = mock.MagicMock()
    r.app = app
    return r


def _patch_stripe(status, body):
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

    return mock.patch("api.subscriptions.aiohttp.ClientSession", return_value=_MS())


class TestGetSubscription(unittest.TestCase):
    def test_returns_active_subscription(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[_sub_row()])
        resp = run(handle_get_subscription(_req(_app(db=db))))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        self.assertEqual(body["subscription"]["tier_name"], "pro")
        self.assertEqual(body["subscription"]["status"], "active")

    def test_no_subscription_returns_null(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[])
        resp = run(handle_get_subscription(_req(_app(db=db))))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        self.assertIsNone(body["subscription"])

    def test_unauthenticated_401(self):
        resp = run(handle_get_subscription(_req(_app(db=mock.AsyncMock(), user_id=None))))
        self.assertEqual(resp.status, 401)

    def test_db_unavailable_503(self):
        resp = run(handle_get_subscription(_req(_app(db=None))))
        self.assertEqual(resp.status, 503)


class TestCancelSubscription(unittest.TestCase):
    @mock.patch.dict("os.environ", {"STRIPE_SECRET_KEY": "sk_test"}, clear=False)
    def test_happy_path(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[_sub_row()])
        db.execute = mock.AsyncMock(return_value="UPDATE 1")
        js = mock.AsyncMock()
        with _patch_stripe(200, {"id": "sub_stripe123", "cancel_at_period_end": True}):
            resp = run(handle_cancel_subscription(_req(_app(db=db, js=js))))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        self.assertEqual(body["status"], "cancellation_scheduled")
        # Verify NATS publish happened
        published_subjects = [c[0][0] for c in js.publish.call_args_list]
        self.assertIn("billing.subscription_cancelled", published_subjects)

    @mock.patch.dict("os.environ", {"STRIPE_SECRET_KEY": "sk_test"}, clear=False)
    def test_no_active_subscription_404(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[])
        resp = run(handle_cancel_subscription(_req(_app(db=db))))
        self.assertEqual(resp.status, 404)

    @mock.patch.dict("os.environ", {"STRIPE_SECRET_KEY": ""}, clear=False)
    def test_no_stripe_key_503(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[_sub_row()])
        resp = run(handle_cancel_subscription(_req(_app(db=db))))
        self.assertEqual(resp.status, 503)

    @mock.patch.dict("os.environ", {"STRIPE_SECRET_KEY": "sk_test"}, clear=False)
    def test_stripe_failure_502(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[_sub_row()])
        with _patch_stripe(400, {"error": "bad"}):
            resp = run(handle_cancel_subscription(_req(_app(db=db))))
        self.assertEqual(resp.status, 502)

    def test_unauthenticated_401(self):
        resp = run(handle_cancel_subscription(_req(_app(db=mock.AsyncMock(), user_id=None))))
        self.assertEqual(resp.status, 401)


class TestResumeSubscription(unittest.TestCase):
    @mock.patch.dict("os.environ", {"STRIPE_SECRET_KEY": "sk_test"}, clear=False)
    def test_happy_path(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[_sub_row(cancel_at_period_end=True)])
        db.execute = mock.AsyncMock(return_value="UPDATE 1")
        js = mock.AsyncMock()
        with _patch_stripe(200, {"id": "sub_stripe123", "cancel_at_period_end": False}):
            resp = run(handle_resume_subscription(_req(_app(db=db, js=js))))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        self.assertEqual(body["status"], "resumed")

    @mock.patch.dict("os.environ", {"STRIPE_SECRET_KEY": "sk_test"}, clear=False)
    def test_no_active_subscription_404(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[])
        resp = run(handle_resume_subscription(_req(_app(db=db))))
        self.assertEqual(resp.status, 404)

    @mock.patch.dict("os.environ", {"STRIPE_SECRET_KEY": "sk_test"}, clear=False)
    def test_not_pending_cancellation_400(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[_sub_row(cancel_at_period_end=False)])
        resp = run(handle_resume_subscription(_req(_app(db=db))))
        self.assertEqual(resp.status, 400)


if __name__ == "__main__":
    unittest.main()
