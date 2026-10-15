"""Tests for api/plan_changes.py — preview / apply / history."""
from __future__ import annotations

import asyncio
import datetime
import json
import sys
import unittest
import unittest.mock as mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from api.plan_changes import (  # type: ignore[import-not-found]
    handle_preview_plan_change,
    handle_apply_plan_change,
    handle_plan_history,
    _classify_change,
    _find_tier,
)


def run(c):
    return asyncio.run(c)


_TIER_LADDER = [
    {"name": "starter", "price_id": "price_starter", "amount": 1400, "interval": "month"},
    {"name": "pro",     "price_id": "price_pro",     "amount": 5900, "interval": "month"},
]


def _app(*, db=None, js=None, user_id="user-1"):
    return {
        "db": db, "js": js,
        "authenticated_user_id": user_id,
        "lego_config": {
            "stripe_publishable_key": "pk_test",
            "default_currency": "usd",
            "tier_ladder": _TIER_LADDER,
            "enable_proration": True,
        },
    }


def _req(body, *, app):
    r = mock.MagicMock()
    r.json = mock.AsyncMock(return_value=body)
    r.app = app
    return r


def _sub_row(*, tier="starter", price_id="price_starter"):
    return {
        "id": "sub-uuid",
        "stripe_subscription_id": "sub_stripe",
        "tier_name": tier,
        "stripe_price_id": price_id,
    }


class TestHelpers(unittest.TestCase):
    def test_classify_upgrade(self):
        self.assertEqual(_classify_change(1400, 5900), "upgrade")

    def test_classify_downgrade(self):
        self.assertEqual(_classify_change(5900, 1400), "downgrade")

    def test_classify_lateral(self):
        self.assertEqual(_classify_change(1400, 1400), "lateral")

    def test_find_tier(self):
        self.assertIsNotNone(_find_tier({"tier_ladder": _TIER_LADDER}, "pro"))
        self.assertIsNone(_find_tier({"tier_ladder": _TIER_LADDER}, "enterprise"))


def _patch_two_stripe_calls(item_status, item_body, action_status, action_body):
    """Mock aiohttp.ClientSession.request so plan_changes' multi-call flow works."""
    responses = [(item_status, item_body), (action_status, action_body)]

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
        def __init__(self):
            self.idx = 0
        async def __aenter__(self):
            return self
        async def __aexit__(self, *a):
            return None

        def request(self, *args, **kwargs):
            r = _MR(*responses[self.idx])
            self.idx += 1
            return r

        def get(self, *args, **kwargs):
            r = _MR(*responses[self.idx])
            self.idx += 1
            return r

        def post(self, *args, **kwargs):
            r = _MR(*responses[self.idx])
            self.idx += 1
            return r

    return mock.patch("api.plan_changes.aiohttp.ClientSession", return_value=_MS())


class TestPreviewPlanChange(unittest.TestCase):
    def test_unauthenticated_401(self):
        resp = run(handle_preview_plan_change(_req(
            {"new_tier_name": "pro"}, app=_app(db=mock.AsyncMock(), user_id=None),
        )))
        self.assertEqual(resp.status, 401)

    def test_unknown_tier_404(self):
        db = mock.AsyncMock()
        resp = run(handle_preview_plan_change(_req(
            {"new_tier_name": "enterprise"}, app=_app(db=db),
        )))
        self.assertEqual(resp.status, 404)

    def test_missing_new_tier_400(self):
        db = mock.AsyncMock()
        resp = run(handle_preview_plan_change(_req({}, app=_app(db=db))))
        self.assertEqual(resp.status, 400)

    def test_no_active_subscription_404(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[])
        resp = run(handle_preview_plan_change(_req(
            {"new_tier_name": "pro"}, app=_app(db=db),
        )))
        self.assertEqual(resp.status, 404)

    @mock.patch.dict("os.environ", {"STRIPE_SECRET_KEY": "sk_test"}, clear=False)
    def test_happy_path(self):
        db = mock.AsyncMock()

        async def _q(sql, *args):
            if "FROM billing_subscriptions s" in sql and "JOIN billing_customers" in sql and "stripe_customer_id" not in sql:
                return [_sub_row()]
            if "stripe_customer_id" in sql:
                return [{"stripe_customer_id": "cus_xyz"}]
            return []

        db.query = mock.AsyncMock(side_effect=_q)
        js = mock.AsyncMock()
        with _patch_two_stripe_calls(
            200, {"items": {"data": [{"id": "si_1", "price": {"id": "price_starter"}}]}},
            200, {"amount_due": 1500, "currency": "usd"},
        ):
            resp = run(handle_preview_plan_change(_req(
                {"new_tier_name": "pro"}, app=_app(db=db, js=js),
            )))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        self.assertEqual(body["from_tier_name"], "starter")
        self.assertEqual(body["to_tier_name"], "pro")
        self.assertEqual(body["proration_amount_cents"], 1500)


