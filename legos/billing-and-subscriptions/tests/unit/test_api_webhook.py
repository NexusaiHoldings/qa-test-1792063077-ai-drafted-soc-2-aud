"""Tests for api/webhook.py — Stripe signature + dispatch."""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import sys
import time
import unittest
import unittest.mock as mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from api.webhook import (  # type: ignore[import-not-found]
    _verify_signature,
    handle_webhook,
)


def run(c):
    return asyncio.run(c)


_SECRET = "whsec_test_secret"


def _sign(payload: bytes, secret: str = _SECRET, ts: int | None = None) -> str:
    """Build a valid Stripe-Signature header for the given payload."""
    ts = ts or int(time.time())
    signed = f"{ts}.".encode() + payload
    sig = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return f"t={ts},v1={sig}"


def _app(*, db=None, js=None):
    return {"db": db, "js": js}


def _req(*, body: bytes, signature: str, app):
    r = mock.MagicMock()
    r.read = mock.AsyncMock(return_value=body)
    r.headers = {"Stripe-Signature": signature}
    r.app = app
    return r


class TestVerifySignature(unittest.TestCase):
    def test_valid_signature(self):
        payload = b'{"id":"evt_1","type":"foo"}'
        sig = _sign(payload)
        self.assertTrue(_verify_signature(payload, sig, _SECRET))

    def test_wrong_secret_rejected(self):
        payload = b'{"id":"evt_1"}'
        sig = _sign(payload, secret="other_secret")
        self.assertFalse(_verify_signature(payload, sig, _SECRET))

    def test_tampered_body_rejected(self):
        sig = _sign(b'{"id":"evt_1"}')
        self.assertFalse(_verify_signature(b'{"id":"evt_2"}', sig, _SECRET))

    def test_old_timestamp_rejected(self):
        payload = b'{"id":"evt_1"}'
        old_ts = int(time.time()) - 600  # 10 minutes ago, beyond 5min tolerance
        sig = _sign(payload, ts=old_ts)
        self.assertFalse(_verify_signature(payload, sig, _SECRET))

    def test_missing_v1_rejected(self):
        self.assertFalse(_verify_signature(b'x', "t=12345,v0=abc", _SECRET))

    def test_empty_secret_rejected(self):
        payload = b'{"id":"evt_1"}'
        sig = _sign(payload)
        self.assertFalse(_verify_signature(payload, sig, ""))

    def test_empty_header_rejected(self):
        self.assertFalse(_verify_signature(b'{"id":"x"}', "", _SECRET))


