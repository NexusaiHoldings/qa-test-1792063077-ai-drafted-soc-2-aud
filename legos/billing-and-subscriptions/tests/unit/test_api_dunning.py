"""Tests for api/dunning.py — state machine + at-risk listing."""
from __future__ import annotations

import asyncio
import datetime
import sys
import unittest
import unittest.mock as mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from api.dunning import (  # type: ignore[import-not-found]
    record_payment_failure,
    record_payment_success,
    list_at_risk_subscriptions,
    _STATE_TRANSITIONS,
    _EMAIL_TEMPLATE_BY_STATE,
)


def run(c):
    return asyncio.run(c)


class TestStateTransitions(unittest.TestCase):
    def test_first_failure_healthy_to_at_risk(self):
        self.assertEqual(_STATE_TRANSITIONS[("healthy", 1)], "at_risk")

    def test_second_failure_at_risk_to_past_due(self):
        self.assertEqual(_STATE_TRANSITIONS[("at_risk", 2)], "past_due")

    def test_third_failure_past_due_to_final_warning(self):
        self.assertEqual(_STATE_TRANSITIONS[("past_due", 3)], "final_warning")

    def test_fourth_failure_final_warning_to_cancelled(self):
        self.assertEqual(_STATE_TRANSITIONS[("final_warning", 4)], "cancelled")

    def test_email_templates_for_each_state(self):
        for state in ("at_risk", "past_due", "final_warning", "cancelled"):
            self.assertIn(state, _EMAIL_TEMPLATE_BY_STATE)


class TestRecordPaymentFailure(unittest.TestCase):
    def test_first_failure_creates_at_risk_row(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[])  # no existing row
        db.execute = mock.AsyncMock(return_value="INSERT 0 1")
        js = mock.AsyncMock()
        new_state = run(record_payment_failure(db, js, "sub-uuid"))
        self.assertEqual(new_state, "at_risk")
        published = [c[0][0] for c in js.publish.call_args_list]
        self.assertIn("billing.dunning_state_changed", published)

    def test_second_failure_at_risk_to_past_due(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[{"state": "at_risk", "failed_payment_count": 1}])
        db.execute = mock.AsyncMock(return_value="UPDATE 1")
        js = mock.AsyncMock()
        new_state = run(record_payment_failure(db, js, "sub-uuid"))
        self.assertEqual(new_state, "past_due")

    def test_third_failure_past_due_to_final_warning(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[{"state": "past_due", "failed_payment_count": 2}])
        db.execute = mock.AsyncMock(return_value="UPDATE 1")
        js = mock.AsyncMock()
        new_state = run(record_payment_failure(db, js, "sub-uuid"))
        self.assertEqual(new_state, "final_warning")

    def test_fourth_failure_to_cancelled(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[{"state": "final_warning", "failed_payment_count": 3}])
        db.execute = mock.AsyncMock(return_value="UPDATE 1")
        js = mock.AsyncMock()
        new_state = run(record_payment_failure(db, js, "sub-uuid"))
        self.assertEqual(new_state, "cancelled")


class TestRecordPaymentSuccess(unittest.TestCase):
    def test_success_resolves_dunning(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[{"state": "past_due"}])
        db.execute = mock.AsyncMock(return_value="UPDATE 1")
        js = mock.AsyncMock()
        changed = run(record_payment_success(db, js, "sub-uuid"))
        self.assertTrue(changed)
        published = [c[0][0] for c in js.publish.call_args_list]
        self.assertIn("billing.dunning_resolved", published)

    def test_success_when_already_healthy_noop(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[{"state": "healthy"}])
        js = mock.AsyncMock()
        changed = run(record_payment_success(db, js, "sub-uuid"))
        self.assertFalse(changed)

    def test_success_when_no_dunning_row_noop(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[])
        js = mock.AsyncMock()
        changed = run(record_payment_success(db, js, "sub-uuid"))
        self.assertFalse(changed)


class TestListAtRiskSubscriptions(unittest.TestCase):
    def test_returns_at_risk_rows(self):
        db = mock.AsyncMock()
        db.query = mock.AsyncMock(return_value=[
            {
                "subscription_id": "sub-1",
                "state": "past_due",
                "failed_payment_count": 2,
                "first_failed_at": datetime.datetime(2026, 5, 1, tzinfo=datetime.timezone.utc),
                "last_failed_at": datetime.datetime(2026, 5, 5, tzinfo=datetime.timezone.utc),
                "next_action_at": datetime.datetime(2026, 5, 8, tzinfo=datetime.timezone.utc),
                "tier_name": "pro",
                "stripe_subscription_id": "sub_xyz",
                "user_id": "user-1",
                "email": "u@e.c",
            },
        ])
        items = run(list_at_risk_subscriptions(db, limit=100))
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["state"], "past_due")
        self.assertEqual(items[0]["tier_name"], "pro")


if __name__ == "__main__":
    unittest.main()