class TestApplyPlanChange(unittest.TestCase):
    @mock.patch.dict("os.environ", {"STRIPE_SECRET_KEY": "sk_test"}, clear=False)
    def test_happy_path(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[_sub_row()])
        db.execute = mock.AsyncMock(return_value="INSERT 0 1")
        js = mock.AsyncMock()
        with _patch_two_stripe_calls(
            200, {"items": {"data": [{"id": "si_1"}]}},
            200, {"id": "sub_stripe", "items": {"data": [{"price": {"id": "price_pro"}}]}},
        ):
            resp = run(handle_apply_plan_change(_req(
                {"new_tier_name": "pro", "proration_amount_cents": 1500},
                app=_app(db=db, js=js),
            )))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        self.assertEqual(body["status"], "applied")
        self.assertEqual(body["from_tier_name"], "starter")
        self.assertEqual(body["to_tier_name"], "pro")
        published = [c[0][0] for c in js.publish.call_args_list]
        self.assertIn("billing.plan_change_applied", published)

    @mock.patch.dict("os.environ", {"STRIPE_SECRET_KEY": "sk_test"}, clear=False)
    def test_already_on_tier_400(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[_sub_row(tier="pro", price_id="price_pro")])
        resp = run(handle_apply_plan_change(_req(
            {"new_tier_name": "pro"}, app=_app(db=db),
        )))
        self.assertEqual(resp.status, 400)

    def test_unauthenticated_401(self):
        resp = run(handle_apply_plan_change(_req(
            {"new_tier_name": "pro"}, app=_app(db=mock.AsyncMock(), user_id=None),
        )))
        self.assertEqual(resp.status, 401)

    @mock.patch.dict("os.environ", {"STRIPE_SECRET_KEY": ""}, clear=False)
    def test_no_stripe_key_503(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[_sub_row()])
        resp = run(handle_apply_plan_change(_req(
            {"new_tier_name": "pro"}, app=_app(db=db),
        )))
        self.assertEqual(resp.status, 503)


class TestPlanHistory(unittest.TestCase):
    def _now(self):
        return datetime.datetime(2026, 5, 9, 12, 0, tzinfo=datetime.timezone.utc)

    def test_unauthenticated_401(self):
        resp = run(handle_plan_history(_req({}, app=_app(db=mock.AsyncMock(), user_id=None))))
        self.assertEqual(resp.status, 401)

    def test_db_unavailable_503(self):
        resp = run(handle_plan_history(_req({}, app=_app(db=None))))
        self.assertEqual(resp.status, 503)

    def test_returns_history(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[
            {
                "from_tier_name": "starter",
                "to_tier_name": "pro",
                "change_type": "upgrade",
                "proration_amount_cents": 1500,
                "initiated_at": self._now(),
                "applied_at": self._now(),
            },
        ])
        resp = run(handle_plan_history(_req({}, app=_app(db=db))))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        self.assertEqual(len(body["history"]), 1)
        self.assertEqual(body["history"][0]["change_type"], "upgrade")


if __name__ == "__main__":
    unittest.main()
