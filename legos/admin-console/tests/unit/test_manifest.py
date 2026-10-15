"""Tests for admin-console manifest validity."""
import sys
from pathlib import Path
import yaml

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent.parent))
from packages.legos.manifest import validate_manifest_file

MANIFEST_PATH = str(Path(__file__).parent.parent.parent / "manifest.yaml")
REQUIRED_FIELDS = ["name","version","description","maintainer","status","compatibility","depends_on",
                   "slots","config_schema","required_config","runtime","identity_constraints",
                   "adapters","economics","env","migrations","admin"]


def _m():
    with open(MANIFEST_PATH, encoding="utf-8") as f: return yaml.safe_load(f)


class TestAdminConsoleManifest:
    def test_passes_validation(self):
        ok, errors = validate_manifest_file(MANIFEST_PATH); assert ok, errors

    def test_name_version_status(self):
        m = _m()
        assert m["name"] == "admin-console" and m["version"] == "0.1.0"
        assert m["status"] in ("alpha", "beta", "stable")

    def test_all_required_fields(self):
        m = _m()
        for f in REQUIRED_FIELDS: assert f in m, f"Missing: {f!r}"

    def test_depends_on_identity_and_access(self):
        assert any("identity-and-access" in d for d in _m()["depends_on"])

    def test_emits_admin_events(self):
        emits = _m()["runtime"]["events"]["emits"]
        for e in ("admin.section_loaded", "admin.feature_flag_changed", "admin.system_config_changed"):
            assert e in emits

    def test_slots(self):
        names = [s["name"] for s in _m()["slots"]]
        for s in ("admin_nav_extra", "admin_dashboard_widgets", "admin_user_actions"):
            assert s in names

    def test_migrations_env_config(self):
        m = _m()
        assert m["migrations"]["required"] is True and m["migrations"]["reversible"] is False
        assert "DATABASE_URL" in m["env"]["required"]
        assert m["required_config"] is True

    def test_admin_sections(self):
        names = [s["name"] for s in _m()["admin"]["sections"]]
        for n in ("Feature Flags", "System Config", "Audit Log"):
            assert n in names

    def test_telemetry_and_economics(self):
        m = _m()
        for e in ("admin_page_viewed", "feature_flag_toggled"): assert e in m["runtime"]["telemetry"]["required_events"]
        assert len(m["economics"]["tracked_metrics"]) >= 1
