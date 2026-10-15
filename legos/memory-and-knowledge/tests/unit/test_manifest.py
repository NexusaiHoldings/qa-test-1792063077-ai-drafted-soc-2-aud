"""Manifest validation against the SS1 JSON Schema."""
from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from packages.legos.manifest import load_manifest, validate_manifest


@pytest.fixture(scope="module")
def manifest() -> dict:
    path = Path(__file__).resolve().parents[2] / "manifest.yaml"
    with path.open() as fh:
        return yaml.safe_load(fh)


def test_manifest_loads(manifest: dict) -> None:
    assert manifest["name"] == "memory-and-knowledge"
    assert manifest["version"] == "0.1.0"
    assert manifest["status"] == "alpha"


def test_manifest_passes_schema_validation() -> None:
    path = Path(__file__).resolve().parents[2] / "manifest.yaml"
    data = load_manifest(str(path))
    ok, errors = validate_manifest(data)
    assert ok, f"Manifest schema validation failed: {errors}"


def test_dependencies(manifest: dict) -> None:
    dep_names = [next(iter(d.keys())) for d in manifest["depends_on"]]
    assert "identity-and-access" in dep_names
    assert "admin-console" in dep_names


def test_required_config_true(manifest: dict) -> None:
    assert manifest["required_config"] is True


def test_config_schema_required_fields(manifest: dict) -> None:
    cfg = manifest["config_schema"]
    assert "working_memory_ttl_days" in cfg["required"]
    assert "long_term_eviction_no_retrieval_days" in cfg["required"]


def test_runtime_emits_canonical_events(manifest: dict) -> None:
    emits = manifest["runtime"]["events"]["emits"]
    assert "memory.stored" in emits
    assert "memory.forgotten" in emits
    assert "memory.demoted" in emits


def test_runtime_subscribes_to_identity_deleted(manifest: dict) -> None:
    subs = manifest["runtime"]["events"]["subscribes_to"]
    assert "identity.user.deleted" in subs


def test_admin_section_present(manifest: dict) -> None:
    sections = manifest["admin"]["sections"]
    assert any(s["name"] == "Memory Inspector" for s in sections)
    assert sections[0]["routes"] == ["/admin/memory"]


def test_compute_profile_low(manifest: dict) -> None:
    assert manifest["runtime"]["cost"]["compute_profile"] == "low"


def test_migrations_required_not_reversible(manifest: dict) -> None:
    assert manifest["migrations"]["required"] is True
    assert manifest["migrations"]["reversible"] is False


def test_telemetry_events(manifest: dict) -> None:
    events = manifest["runtime"]["telemetry"]["required_events"]
    assert "memory_forget_invoked" in events
    assert "knowledge_compiler_run" in events
