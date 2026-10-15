"""Tests for api/portal.py — Stripe Billing Portal session creation."""
from __future__ import annotations

import asyncio
import json
import sys
import unittest
import unittest.mock as mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from api.portal import handle_portal  # type: ignore[import-not-found]


def run(c):
    return asyncio.run(c)


def _app(*, db=None, js=None, user_id="user-1"):
    return {"db": db, "js": js, "authenticated_user_id": user_id}


def _req(body, *, app):
    r = mock.MagicMock()
    r.json = mock.AsyncMock(return_value=body)
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

    return mock.patch("api.portal.aiohttp.ClientSession", return_value=_MS())


class TestPortal(unittest.TestCase):
    def test_unauthenticated_401(self):
        resp = run(handle_portal(_req({"return_url": "https://app.test/account"},
                                       app=_app(db=mock.AsyncMock(), user_id=None))))
        self.assertEqual(resp.status, 401)

    def test_db_unavailable_503(self):
        resp = run(handle_portal(_req({"return_url": "x"}, app=_app(db=None))))
        self.assertEqual(resp.status, 503)

    def test_missing_return_url_400(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[{"stripe_customer_id": "cus_x"}])
        resp = run(handle_portal(_req({}, app=_app(db=db))))
        self.assertEqual(resp.status, 400)

    @mock.patch.dict("os.environ", {"STRIPE_SECRET_KEY": ""}, clear=False)
    def test_no_stripe_key_503(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[{"stripe_customer_id": "cus_x"}])
        resp = run(handle_portal(_req({"return_url": "x"}, app=_app(db=db))))
        self.assertEqual(resp.status, 503)

    @mock.patch.dict("os.environ", {"STRIPE_SECRET_KEY": "sk_test"}, clear=False)
    def test_no_billing_customer_404(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[])
        resp = run(handle_portal(_req({"return_url": "x"}, app=_app(db=db))))
        self.assertEqual(resp.status, 404)

    @mock.patch.dict("os.environ", {"STRIPE_SECRET_KEY": "sk_test"}, clear=False)
    def test_happy_path(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[{"stripe_customer_id": "cus_x"}])
        js = mock.AsyncMock()
        with _patch_stripe(200, {"url": "https://billing.stripe.com/p/session_xyz"}):
            resp = run(handle_portal(_req({"return_url": "https://app.test/account"},
                                           app=_app(db=db, js=js))))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        self.assertEqual(body["url"], "https://billing.stripe.com/p/session_xyz")
        published = [c[0][0] for c in js.publish.call_args_list]
        self.assertIn("billing.portal_session_created", published)

    @mock.patch.dict("os.environ", {"STRIPE_SECRET_KEY": "sk_test"}, clear=False)
    def test_stripe_error_502(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[{"stripe_customer_id": "cus_x"}])
        with _patch_stripe(500, {"error": "stripe down"}):
            resp = run(handle_portal(_req({"return_url": "x"}, app=_app(db=db))))
        self.assertEqual(resp.status, 502)


if __name__ == "__main__":
    unittest.main()
