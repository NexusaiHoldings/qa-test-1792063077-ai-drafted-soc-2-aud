"""Tests for legal-and-compliance manifest validity."""
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent.parent))
from packages.legos.manifest import validate_manifest_file

MANIFEST_PATH = str(Path(__file__).parent.parent.parent / "manifest.yaml")

REQUIRED_FIELDS = [
    "name", "version", "description", "maintainer", "status",
    "compatibility", "depends_on", "slots", "config_schema",
    "required_config", "runtime", "identity_constraints",
    "adapters", "economics", "env", "migrations", "admin",
]


def _m() -> dict:
    with open(MANIFEST_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


class TestLegalManifest:
    def test_passes_validation(self):
        ok, errors = validate_manifest_file(MANIFEST_PATH)
        assert ok, errors

    def test_name_version_status(self):
        m = _m()
        assert m["name"] == "legal-and-compliance"
        assert m["version"] == "0.1.0"
        assert m["status"] in ("alpha", "beta", "stable")

    def test_all_required_fields_present(self):
        m = _m()
        for f in REQUIRED_FIELDS:
            assert f in m, f"Missing required field: {f!r}"

    def test_depends_on_identity_and_access(self):
        m = _m()
        deps = m["depends_on"]
        assert any("identity-and-access" in d for d in deps)

    def test_depends_on_admin_console(self):
        m = _m()
        deps = m["depends_on"]
        assert any("admin-console" in d for d in deps)

    def test_emits_legal_events(self):
        emits = _m()["runtime"]["events"]["emits"]
        for expected in (
            "legal.document_published",
            "legal.user_acknowledged",
            "legal.cookie_consent_given",
            "legal.cookie_consent_declined",
        ):
            assert expected in emits, f"Missing emit: {expected}"

    def test_slots(self):
        names = [s["name"] for s in _m()["slots"]]
        assert "extra_legal_links" in names
        assert any(n.startswith("policy_addendum_") for n in names)

    def test_config_schema_required_fields(self):
        props = _m()["config_schema"]["properties"]
        for field in ("jurisdiction", "cookie_banner_enabled", "liability_boundary_class"):
            assert field in props, f"Missing config_schema property: {field}"

    def test_liability_boundary_enum(self):
        enm = _m()["config_schema"]["properties"]["liability_boundary_class"]["enum"]
        for cls in ("tool", "assistant", "fiduciary", "regulated_advisor"):
            assert cls in enm

    def test_jurisdiction_enum(self):
        enm = _m()["config_schema"]["properties"]["jurisdiction"]["enum"]
        for j in ("us", "eu", "uk", "ca", "au", "global"):
            assert j in enm

    def test_migrations_env_config(self):
        m = _m()
        assert m["migrations"]["required"] is True
        assert m["migrations"]["reversible"] is False
        assert "DATABASE_URL" in m["env"]["required"]
        assert m["required_config"] is True

    def test_admin_section(self):
        sections = _m()["admin"]["sections"]
        names = [s["name"] for s in sections]
        assert "Legal" in names
        legal = next(s for s in sections if s["name"] == "Legal")
        assert legal["order"] == 30
        assert "/admin/legal" in legal["routes"]

    def test_telemetry_events(self):
        events = _m()["runtime"]["telemetry"]["required_events"]
        for e in ("legal_doc_viewed", "legal_acknowledgment_completed",
                  "cookie_banner_shown", "cookie_consent_action"):
            assert e in events

    def test_allowed_categories_star(self):
        assert "*" in _m()["identity_constraints"]["allowed_categories"]
