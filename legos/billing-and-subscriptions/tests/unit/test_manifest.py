"""Verify billing-and-subscriptions manifest validates against SS1 schema.

Mirrors SS2.1/2.2/2.3 manifest test pattern per ADR 0009. Uses
forward-compatible version + status assertions so future SS4.2/4.3
bumps don't break the test.
"""
from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

import yaml

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from packages.legos.manifest import validate_manifest_file  # type: ignore[import-not-found]

_MANIFEST_PATH = os.path.join(
    _REPO_ROOT, "legos", "billing-and-subscriptions", "manifest.yaml",
)


def _load() -> dict:
    with open(_MANIFEST_PATH) as fh:
        return yaml.safe_load(fh)


class TestBillingManifest(unittest.TestCase):
    def test_validates_against_ss1_schema(self) -> None:
        ok, errors = validate_manifest_file(_MANIFEST_PATH)
        self.assertTrue(ok, f"manifest validation errors: {errors}")
        self.assertEqual(errors, [])

    def test_name(self) -> None:
        m = _load()
        self.assertEqual(m["name"], "billing-and-subscriptions")

    def test_version_forward_compatible(self) -> None:
        m = _load()
        ver_parts = [int(p) for p in m["version"].split(".")]
        self.assertGreaterEqual(ver_parts, [0, 1, 0])

    def test_status_valid(self) -> None:
        m = _load()
        self.assertIn(m["status"], ("alpha", "beta", "stable"))

    def test_two_inter_lego_dependencies(self) -> None:
        m = _load()
        deps = m.get("depends_on", [])
        # depends_on is a list of single-key dicts
        dep_names = []
        for d in deps:
            dep_names.extend(d.keys())
        self.assertIn("identity-and-access", dep_names)
        self.assertIn("admin-console", dep_names)

    def test_config_schema_required_fields(self) -> None:
        m = _load()
        required = m["config_schema"]["required"]
        self.assertIn("stripe_publishable_key", required)
        self.assertIn("default_currency", required)
        self.assertIn("tier_ladder", required)

    def test_runtime_emits_includes_lifecycle_events(self) -> None:
        m = _load()
        emits = m["runtime"]["events"]["emits"]
        for event in [
            "billing.checkout_session_created",
            "billing.subscription_created",
            "billing.subscription_cancelled",
            "billing.payment_succeeded",
            "billing.payment_failed",
            "billing.webhook_received",
        ]:
            self.assertIn(event, emits)

    def test_telemetry_required_events(self) -> None:
        m = _load()
        events = m["runtime"]["telemetry"]["required_events"]
        for event in ["checkout_started", "checkout_completed", "subscription_created", "payment_failed"]:
            self.assertIn(event, events)

    def test_adapters_stripe_locked(self) -> None:
        # Stripe is Tier-1 locked per spec §4.6
        m = _load()
        self.assertEqual(m["adapters"]["default"], "stripe")
        self.assertIn("stripe", m["adapters"]["supported"])

    def test_admin_section_billing(self) -> None:
        m = _load()
        sections = m["admin"]["sections"]
        self.assertEqual(len(sections), 1)
        self.assertEqual(sections[0]["name"], "Billing")
        self.assertEqual(sections[0]["order"], 40)
        self.assertIn("admin", sections[0]["permissions"])

    def test_env_required_includes_stripe_keys(self) -> None:
        m = _load()
        env_req = m["env"]["required"]
        self.assertIn("DATABASE_URL", env_req)
        self.assertIn("STRIPE_SECRET_KEY", env_req)
        self.assertIn("STRIPE_WEBHOOK_SECRET", env_req)


if __name__ == "__main__":
    unittest.main()
