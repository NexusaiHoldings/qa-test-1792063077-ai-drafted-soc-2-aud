"""Shared test fixtures for the memory-and-knowledge lego.

Tests use an in-memory FakeDB that mirrors the asyncpg interface (fetch,
fetchrow, fetchval, execute) closely enough for unit coverage. End-to-end
tests against real Postgres live in legos/memory-and-knowledge/tests/integration/.
"""
from __future__ import annotations

import importlib
import importlib.util
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest

# Make the lego importable as `legos.memory_and_knowledge.api.<module>`
_HERE = Path(__file__).resolve()
_LEGO_ROOT = _HERE.parents[2]      # legos/memory-and-knowledge
_REPO_ROOT = _LEGO_ROOT.parents[1]  # repo root
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))


def _load_api_module(name: str):
    """Load legos/memory-and-knowledge/api/<name>.py as a fresh module."""
    path = _LEGO_ROOT / "api" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(f"mk_api_{name}", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def store_module():
    return _load_api_module("store")


@pytest.fixture(scope="module")
def recall_module():
    return _load_api_module("recall")


@pytest.fixture(scope="module")
def promote_module():
    return _load_api_module("promote")


@pytest.fixture(scope="module")
def forget_module():
    return _load_api_module("forget")


@pytest.fixture(scope="module")
def stats_module():
    return _load_api_module("stats")


@pytest.fixture(scope="module")
def compile_module():
    return _load_api_module("compile")


@pytest.fixture(scope="module")
def demote_module():
    return _load_api_module("demote")


class FakeDB:
    """Minimal asyncpg-shaped DB stub keyed by table name in-memory.

    Implements just enough of {fetch, fetchrow, fetchval, execute} for the
    SQL written in this lego. Not a general-purpose SQL engine.
    """

    def __init__(self) -> None:
        self.tables: dict[str, list[dict[str, Any]]] = {
            "memory_items": [],
            "portfolio_runtime_memory": [],
            "portfolio_memory_forget_log": [],
            "portfolio_knowledge_compiler_runs": [],
        }

    # ─── helpers ────────────────────────────────────────────────────────────
    def _now(self) -> datetime:
        return datetime.now(timezone.utc)

    @staticmethod
    def _parse_jsonb(value: Any) -> Any:
        if isinstance(value, str):
            try:
                return json.loads(value)
            except (json.JSONDecodeError, ValueError):
                return value
        return value

    # ─── asyncpg-style API ──────────────────────────────────────────────────
    async def execute(self, sql: str, *params: Any) -> str:
        sql_lower = sql.lower().strip()
        if sql_lower.startswith("insert into memory_items"):
            self.tables["memory_items"].append(self._build_memory_item(params))
        elif sql_lower.startswith("insert into portfolio_runtime_memory"):
            self.tables["portfolio_runtime_memory"].append(
                self._build_runtime_memory(params)
            )
        elif sql_lower.startswith("update portfolio_runtime_memory"):
            ids = params[0] if params else []
            for row in self.tables["portfolio_runtime_memory"]:
                if row["id"] in ids:
                    row["last_accessed_at"] = self._now()
        elif sql_lower.startswith("update memory_items") and "set retrieval_count" in sql_lower:
            ids = params[0] if params else []
            for row in self.tables["memory_items"]:
                if row["id"] in ids:
                    row["retrieval_count"] = (row.get("retrieval_count") or 0) + 1
                    row["last_retrieved_at"] = self._now()
        elif sql_lower.startswith("update memory_items") and "set status = 'demoted'" in sql_lower:
            for row in self.tables["memory_items"]:
                if row["id"] == params[0]:
                    row["status"] = "demoted"
        elif sql_lower.startswith("delete from portfolio_runtime_memory"):
            target_id = params[0]
            self.tables["portfolio_runtime_memory"] = [
                r for r in self.tables["portfolio_runtime_memory"] if r["id"] != target_id
            ]
        elif sql_lower.startswith("insert into portfolio_knowledge_compiler_runs"):
            self.tables["portfolio_knowledge_compiler_runs"].append({
                "id": params[0],
                "portfolio_company_id": params[1],
                "started_at": self._now(),
                "finished_at": None,
                "rows_processed": 0,
                "patterns_extracted": 0,
                "status": params[2] if len(params) > 2 else "running",
                "error": None,
            })
        elif sql_lower.startswith("update portfolio_knowledge_compiler_runs"):
            # Pattern: UPDATE ... SET finished_at, rows_processed, patterns_extracted, status WHERE id
            run_id = params[-1]
            for r in self.tables["portfolio_knowledge_compiler_runs"]:
                if r["id"] == run_id:
                    if "rows_processed" in sql_lower and len(params) >= 4:
                        r["rows_processed"] = int(params[0])
                        r["patterns_extracted"] = int(params[1])
                        r["status"] = "complete"
                    elif "status = 'failed'" in sql_lower:
                        r["status"] = "failed"
                        r["error"] = str(params[0]) if params else None
                    r["finished_at"] = self._now()
        return "OK"

    async def fetch(self, sql: str, *params: Any) -> list[dict[str, Any]]:
        sql_lower = sql.lower()
        # GROUP BY routes must come before the broad SELECT routes
        if "group by discipline" in sql_lower:
            company_id = params[0]
            counts: dict[str, int] = {}
            for r in self.tables["memory_items"]:
                if r.get("portfolio_company_id") == company_id and r.get("memory_tier") == "long_term":
                    counts[r.get("discipline") or "general"] = counts.get(r.get("discipline") or "general", 0) + 1
            return [{"discipline": k, "n": v} for k, v in counts.items()]
        if "group by memory_kind" in sql_lower:
            company_id = params[0]
            counts: dict[str, int] = {}
            now = self._now()
            for r in self.tables["portfolio_runtime_memory"]:
                if r.get("portfolio_company_id") == company_id and r.get("expires_at") > now:
                    counts[r.get("memory_kind")] = counts.get(r.get("memory_kind"), 0) + 1
            return [{"memory_kind": k, "n": v} for k, v in counts.items()]
        if "from memory_items" in sql_lower and "where" in sql_lower:
            return self._select_memory_items(sql, params)
        if "from portfolio_runtime_memory" in sql_lower and "where" in sql_lower:
            return self._select_runtime_memory(sql, params)
        if "from portfolio_memory_forget_log" in sql_lower:
            company_id = params[0] if params else None
            rows = [
                r for r in self.tables["portfolio_memory_forget_log"]
                if r["portfolio_company_id"] == company_id
            ]
            return rows
        if "group by discipline" in sql_lower:
            company_id = params[0]
            counts: dict[str, int] = {}
            for r in self.tables["memory_items"]:
                if r.get("portfolio_company_id") == company_id and r.get("memory_tier") == "long_term":
                    counts[r.get("discipline") or "general"] = counts.get(r.get("discipline") or "general", 0) + 1
            return [{"discipline": k, "n": v} for k, v in counts.items()]
        if "group by memory_kind" in sql_lower:
            company_id = params[0]
            counts: dict[str, int] = {}
            now = self._now()
            for r in self.tables["portfolio_runtime_memory"]:
                if r.get("portfolio_company_id") == company_id and r.get("expires_at") > now:
                    counts[r.get("memory_kind")] = counts.get(r.get("memory_kind"), 0) + 1
            return [{"memory_kind": k, "n": v} for k, v in counts.items()]
        return []

    async def fetchrow(self, sql: str, *params: Any) -> dict[str, Any] | None:
        sql_lower = sql.lower()
        if "from portfolio_runtime_memory" in sql_lower and "where id" in sql_lower:
            target_id = params[0]
            for r in self.tables["portfolio_runtime_memory"]:
                if r["id"] == target_id:
                    return r
            return None
        if "update memory_items" in sql_lower and "contradiction_count = contradiction_count + 1" in sql_lower:
            target_id = params[0]
            for r in self.tables["memory_items"]:
                if r["id"] == target_id and r.get("memory_tier") == "long_term" and r.get("status") == "active":
                    r["contradiction_count"] = (r.get("contradiction_count") or 0) + 1
                    return {"id": r["id"], "contradiction_count": r["contradiction_count"]}
            return None
        if "from portfolio_knowledge_compiler_runs" in sql_lower:
            company_id = params[0]
            rows = [
                r for r in self.tables["portfolio_knowledge_compiler_runs"]
                if r["portfolio_company_id"] == company_id
            ]
            if not rows:
                return None
            rows.sort(key=lambda r: r["started_at"], reverse=True)
            return {"id": rows[0]["id"], "started_at": rows[0]["started_at"]}
        if "update memory_items" in sql_lower and "demoted" in sql_lower and "returning id" in sql_lower:
            target_id = params[0]
            for r in self.tables["memory_items"]:
                if r["id"] == target_id and r.get("status") == "active":
                    r["status"] = "demoted"
                    return {"id": r["id"]}
            return None
        return None

    async def fetchval(self, sql: str, *params: Any) -> Any:
        sql_lower = sql.lower().strip()
        if sql_lower.startswith("with del as") and "memory_items" in sql_lower:
            company_id, user_id = params
            before = len(self.tables["memory_items"])
            self.tables["memory_items"] = [
                r for r in self.tables["memory_items"]
                if not (
                    r.get("portfolio_company_id") == company_id
                    and r.get("portfolio_user_id") == user_id
                )
            ]
            return before - len(self.tables["memory_items"])
        if sql_lower.startswith("with del as") and "portfolio_runtime_memory" in sql_lower:
            company_id, user_id = params
            before = len(self.tables["portfolio_runtime_memory"])
            self.tables["portfolio_runtime_memory"] = [
                r for r in self.tables["portfolio_runtime_memory"]
                if not (
                    r.get("portfolio_company_id") == company_id
                    and r.get("portfolio_user_id") == user_id
                )
            ]
            return before - len(self.tables["portfolio_runtime_memory"])
        if sql_lower.startswith("with demoted") and "memory_items" in sql_lower:
            company_id = params[0]
            no_retrieval_days = int(params[1])
            cutoff = self._now() - timedelta(days=no_retrieval_days)
            count = 0
            for r in self.tables["memory_items"]:
                if (
                    r.get("portfolio_company_id") == company_id
                    and r.get("memory_tier") == "long_term"
                    and r.get("status") == "active"
                ):
                    last_ret = r.get("last_retrieved_at")
                    if last_ret is None or last_ret < cutoff:
                        r["status"] = "demoted"
                        count += 1
            return count
        if sql_lower.startswith("insert into portfolio_memory_forget_log"):
            audit_id = uuid4()
            now = self._now()
            row = {
                "id": str(audit_id),
                "portfolio_company_id": params[0],
                "portfolio_user_id": params[1],
                "requested_by_user_id": params[2],
                "reason": params[3],
                "rows_deleted_memory_items": params[4],
                "rows_deleted_runtime_memory": params[5],
                "created_at": now,
            }
            self.tables["portfolio_memory_forget_log"].append(row)
            return str(audit_id)
        if "from portfolio_memory_forget_log" in sql_lower and "count(*)" in sql_lower:
            company_id = params[0]
            return sum(
                1 for r in self.tables["portfolio_memory_forget_log"]
                if r["portfolio_company_id"] == company_id
            )
        if "max(started_at)" in sql_lower:
            company_id = params[0]
            runs = [
                r for r in self.tables["portfolio_knowledge_compiler_runs"]
                if r["portfolio_company_id"] == company_id
            ]
            if not runs:
                return None
            return max(r["started_at"] for r in runs)
        if "from memory_items" in sql_lower and (
            "count(*)" in sql_lower or "count(distinct" in sql_lower
        ):
            return self._count_memory_items(sql, params)
        if "from portfolio_runtime_memory" in sql_lower and "count(*)" in sql_lower:
            return self._count_runtime_memory(sql, params)
        return None

    # ─── INSERT helpers ─────────────────────────────────────────────────────
    def _build_memory_item(self, params: tuple[Any, ...]) -> dict[str, Any]:
        # Two INSERT shapes — store.py (10 params) and promote.py (10 params).
        # Both follow the same column order:
        # (id, company, user, scope, discipline, type, payload, importance, status, tier)
        return {
            "id": params[0],
            "portfolio_company_id": params[1],
            "portfolio_user_id": params[2],
            "scope_type": "company",
            "discipline": params[3],
            "memory_type": params[4],
            "payload_json": self._parse_jsonb(params[5]),
            "importance": params[6],
            "status": "active",
            "memory_tier": "long_term",
            "retrieval_count": 0,
            "contradiction_count": 0,
            "last_retrieved_at": None,
            "created_at": self._now(),
        }

    def _build_runtime_memory(self, params: tuple[Any, ...]) -> dict[str, Any]:
        # store.py: (id, company, user, workflow, kind, payload, expires_at)
        now = self._now()
        return {
            "id": params[0],
            "portfolio_company_id": params[1],
            "portfolio_user_id": params[2],
            "workflow_id": params[3],
            "memory_kind": params[4],
            "payload": self._parse_jsonb(params[5]),
            "expires_at": params[6],
            "last_accessed_at": now,
            "created_at": now,
        }

    # ─── SELECT helpers ─────────────────────────────────────────────────────
    def _select_memory_items(self, sql: str, params: tuple[Any, ...]) -> list[dict[str, Any]]:
        company_id = params[0]
        rows = [
            r for r in self.tables["memory_items"]
            if r.get("portfolio_company_id") == company_id
        ]
        if "memory_tier = 'long_term'" in sql:
            rows = [r for r in rows if r.get("memory_tier") == "long_term"]
        if "status = 'active'" in sql:
            rows = [r for r in rows if r.get("status") == "active"]
        # Optional user_id + discipline filters: parse from sql + remaining params
        param_idx = 1
        if "portfolio_user_id" in sql and "WHERE" in sql.upper():
            if param_idx < len(params) - 1:  # last param is limit
                user_id = params[param_idx]
                rows = [r for r in rows if r.get("portfolio_user_id") == user_id]
                param_idx += 1
        if "discipline = $" in sql:
            if param_idx < len(params) - 1:
                discipline = params[param_idx]
                rows = [r for r in rows if r.get("discipline") == discipline]
                param_idx += 1
        rows.sort(key=lambda r: r.get("created_at"), reverse=True)
        # Last param is the LIMIT
        limit = params[-1] if params else 50
        return rows[: int(limit)]

    def _select_runtime_memory(self, sql: str, params: tuple[Any, ...]) -> list[dict[str, Any]]:
        company_id = params[0]
        now = self._now()
        rows = [
            r for r in self.tables["portfolio_runtime_memory"]
            if r.get("portfolio_company_id") == company_id and r.get("expires_at") > now
        ]
        param_idx = 1
        if "portfolio_user_id" in sql:
            if param_idx < len(params) - 1:
                user_id = params[param_idx]
                rows = [r for r in rows if r.get("portfolio_user_id") == user_id]
                param_idx += 1
        if "memory_kind" in sql and "memory_kind = $" in sql:
            if param_idx < len(params) - 1:
                kind = params[param_idx]
                rows = [r for r in rows if r.get("memory_kind") == kind]
                param_idx += 1
        rows.sort(key=lambda r: r.get("last_accessed_at"), reverse=True)
        limit = params[-1] if params else 50
        return rows[: int(limit)]

    def _count_memory_items(self, sql: str, params: tuple[Any, ...]) -> int:
        company_id = params[0]
        rows = [
            r for r in self.tables["memory_items"]
            if r.get("portfolio_company_id") == company_id
        ]
        if "memory_tier = 'long_term'" in sql:
            rows = [r for r in rows if r.get("memory_tier") == "long_term"]
        if "status = 'active'" in sql:
            rows = [r for r in rows if r.get("status") == "active"]
        if "last_retrieved_at" in sql and "no_retrieval" not in sql:
            # low-utility candidate count
            no_retrieval_days = int(params[1])
            cutoff = self._now() - timedelta(days=no_retrieval_days)
            rows = [
                r for r in rows
                if r.get("last_retrieved_at") is None or r.get("last_retrieved_at") < cutoff
            ]
        if "count(distinct discipline)" in sql.lower():
            return len({r.get("discipline") for r in rows})
        return len(rows)

    def _count_runtime_memory(self, sql: str, params: tuple[Any, ...]) -> int:
        company_id = params[0]
        now = self._now()
        rows = [
            r for r in self.tables["portfolio_runtime_memory"]
            if r.get("portfolio_company_id") == company_id
        ]
        if "expires_at > now()" in sql:
            rows = [r for r in rows if r.get("expires_at") > now]
        if "expires_at <= now()" in sql:
            rows = [r for r in rows if r.get("expires_at") <= now]
        return len(rows)


@pytest.fixture
def fake_db() -> FakeDB:
    return FakeDB()


class FakeRequest:
    """Minimal aiohttp.web.Request stub."""

    def __init__(self, app: dict[str, Any], body: dict[str, Any] | None = None,
                 query: dict[str, str] | None = None) -> None:
        self.app = app
        self._body = body or {}
        self.query = query or {}

    async def json(self) -> dict[str, Any]:
        return self._body


@pytest.fixture
def make_request():
    def _make(db: FakeDB, body: dict[str, Any] | None = None,
              query: dict[str, str] | None = None,
              memory_config: dict[str, Any] | None = None) -> FakeRequest:
        app = {
            "db": db,
            "memory_config": memory_config or {
                "working_memory_ttl_days": 7,
                "long_term_eviction_no_retrieval_days": 90,
                "contradiction_threshold": 3,
                "knowledge_compiler_debounce_seconds": 300,
            },
        }
        return FakeRequest(app=app, body=body, query=query)
    return _make


@pytest.fixture
def sample_company_id() -> str:
    return str(uuid4())


@pytest.fixture
def sample_user_id() -> str:
    return str(uuid4())
