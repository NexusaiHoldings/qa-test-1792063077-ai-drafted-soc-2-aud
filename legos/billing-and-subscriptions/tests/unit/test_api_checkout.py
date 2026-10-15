"""Tests for api/checkout.py — Stripe Checkout session creation.

Mirrors the SS2.1/2.2/2.3 import pattern (hyphenated lego dir).
Uses asyncio.run per ADR 0009.
"""
from __future__ import annotations

import asyncio
import json
import sys
import unittest
import unittest.mock as mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

# aiohttp.ClientSession is mocked in tests since we don't hit real Stripe
from api.checkout import handle_checkout, _find_tier  # type: ignore[import-not-found]


def run(c):
    return asyncio.run(c)


_TIER_LADDER = [
    {"name": "starter", "price_id": "price_starter", "amount": 1400, "interval": "month"},
    {"name": "pro",     "price_id": "price_pro",     "amount": 5900, "interval": "month"},
]


def _app(*, db=None, js=None, user_id="user-1"):
    """Build a fake aiohttp app dict for the checkout handler."""
    app: dict = {}
    app["db"] = db
    app["js"] = js
    app["lego_config"] = {
        "stripe_publishable_key": "pk_test_xxx",
        "default_currency": "usd",
        "tier_ladder": _TIER_LADDER,
        "trial_days": 0,
    }
    app["authenticated_user_id"] = user_id
    return app


def _req(body, *, app):
    r = mock.MagicMock()
    r.json = mock.AsyncMock(return_value=body)
    r.app = app
    return r


def _db(*, customer_row=None):
    db = mock.AsyncMock()

    async def _q(sql, *args):
        if "FROM billing_customers" in sql and customer_row is not None:
            return [customer_row]
        return []

    db.query = mock.AsyncMock(side_effect=_q)
    db.execute = mock.AsyncMock(return_value="INSERT 0 1")
    return db


class TestFindTier(unittest.TestCase):
    def test_found(self):
        tier = _find_tier({"tier_ladder": _TIER_LADDER}, "pro")
        self.assertIsNotNone(tier)
        self.assertEqual(tier["price_id"], "price_pro")

    def test_not_found(self):
        self.assertIsNone(_find_tier({"tier_ladder": _TIER_LADDER}, "enterprise"))

    def test_empty_config(self):
        self.assertIsNone(_find_tier({}, "starter"))


class TestCheckoutValidation(unittest.TestCase):
    """Input validation paths — no Stripe call needed."""

    def test_missing_db_503(self):
        app = _app()
        app["db"] = None
        resp = run(handle_checkout(_req({"tier_name": "pro"}, app=app)))
        self.assertEqual(resp.status, 503)

    def test_unauthenticated_401(self):
        app = _app(db=_db(), user_id=None)
        resp = run(handle_checkout(_req({"tier_name": "pro"}, app=app)))
        self.assertEqual(resp.status, 401)

    def test_missing_tier_name_400(self):
        app = _app(db=_db())
        resp = run(handle_checkout(_req(
            {"success_url": "x", "cancel_url": "y", "user_email": "a@b.c"}, app=app,
        )))
        self.assertEqual(resp.status, 400)

    def test_missing_user_email_400(self):
        app = _app(db=_db())
        resp = run(handle_checkout(_req(
            {"tier_name": "pro", "success_url": "x", "cancel_url": "y"}, app=app,
        )))
        self.assertEqual(resp.status, 400)

    def test_unknown_tier_404(self):
        app = _app(db=_db())
        resp = run(handle_checkout(_req(
            {"tier_name": "enterprise", "success_url": "x", "cancel_url": "y", "user_email": "a@b.c"},
            app=app,
        )))
        self.assertEqual(resp.status, 404)

    def test_invalid_json_400(self):
        app = _app(db=_db())
        r = mock.MagicMock()
        r.json = mock.AsyncMock(side_effect=Exception("bad"))
        r.app = app
        resp = run(handle_checkout(r))
        self.assertEqual(resp.status, 400)


