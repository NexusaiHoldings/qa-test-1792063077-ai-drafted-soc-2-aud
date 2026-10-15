"""Tests for manifest.yaml at version 1.0.0 / status=beta (Sprint 2.3)."""
import os
import unittest

import yaml

_ROOT = os.path.join(os.path.dirname(__file__), "..", "..")


class TestManifestV1(unittest.TestCase):
    def setUp(self):
        with open(os.path.join(_ROOT, "manifest.yaml")) as f:
            self.m = yaml.safe_load(f)

    def test_version_and_status(self):
        self.assertEqual(self.m["version"], "1.0.0")
        self.assertEqual(self.m["status"], "beta")

    def test_oauth_events_present(self):
        emits = self.m["runtime"]["events"]["emits"]
        for ev in ("user.oauth_signup", "user.oauth_login", "user.deletion_requested",
                   "user.session_revoked", "user.mfa_factor_admin_revoked"):
            self.assertIn(ev, emits, f"missing event: {ev}")

    def test_telemetry_events(self):
        telemetry = self.m["runtime"]["telemetry"]["required_events"]
        for ev in ("oauth_started", "oauth_succeeded", "account_deletion_requested"):
            self.assertIn(ev, telemetry, f"missing telemetry: {ev}")

    def test_providers_enum_has_oauth(self):
        enum = self.m["config_schema"]["properties"]["providers"]["items"]["enum"]
        self.assertIn("google_oauth", enum); self.assertIn("github_oauth", enum)

    def test_env_optional_has_oauth_creds(self):
        optional = self.m["env"]["optional"]
        for k in ("GOOGLE_OAUTH_CLIENT_ID", "GITHUB_OAUTH_CLIENT_ID"):
            self.assertIn(k, optional)


class TestToolsV1(unittest.TestCase):
    def setUp(self):
        with open(os.path.join(_ROOT, "agent", "tools.yaml")) as f:
            self.t = yaml.safe_load(f)

    def test_new_tools_present(self):
        names = {t["name"] for t in self.t["tools"]}
        for n in ("recommend_session_revocation", "detect_account_takeover", "score_account_deletion_risk"):
            self.assertIn(n, names, f"missing tool: {n}")

    def test_all_tools_have_action_class(self):
        for tool in self.t["tools"]:
            self.assertIn("action_class", tool)


if __name__ == "__main__":
    unittest.main()
