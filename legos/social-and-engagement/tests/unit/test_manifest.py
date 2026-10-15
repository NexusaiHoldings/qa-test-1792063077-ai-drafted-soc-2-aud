"""Tests for the social-and-engagement lego (social-and-engagement-buildout-001)."""

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
        self.assertEqual(self.m["name"], "social-and-engagement")
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

    def test_five_tools(self) -> None:
        self.assertEqual(set(self.by_name),
                         {"moderate_comment", "summarize_review_sentiment",
                          "detect_spam_engagement", "suggest_referral_reward", "hide_comment"})

    def test_readonly_split(self) -> None:
        for n in ("moderate_comment", "summarize_review_sentiment",
                  "detect_spam_engagement", "suggest_referral_reward"):
            self.assertFalse(self.by_name[n].get("side_effects"), f"{n} read-only")
        self.assertTrue(self.by_name["hide_comment"]["side_effects"])
        self.assertEqual(self.by_name["hide_comment"]["action_class"], "confirm")

    def test_policies_cover_every_tool(self) -> None:
        policies = {p["tool"] for p in yaml.safe_load((_LEGO / "agent" / "policies.yaml").read_text())["policies"]}
        self.assertEqual(set(self.by_name), policies)


class SchemaTests(unittest.TestCase):
    def test_core_tables(self) -> None:
        sql = (_LEGO / "schema" / "001_initial.sql").read_text()
        for table in ("social_comments", "social_reactions", "social_referrals"):
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
            "api/social.ts", "api/_lib/handler.ts", "ui/components/CommentThread.tsx",
            "admin/routes.py", "events/social-events.json", "docs/config.md",
            "docs/slots.md", "decisions/0001-social-lego.md",
        ):
            self.assertTrue((_LEGO / rel).is_file(), f"missing {rel}")


if __name__ == "__main__":
    unittest.main()
