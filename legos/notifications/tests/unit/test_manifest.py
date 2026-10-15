"""Verify Notifications manifest validates against SS1 schema."""
from __future__ import annotations

import os
import sys
import unittest

import yaml

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from packages.legos.manifest import validate_manifest_file  # type: ignore[import-not-found]

_MANIFEST_PATH = os.path.join(_REPO_ROOT, "legos", "notifications", "manifest.yaml")


def _load() -> dict:
    with open(_MANIFEST_PATH) as fh:
        return yaml.safe_load(fh)


class TestNotificationsManifest(unittest.TestCase):
    def test_validates_against_ss1_schema(self):
        ok, errors = validate_manifest_file(_MANIFEST_PATH)
        self.assertTrue(ok, f"errors: {errors}")

    def test_name(self):
        self.assertEqual(_load()["name"], "notifications")

    def test_version_forward_compatible(self):
        ver = [int(p) for p in _load()["version"].split(".")]
        self.assertGreaterEqual(ver, [0, 1, 0])

    def test_status_valid(self):
        self.assertIn(_load()["status"], ("alpha", "beta", "stable"))

    def test_inter_lego_deps(self):
        m = _load()
        deps = m.get("depends_on", [])
        names = []
        for d in deps:
            names.extend(d.keys())
        self.assertIn("identity-and-access", names)
        self.assertIn("admin-console", names)

    def test_runtime_emits_lifecycle_events(self):
        m = _load()
        emits = m["runtime"]["events"]["emits"]
        for e in ["notifications.dispatched", "notifications.delivery_failed", "notifications.user_marked_read", "notifications.preferences_updated"]:
            self.assertIn(e, emits)

    def test_subscribes_to_send_requested(self):
        m = _load()
        subs = m["runtime"]["events"]["subscribes_to"]
        self.assertIn("notifications.send_requested", subs)

    def test_default_channels_in_config(self):
        m = _load()
        required = m["config_schema"]["required"]
        self.assertIn("default_channels", required)

    def test_adapters_resend_default(self):
        m = _load()
        self.assertEqual(m["adapters"]["default"], "resend")

    def test_admin_section_notifications(self):
        m = _load()
        self.assertEqual(len(m["admin"]["sections"]), 1)
        self.assertEqual(m["admin"]["sections"][0]["name"], "Notifications")


if __name__ == "__main__":
    unittest.main()
