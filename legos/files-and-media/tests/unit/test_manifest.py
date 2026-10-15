"""Tests for the files-and-media lego (files-and-media-buildout-001)."""

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
        self.assertEqual(self.m["name"], "files-and-media")
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

    def test_four_tools(self) -> None:
        self.assertEqual(set(self.by_name),
                         {"categorize_uploaded_file", "extract_structured_data",
                          "flag_anomaly_in_dataset", "quarantine_file"})

    def test_readonly_split(self) -> None:
        for n in ("categorize_uploaded_file", "extract_structured_data", "flag_anomaly_in_dataset"):
            self.assertFalse(self.by_name[n].get("side_effects"), f"{n} read-only")
        self.assertTrue(self.by_name["quarantine_file"]["side_effects"])
        self.assertEqual(self.by_name["quarantine_file"]["action_class"], "confirm")

    def test_policies_cover_every_tool(self) -> None:
        policies = {p["tool"] for p in yaml.safe_load((_LEGO / "agent" / "policies.yaml").read_text())["policies"]}
        self.assertEqual(set(self.by_name), policies)


class SchemaTests(unittest.TestCase):
    def test_core_tables(self) -> None:
        sql = (_LEGO / "schema" / "001_initial.sql").read_text()
        for table in ("files", "file_extractions"):
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
            "api/files.ts", "api/_lib/handler.ts", "ui/components/FileUploader.tsx",
            "admin/routes.py", "events/files-events.json", "docs/config.md",
            "docs/slots.md", "decisions/0001-files-lego.md",
        ):
            self.assertTrue((_LEGO / rel).is_file(), f"missing {rel}")


if __name__ == "__main__":
    unittest.main()
