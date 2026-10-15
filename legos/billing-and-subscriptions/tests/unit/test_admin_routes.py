"""Tests for admin/routes.py — admin contribution per spec §4.5."""
from __future__ import annotations

import asyncio
import datetime
import json
import sys
import unittest
import unittest.mock as mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from admin.routes import (  # type: ignore[import-not-found]
    handle_list_subscriptions,
    handle_subscription_detail,
    handle_admin_cancel_immediately,
    handle_admin_refund,
    handle_dunning_list,
)


def run(c):
    return asyncio.run(c)


_TOKEN = "admin_token_secret"


def _now():
    return datetime.datetime(2026, 5, 9, 12, 0, tzinfo=datetime.timezone.utc)


def _app(*, db=None, js=None, token=_TOKEN):
    return {"db": db, "js": js, "admin_token": token}


def _req(*, app, headers=None, body=None, match_info=None, query=None):
    r = mock.MagicMock()
    r.app = app
    r.headers = headers if headers is not None else {"X-Admin-Token": _TOKEN}
    r.json = mock.AsyncMock(return_value=body or {})
    r.match_info = match_info or {}
    # Build a query string for rel_url.query
    if query:
        r.rel_url.query = query
    else:
        r.rel_url.query = {}
    return r


class TestListSubscriptions(unittest.TestCase):
    def test_unauthenticated_403(self):
        resp = run(handle_list_subscriptions(_req(app=_app(db=mock.AsyncMock()), headers={})))
        self.assertEqual(resp.status, 403)

    def test_db_unavailable_503(self):
        resp = run(handle_list_subscriptions(_req(app=_app(db=None))))
        self.assertEqual(resp.status, 503)

    def test_returns_subscription_list(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[
            {
                "id": "sub-1", "tier_name": "pro", "status": "active",
                "current_period_end": _now(), "cancel_at_period_end": False,
                "created_at": _now(), "user_id": "user-1", "email": "a@b.c",
            },
        ])
        resp = run(handle_list_subscriptions(_req(app=_app(db=db))))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        self.assertEqual(len(body["subscriptions"]), 1)
        self.assertEqual(body["subscriptions"][0]["tier_name"], "pro")

    def test_status_filter(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[])
        resp = run(handle_list_subscriptions(_req(
            app=_app(db=db), query={"status": "past_due"},
        )))
        self.assertEqual(resp.status, 200)


class TestSubscriptionDetail(unittest.TestCase):
    def test_unauthenticated_403(self):
        resp = run(handle_subscription_detail(_req(
            app=_app(db=mock.AsyncMock()), headers={}, match_info={"id": "sub-1"},
        )))
        self.assertEqual(resp.status, 403)

    def test_not_found_404(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[])
        resp = run(handle_subscription_detail(_req(
            app=_app(db=db), match_info={"id": "sub-x"},
        )))
        self.assertEqual(resp.status, 404)

    def test_full_detail(self):
        db = mock.AsyncMock()

        async def _q(sql, *a):
            if "FROM billing_subscriptions s" in sql and "JOIN billing_customers" in sql:
                return [{
                    "id": "sub-1", "tier_name": "pro", "status": "active",
                    "current_period_start": _now(), "current_period_end": _now(),
                    "cancel_at_period_end": False, "trial_end": None,
                    "stripe_subscription_id": "sub_x", "user_id": "u-1",
                    "email": "a@b.c", "stripe_customer_id": "cus_x",
                }]
            if "billing_plan_changes" in sql:
                return [{
                    "from_tier_name": "starter", "to_tier_name": "pro",
                    "change_type": "upgrade", "proration_amount_cents": 1500,
                    "applied_at": _now(),
                }]
            if "billing_dunning_state" in sql:
                return [{
                    "state": "healthy", "failed_payment_count": 0,
                    "first_failed_at": None, "last_failed_at": None,
                    "next_action_at": None, "last_email_template": None,
                    "resolved_at": None,
                }]
            return []

        db.query = mock.AsyncMock(side_effect=_q)
        resp = run(handle_subscription_detail(_req(
            app=_app(db=db), match_info={"id": "sub-1"},
        )))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        self.assertEqual(body["subscription"]["tier_name"], "pro")
        self.assertEqual(len(body["plan_history"]), 1)
        self.assertEqual(body["dunning"]["state"], "healthy")


def _patch_stripe_request(status, body):
    """Mock aiohttp.ClientSession to return one Stripe response."""
    class _MR:
        def __init__(self, s, b):
            self.status = s
            self._body = b
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return None
        async def json(self): return self._body

    class _MS:
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return None
        def post(self, *args, **kwargs):
            return _MR(status, body)
        def delete(self, *args, **kwargs):
            return _MR(status, body)

    return mock.patch("admin.routes.aiohttp.ClientSession", return_value=_MS())


class TestAdminCancelImmediately(unittest.TestCase):
    @mock.patch.dict("os.environ", {"STRIPE_SECRET_KEY": "sk_test"}, clear=False)
    def test_happy_path(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[
            {"stripe_subscription_id": "sub_x", "tier_name": "pro"},
        ])
        js = mock.AsyncMock()
        with _patch_stripe_request(200, {"id": "sub_x", "status": "canceled"}):
            resp = run(handle_admin_cancel_immediately(_req(
                app=_app(db=db, js=js), match_info={"id": "sub-1"},
            )))
        self.assertEqual(resp.status, 200)
        published = [c[0][0] for c in js.publish.call_args_list]
        self.assertIn("billing.subscription_cancelled", published)

    def test_unauthenticated_403(self):
        resp = run(handle_admin_cancel_immediately(_req(
            app=_app(db=mock.AsyncMock()), headers={}, match_info={"id": "sub-1"},
        )))
        self.assertEqual(resp.status, 403)

    @mock.patch.dict("os.environ", {"STRIPE_SECRET_KEY": ""}, clear=False)
    def test_no_stripe_key_503(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[
            {"stripe_subscription_id": "sub_x", "tier_name": "pro"},
        ])
        resp = run(handle_admin_cancel_immediately(_req(
            app=_app(db=db), match_info={"id": "sub-1"},
        )))
        self.assertEqual(resp.status, 503)


class TestAdminRefund(unittest.TestCase):
    @mock.patch.dict("os.environ", {"STRIPE_SECRET_KEY": "sk_test"}, clear=False)
    def test_happy_path(self):
        db = mock.AsyncMock()
        js = mock.AsyncMock()
        with _patch_stripe_request(200, {"id": "re_x", "amount": 5900}):
            resp = run(handle_admin_refund(_req(
                app=_app(db=db, js=js),
                body={"stripe_invoice_id": "ch_x"},
            )))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        self.assertEqual(body["status"], "refunded")

    def test_missing_invoice_400(self):
        resp = run(handle_admin_refund(_req(
            app=_app(db=mock.AsyncMock()), body={},
        )))
        self.assertEqual(resp.status, 400)

    def test_unauthenticated_403(self):
        resp = run(handle_admin_refund(_req(
            app=_app(db=mock.AsyncMock()), headers={}, body={"stripe_invoice_id": "ch_x"},
        )))
        self.assertEqual(resp.status, 403)


class TestDunningList(unittest.TestCase):
    def test_returns_at_risk(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[])  # no at_risk subs
        resp = run(handle_dunning_list(_req(app=_app(db=db))))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        self.assertEqual(body["count"], 0)

    def test_unauthenticated_403(self):
        resp = run(handle_dunning_list(_req(app=_app(db=mock.AsyncMock()), headers={})))
        self.assertEqual(resp.status, 403)


if __name__ == "__main__":
    unittest.main()
