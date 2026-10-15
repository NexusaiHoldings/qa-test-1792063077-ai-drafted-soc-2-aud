"""Tests for identity-and-access manifest validity."""
import sys
from pathlib import Path
import yaml

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent.parent))
from packages.legos.manifest import validate_manifest_file

MANIFEST_PATH = str(Path(__file__).parent.parent.parent / "manifest.yaml")
EXPECTED_EMITS = ["user.created", "user.signed_in", "user.signed_out", "user.suspicious_login_detected"]
EXPECTED_TELEMETRY = ["signup_started", "signup_completed", "signup_failed", "login_attempted", "login_succeeded", "login_failed"]
EXPECTED_SLOTS = ["before_signup_fields", "after_login_redirect", "signup_legal_acknowledgment"]
REQUIRED_FIELDS = ["name","version","description","maintainer","status","compatibility","depends_on",
                   "slots","config_schema","required_config","runtime","identity_constraints",
                   "adapters","economics","env","migrations","admin"]

def _m():
    with open(MANIFEST_PATH, encoding="utf-8") as f: return yaml.safe_load(f)


class TestIdentityManifest:
    def test_passes_validation(self):
        ok, errors = validate_manifest_file(MANIFEST_PATH)
        assert ok, errors

    def test_name_and_version(self):
        # Version bumped to 0.2.0 in SS2.2 (added password reset + MFA + emails).
        # Test asserts >= 0.2.0 so future SS2.3 bumps don't break it.
        m = _m()
        assert m["name"] == "identity-and-access"
        ver_parts = [int(p) for p in m["version"].split(".")]
        assert ver_parts >= [0, 2, 0]

    def test_status_valid(self):
        # Status progression: alpha (SS2.1/2.2) → beta (SS2.3) → stable (post-validation).
        # Accept any valid manifest schema status; the lifecycle is intentional.
        assert _m()["status"] in ("alpha", "beta", "stable")

    def test_all_required_fields(self):
        m = _m()
        for f in REQUIRED_FIELDS: assert f in m, f"Missing: {f!r}"

    def test_emits(self):
        emits = _m()["runtime"]["events"]["emits"]
        for e in EXPECTED_EMITS: assert e in emits, f"Missing emit: {e!r}"

    def test_telemetry(self):
        evts = _m()["runtime"]["telemetry"]["required_events"]
        for e in EXPECTED_TELEMETRY: assert e in evts, f"Missing telemetry: {e!r}"

    def test_slots(self):
        names = [s["name"] for s in _m()["slots"]]
        for s in EXPECTED_SLOTS: assert s in names, f"Missing slot: {s!r}"

    def test_migrations(self):
        m = _m()["migrations"]
        assert m["required"] is True and m["reversible"] is False

    def test_env_vars(self):
        env = _m()["env"]["required"]
        assert "DATABASE_URL" in env and "SESSION_SECRET" in env

    def test_adapters(self):
        a = _m()["adapters"]
        assert a["default"] == "roll_your_own"
        for adp in ("clerk", "supabase_auth", "auth0"): assert adp in a["supported"]

    def test_economics_non_empty(self):
        assert len(_m()["economics"]["tracked_metrics"]) >= 1

    def test_slot_contracts_valid(self):
        valid = {"react-component","server-hook","email-template","admin-page","agent-tool","event-handler"}
        for s in _m()["slots"]: assert s["contract"] in valid

    def test_admin_section_declared(self):
        names = [s["name"] for s in _m()["admin"]["sections"]]
        assert "Users" in names

    def test_required_config_true(self):
        assert _m()["required_config"] is True
