"""Tests for the support-and-help lego manifest + agent contract
(support-and-help-buildout-001). Validates the lego is a real (non-stub)
vertical slice: manifest shape, tools.yaml schema, the §12 tool set, the
read-only vs side-effecting split, schema migration, and that the package
is flipped off stub.
"""

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
        self.assertEqual(self.m["name"], "support-and-help")
        self.assertEqual(self.m["version"], "1.0.0")
        self.assertNotIn("stub", self.m["status"])

    def test_depends_on_identity_and_notifications(self) -> None:
        self.assertEqual(
            set(self.m["depends_on"]), {"identity-and-access", "notifications"}
        )

    def test_slots_declared(self) -> None:
        names = {s["name"] for s in self.m["slots"]}
        self.assertEqual(
            names,
            {"support_widget_launcher", "help_center_link", "after_ticket_resolved_hook"},
        )

    def test_config_schema_has_deflection_and_escalation(self) -> None:
        props = self.m["config_schema"]["properties"]
        self.assertIn("deflection", props)
        self.assertIn("escalation", props)
        self.assertIn("min_kb_confidence", props["deflection"]["properties"])


class PackageJsonTests(unittest.TestCase):
    def test_stub_flag_removed(self) -> None:
        pkg = json.loads((_LEGO / "package.json").read_text())
        self.assertEqual(pkg["version"], "1.0.0")
        self.assertNotIn("__substrate_stub", pkg)


class ToolsYamlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.t = yaml.safe_load((_LEGO / "agent" / "tools.yaml").read_text())
        cls.by_name = {tool["name"]: tool for tool in cls.t["tools"]}

    def test_lego_name(self) -> None:
        self.assertEqual(self.t["lego_name"], "support-and-help")

    def test_five_canonical_tools(self) -> None:
        self.assertEqual(
            set(self.by_name),
            {
                "triage_incoming_ticket", "suggest_kb_article", "draft_response",
                "summarize_ticket_thread", "escalate_to_human",
            },
        )

    def test_read_only_tools_have_no_side_effects(self) -> None:
        for name in ("triage_incoming_ticket", "suggest_kb_article",
                     "draft_response", "summarize_ticket_thread"):
            self.assertFalse(
                self.by_name[name].get("side_effects"),
                f"{name} should be read-only (no side_effects)",
            )

    def test_escalate_is_the_only_side_effecting_confirm_tool(self) -> None:
        esc = self.by_name["escalate_to_human"]
        self.assertTrue(esc["side_effects"], "escalate_to_human must declare side_effects")
        self.assertEqual(esc["action_class"], "confirm")

    def test_every_tool_has_inputs_outputs_schema(self) -> None:
        for name, tool in self.by_name.items():
            self.assertEqual(tool["inputs"]["type"], "object", f"{name} inputs")
            self.assertIn("properties", tool["outputs"], f"{name} outputs")


class AgentContractCompletenessTests(unittest.TestCase):
    def test_perception_policies_skills_present(self) -> None:
        agent = _LEGO / "agent"
        for f in ("tools.yaml", "perception.yaml", "policies.yaml", "skills.md"):
            self.assertTrue((agent / f).is_file(), f"missing agent/{f}")

    def test_policies_cover_every_tool(self) -> None:
        tools = {t["name"] for t in yaml.safe_load((_LEGO / "agent" / "tools.yaml").read_text())["tools"]}
        policies = {p["tool"] for p in yaml.safe_load((_LEGO / "agent" / "policies.yaml").read_text())["policies"]}
        self.assertEqual(tools, policies, "every tool must have a policy entry")


class SchemaTests(unittest.TestCase):
    def test_schema_migration_exists_with_core_tables(self) -> None:
        sql = (_LEGO / "schema" / "001_initial.sql").read_text()
        for table in ("kb_articles", "support_tickets", "support_messages", "support_feedback"):
            self.assertIn(f"CREATE TABLE IF NOT EXISTS {table}", sql)

    def test_no_destructive_ops_in_migration(self) -> None:
        # Strip -- comment lines first (the header legitimately NAMES the banned
        # ops in a "no DROP / TRUNCATE / DELETE-without-WHERE" note).
        raw = (_LEGO / "schema" / "001_initial.sql").read_text()
        code = "\n".join(
            line for line in raw.splitlines() if not line.strip().startswith("--")
        ).upper()
        for banned in ("DROP TABLE", "TRUNCATE", "DELETE FROM"):
            self.assertNotIn(banned, code)


class VerticalSliceTests(unittest.TestCase):
    def test_all_layers_present(self) -> None:
        for rel in (
            "index.ts", "schema/001_initial.sql",
            "agent/tools.yaml", "api/tickets.ts", "api/kb.ts", "api/feedback.ts",
            "api/_lib/handler.ts", "ui/components/SupportWidget.tsx",
            "ui/components/TicketList.tsx", "admin/routes.py",
            "events/support-events.json", "docs/config.md", "docs/slots.md",
            "decisions/0001-support-lego.md",
        ):
            self.assertTrue((_LEGO / rel).is_file(), f"missing {rel}")


if __name__ == "__main__":
    unittest.main()