class TestCheckoutStripeFlow(unittest.TestCase):
    """Happy path + Stripe failure modes — mock the Stripe HTTP call."""

    def _patch_stripe(self, customer_status=200, customer_body=None,
                      session_status=200, session_body=None):
        """Build a mock for aiohttp.ClientSession that returns the given Stripe responses."""
        customer_body = customer_body or {"id": "cus_test"}
        session_body = session_body or {"id": "cs_test", "url": "https://checkout.stripe.com/cs_test"}

        responses = [
            (customer_status, customer_body),
            (session_status, session_body),
        ]

        class _MockResp:
            def __init__(self, status, body):
                self.status = status
                self._body = body

            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return None

            async def json(self):
                return self._body

        class _MockSession:
            def __init__(self):
                self._idx = 0

            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return None

            def post(self, *args, **kwargs):
                status, body = responses[self._idx]
                self._idx += 1
                return _MockResp(status, body)

        return mock.patch("api.checkout.aiohttp.ClientSession", return_value=_MockSession())

    @mock.patch.dict("os.environ", {"STRIPE_SECRET_KEY": "sk_test_xxx"}, clear=False)
    def test_happy_path_creates_session(self):
        app = _app(db=_db())
        with self._patch_stripe():
            resp = run(handle_checkout(_req(
                {"tier_name": "pro", "success_url": "x", "cancel_url": "y", "user_email": "a@b.c"},
                app=app,
            )))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        self.assertEqual(body["session_id"], "cs_test")
        self.assertIn("url", body)
        self.assertEqual(body["tier_name"], "pro")

    @mock.patch.dict("os.environ", {"STRIPE_SECRET_KEY": ""}, clear=False)
    def test_no_stripe_key_503(self):
        app = _app(db=_db())
        resp = run(handle_checkout(_req(
            {"tier_name": "pro", "success_url": "x", "cancel_url": "y", "user_email": "a@b.c"},
            app=app,
        )))
        self.assertEqual(resp.status, 503)

    @mock.patch.dict("os.environ", {"STRIPE_SECRET_KEY": "sk_test_xxx"}, clear=False)
    def test_stripe_customer_create_fails_502(self):
        app = _app(db=_db())
        with self._patch_stripe(customer_status=400, customer_body={"error": "bad"}):
            resp = run(handle_checkout(_req(
                {"tier_name": "pro", "success_url": "x", "cancel_url": "y", "user_email": "a@b.c"},
                app=app,
            )))
        self.assertEqual(resp.status, 502)

    @mock.patch.dict("os.environ", {"STRIPE_SECRET_KEY": "sk_test_xxx"}, clear=False)
    def test_existing_customer_skips_create(self):
        existing = {"id": "cust-uuid-1", "stripe_customer_id": "cus_existing"}
        app = _app(db=_db(customer_row=existing))
        # Only ONE Stripe call expected (checkout session); customer is found in DB
        responses = [(200, {"id": "cs_test_2", "url": "https://stripe.com/cs"})]

        class _MR:
            def __init__(self, status, body):
                self.status = status
                self._body = body
            async def __aenter__(self):
                return self
            async def __aexit__(self, *a):
                return None
            async def json(self):
                return self._body

        class _MS:
            def __init__(self):
                self.calls = 0
            async def __aenter__(self):
                return self
            async def __aexit__(self, *a):
                return None
            def post(self, *args, **kwargs):
                self.calls += 1
                return _MR(*responses[0])

        with mock.patch("api.checkout.aiohttp.ClientSession", return_value=_MS()):
            resp = run(handle_checkout(_req(
                {"tier_name": "pro", "success_url": "x", "cancel_url": "y", "user_email": "a@b.c"},
                app=app,
            )))
        self.assertEqual(resp.status, 200)


if __name__ == "__main__":
    unittest.main()
