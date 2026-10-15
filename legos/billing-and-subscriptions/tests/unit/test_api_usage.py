"""Tests for api/usage.py — record event + summary."""
from __future__ import annotations

import asyncio
import datetime
import json
import sys
import unittest
import unittest.mock as mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from api.usage import (  # type: ignore[import-not-found]
    handle_record_usage,
    handle_get_usage_summary,
)


def run(c):
    return asyncio.run(c)


def _now():
    return datetime.datetime(2026, 5, 9, 12, 0, tzinfo=datetime.timezone.utc)


def _app(*, db=None, js=None, user_id="user-1"):
    return {"db": db, "js": js, "authenticated_user_id": user_id}


def _req(body, *, app):
    r = mock.MagicMock()
    r.json = mock.AsyncMock(return_value=body)
    r.app = app
    return r


class TestRecordUsage(unittest.TestCase):
    def test_unauthenticated_401(self):
        resp = run(handle_record_usage(_req(
            {"meter_name": "m", "quantity": 1},
            app=_app(db=mock.AsyncMock(), user_id=None),
        )))
        self.assertEqual(resp.status, 401)

    def test_db_unavailable_503(self):
        resp = run(handle_record_usage(_req({"meter_name": "m", "quantity": 1}, app=_app(db=None))))
        self.assertEqual(resp.status, 503)

    def test_missing_meter_name_400(self):
        db = mock.AsyncMock()
        resp = run(handle_record_usage(_req({"quantity": 1}, app=_app(db=db))))
        self.assertEqual(resp.status, 400)

    def test_missing_quantity_400(self):
        db = mock.AsyncMock()
        resp = run(handle_record_usage(_req({"meter_name": "m"}, app=_app(db=db))))
        self.assertEqual(resp.status, 400)

    def test_negative_quantity_400(self):
        db = mock.AsyncMock()
        resp = run(handle_record_usage(_req(
            {"meter_name": "m", "quantity": -1}, app=_app(db=db),
        )))
        self.assertEqual(resp.status, 400)

    def test_non_numeric_quantity_400(self):
        db = mock.AsyncMock()
        resp = run(handle_record_usage(_req(
            {"meter_name": "m", "quantity": "abc"}, app=_app(db=db),
        )))
        self.assertEqual(resp.status, 400)

    def test_no_active_subscription_404(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[])
        resp = run(handle_record_usage(_req(
            {"meter_name": "m", "quantity": 5}, app=_app(db=db),
        )))
        self.assertEqual(resp.status, 404)

    def test_happy_path(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[{"id": "sub-uuid"}])
        db.execute = mock.AsyncMock(return_value="INSERT 0 1")
        js = mock.AsyncMock()
        resp = run(handle_record_usage(_req(
            {"meter_name": "api_calls", "quantity": 100, "idempotency_key": "k1"},
            app=_app(db=db, js=js),
        )))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        self.assertEqual(body["meter_name"], "api_calls")
        self.assertEqual(body["quantity"], 100.0)
        self.assertFalse(body["idempotent_skip"])
        published = [c[0][0] for c in js.publish.call_args_list]
        self.assertIn("billing.usage_event_recorded", published)

    def test_idempotent_duplicate(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[{"id": "sub-uuid"}])
        db.execute = mock.AsyncMock(return_value="INSERT 0 0")  # ON CONFLICT skip
        resp = run(handle_record_usage(_req(
            {"meter_name": "api_calls", "quantity": 100, "idempotency_key": "k1"},
            app=_app(db=db),
        )))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        self.assertTrue(body["idempotent_skip"])
        self.assertIsNone(body["event_id"])


class TestGetUsageSummary(unittest.TestCase):
    def test_unauthenticated_401(self):
        resp = run(handle_get_usage_summary(_req({}, app=_app(db=mock.AsyncMock(), user_id=None))))
        self.assertEqual(resp.status, 401)

    def test_db_unavailable_503(self):
        resp = run(handle_get_usage_summary(_req({}, app=_app(db=None))))
        self.assertEqual(resp.status, 503)

    def test_no_active_subscription_404(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[])
        resp = run(handle_get_usage_summary(_req({}, app=_app(db=db))))
        self.assertEqual(resp.status, 404)

    def test_returns_summary_per_meter(self):
        db = mock.AsyncMock()

        sub_row = {
            "sub_id": "sub-uuid",
            "current_period_start": _now() - datetime.timedelta(days=15),
            "current_period_end": _now() + datetime.timedelta(days=15),
            "tier_name": "pro",
        }
        meter_rows = [
            {
                "meter_name": "api_calls",
                "total_quantity": 1500,
                "last_event_at": _now(),
                "event_count": 12,
            },
            {
                "meter_name": "ai_tokens",
                "total_quantity": 50000,
                "last_event_at": _now(),
                "event_count": 5,
            },
        ]

        async def _q(sql, *args):
            if "FROM billing_subscriptions s" in sql and "JOIN billing_customers c" in sql and "FROM billing_usage_events" not in sql:
                return [sub_row]
            if "FROM billing_usage_events" in sql:
                return meter_rows
            return []

        db.query = mock.AsyncMock(side_effect=_q)
        resp = run(handle_get_usage_summary(_req({}, app=_app(db=db))))
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.body)
        self.assertEqual(body["tier_name"], "pro")
        self.assertEqual(len(body["meters"]), 2)
        self.assertEqual(body["meters"][0]["meter_name"], "api_calls")
        self.assertEqual(body["meters"][0]["total_quantity"], 1500.0)


if __name__ == "__main__":
    unittest.main()