class TestHandleWebhook(unittest.TestCase):
    """End-to-end: signature → persist → dispatch → publish."""

    @mock.patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": _SECRET}, clear=False)
    def test_invalid_signature_400(self):
        db = mock.AsyncMock()
        resp = run(handle_webhook(_req(
            body=b'{"id":"evt_1"}', signature="t=1,v1=bad", app=_app(db=db),
        )))
        self.assertEqual(resp.status, 400)

    @mock.patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": _SECRET}, clear=False)
    def test_db_unavailable_503(self):
        resp = run(handle_webhook(_req(
            body=b'{}', signature="t=1,v1=x", app=_app(db=None),
        )))
        self.assertEqual(resp.status, 503)

    @mock.patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": _SECRET}, clear=False)
    def test_invalid_json_after_signature_400(self):
        # Signature valid (since we sign the bad-JSON bytes) but JSON parse fails
        body = b'not-json{{{'
        sig = _sign(body)
        db = mock.AsyncMock()
        resp = run(handle_webhook(_req(body=body, signature=sig, app=_app(db=db))))
        self.assertEqual(resp.status, 400)

    @mock.patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": _SECRET}, clear=False)
    def test_missing_event_id_or_type_400(self):
        body = json.dumps({"id": "", "type": ""}).encode()
        sig = _sign(body)
        db = mock.AsyncMock()
        resp = run(handle_webhook(_req(body=body, signature=sig, app=_app(db=db))))
        self.assertEqual(resp.status, 400)

    def _signed_event(self, event_dict: dict) -> tuple[bytes, str]:
        body = json.dumps(event_dict).encode()
        return body, _sign(body)

    @mock.patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": _SECRET}, clear=False)
    def test_checkout_session_completed_dispatched(self):
        body, sig = self._signed_event({
            "id": "evt_1",
            "type": "checkout.session.completed",
            "data": {"object": {
                "id": "cs_test_xyz",
                "metadata": {"user_id": "user-1", "tier_name": "pro"},
            }},
        })
        db = mock.AsyncMock()
        db.execute = mock.AsyncMock(return_value="INSERT 0 1")
        js = mock.AsyncMock()
        resp = run(handle_webhook(_req(body=body, signature=sig, app=_app(db=db, js=js))))
        self.assertEqual(resp.status, 200)
        published_subjects = [c[0][0] for c in js.publish.call_args_list]
        self.assertIn("billing.checkout_session_completed", published_subjects)

    @mock.patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": _SECRET}, clear=False)
    def test_subscription_created_publishes_event(self):
        body, sig = self._signed_event({
            "id": "evt_2",
            "type": "customer.subscription.created",
            "data": {"object": {
                "id": "sub_xyz",
                "customer": "cus_xyz",
                "status": "active",
                "cancel_at_period_end": False,
                "current_period_start": 1700000000,
                "current_period_end": 1702592000,
                "items": {"data": [{"price": {"id": "price_pro", "nickname": "pro"}}]},
                "metadata": {"tier_name": "pro"},
            }},
        })
        db = mock.AsyncMock()
        db.execute = mock.AsyncMock(return_value="INSERT 0 1")
        # Customer lookup returns a row so _upsert_subscription proceeds
        db.query = mock.AsyncMock(return_value=[{"id": "cust-uuid-1"}])
        js = mock.AsyncMock()
        resp = run(handle_webhook(_req(body=body, signature=sig, app=_app(db=db, js=js))))
        self.assertEqual(resp.status, 200)
        published_subjects = [c[0][0] for c in js.publish.call_args_list]
        self.assertIn("billing.subscription_created", published_subjects)

    @mock.patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": _SECRET}, clear=False)
    def test_payment_failed_publishes(self):
        body, sig = self._signed_event({
            "id": "evt_3",
            "type": "invoice.payment_failed",
            "data": {"object": {
                "id": "in_test", "subscription": "sub_xyz",
                "amount_paid": 0, "currency": "usd", "attempt_count": 2,
            }},
        })
        db = mock.AsyncMock()
        db.execute = mock.AsyncMock(return_value="INSERT 0 1")
        js = mock.AsyncMock()
        resp = run(handle_webhook(_req(body=body, signature=sig, app=_app(db=db, js=js))))
        self.assertEqual(resp.status, 200)
        published_subjects = [c[0][0] for c in js.publish.call_args_list]
        self.assertIn("billing.payment_failed", published_subjects)

    @mock.patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": _SECRET}, clear=False)
    def test_duplicate_event_idempotent(self):
        body, sig = self._signed_event({"id": "evt_4", "type": "customer.subscription.updated"})
        db = mock.AsyncMock()
        # Simulate ON CONFLICT DO NOTHING (already processed) — execute returns "INSERT 0 0"
        db.execute = mock.AsyncMock(return_value="INSERT 0 0")
        js = mock.AsyncMock()
        resp = run(handle_webhook(_req(body=body, signature=sig, app=_app(db=db, js=js))))
        self.assertEqual(resp.status, 200)
        body_text = (resp.body or b"").decode() if hasattr(resp, "body") else ""
        # When duplicate, dispatch is skipped; only billing.webhook_received fires with duplicate=true
        published_subjects = [c[0][0] for c in js.publish.call_args_list]
        self.assertEqual(published_subjects, ["billing.webhook_received"])
        # Verify the duplicate marker
        first_call = js.publish.call_args_list[0]
        published_payload = json.loads(first_call[0][1])
        self.assertTrue(published_payload.get("duplicate"))


if __name__ == "__main__":
    unittest.main()
