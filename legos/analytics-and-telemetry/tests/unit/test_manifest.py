"""Tests for the analytics-and-telemetry lego (analytics-and-telemetry-buildout-001)."""

import json
import unittest
from pathlib import Path

import yaml

_LEGO = Path(__file__).resolve().parents[2]


class ManifestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.m = yaml.safe_load((_LEGO / "manifest.yaml").read_text())

    def test_not_a_stub(self) -> None:
        self.assertEqual(self.m["name"], "analytics-and-telemetry")
        self.assertEqual(self.m["version"], "1.0.0")
        self.assertNotIn("stub", self.m["status"])


class PackageJsonTests(unittest.TestCase):
    def test_stub_flag_removed(self) -> None:
        pkg = json.loads((_LEGO / "package.json").read_text())
        self.assertEqual(pkg["version"], "1.0.0")
        self.assertNotIn("__substrate_stub", pkg)


class ToolsYamlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.by_name = {t["name"]: t for t in yaml.safe_load((_LEGO / "agent" / "tools.yaml").read_text())["tools"]}

    def test_four_readonly_tools(self) -> None:
        self.assertEqual(set(self.by_name),
                         {"summarize_funnel_performance", "detect_metric_anomaly",
                          "recommend_event_to_track", "explain_retention_drop"})
        for t in self.by_name.values():
            self.assertFalse(t.get("side_effects"), f"{t['name']} should be read-only")

    def test_policies_cover_every_tool(self) -> None:
        policies = {p["tool"] for p in yaml.safe_load((_LEGO / "agent" / "policies.yaml").read_text())["policies"]}
        self.assertEqual(set(self.by_name), policies)


class SchemaTests(unittest.TestCase):
    def test_core_tables(self) -> None:
        sql = (_LEGO / "schema" / "001_initial.sql").read_text()
        for table in ("analytics_events", "analytics_funnels"):
            self.assertIn(f"CREATE TABLE IF NOT EXISTS {table}", sql)

    def test_no_destructive_ops(self) -> None:
        raw = (_LEGO / "schema" / "001_initial.sql").read_text()
        code = "\n".join(l for l in raw.splitlines() if not l.strip().startswith("--")).upper()
        for banned in ("DROP TABLE", "TRUNCATE", "DELETE FROM"):
            self.assertNotIn(banned, code)


class VerticalSliceTests(unittest.TestCase):
    def test_all_layers_present(self) -> None:
        for rel in (
            "index.ts", "schema/001_initial.sql", "agent/tools.yaml",
            "agent/perception.yaml", "agent/policies.yaml", "agent/skills.md",
            "api/analytics.ts", "api/_lib/handler.ts", "ui/components/AnalyticsDashboard.tsx",
            "admin/routes.py", "events/analytics-events.json", "docs/config.md",
            "docs/slots.md", "decisions/0001-analytics-lego.md",
        ):
            self.assertTrue((_LEGO / rel).is_file(), f"missing {rel}")


if __name__ == "__main__":
    unittest.main()
