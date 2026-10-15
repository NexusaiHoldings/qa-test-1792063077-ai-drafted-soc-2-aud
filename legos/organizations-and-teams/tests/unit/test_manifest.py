"""Tests for the organizations-and-teams lego (organizations-and-teams-buildout-001)."""

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
        self.assertEqual(self.m["name"], "organizations-and-teams")
        self.assertEqual(self.m["version"], "1.0.0")
        self.assertNotIn("stub", self.m["status"])

    def test_depends_on(self) -> None:
        self.assertEqual(set(self.m["depends_on"]), {"identity-and-access", "notifications"})

    def test_slots(self) -> None:
        names = {s["name"] for s in self.m["slots"]}
        self.assertEqual(names, {"org_switcher", "members_table", "after_member_joined_hook"})

    def test_config_has_roles_and_seats(self) -> None:
        props = self.m["config_schema"]["properties"]
        self.assertIn("roles", props)
        self.assertIn("seats", props)


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
        self.assertEqual(
            set(self.by_name),
            {"recommend_role_for_member", "detect_unused_seats", "summarize_org_activity",
             "flag_permission_anomaly", "change_member_role"},
        )

    def test_read_only_tools(self) -> None:
        for name in ("recommend_role_for_member", "detect_unused_seats",
                     "summarize_org_activity", "flag_permission_anomaly"):
            self.assertFalse(self.by_name[name].get("side_effects"), f"{name} read-only")

    def test_change_role_is_side_effecting_confirm(self) -> None:
        cr = self.by_name["change_member_role"]
        self.assertTrue(cr["side_effects"])
        self.assertEqual(cr["action_class"], "confirm")

    def test_policies_cover_every_tool(self) -> None:
        policies = {p["tool"] for p in yaml.safe_load((_LEGO / "agent" / "policies.yaml").read_text())["policies"]}
        self.assertEqual(set(self.by_name), policies)


class SchemaTests(unittest.TestCase):
    def test_core_tables(self) -> None:
        sql = (_LEGO / "schema" / "001_initial.sql").read_text()
        for table in ("organizations", "org_members", "org_invitations", "org_audit_log"):
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
            "api/orgs.ts", "api/_lib/handler.ts",
            "ui/components/MembersTable.tsx", "ui/components/OrgSwitcher.tsx",
            "admin/routes.py", "events/org-events.json", "docs/config.md",
            "docs/slots.md", "decisions/0001-orgs-lego.md",
        ):
            self.assertTrue((_LEGO / rel).is_file(), f"missing {rel}")


if __name__ == "__main__":
    unittest.main()
