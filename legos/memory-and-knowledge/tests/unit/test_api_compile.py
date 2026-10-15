"""Unit tests for /api/memory/compile — knowledge compiler with debounce."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest


def _seed_long_term(fake_db, company_id, count, discipline="support"):
    now = datetime.now(timezone.utc)
    for i in range(count):
        fake_db.tables["memory_items"].append({
            "id": str(uuid4()),
            "portfolio_company_id": company_id,
            "discipline": discipline,
            "memory_type": "pattern",
            "payload_json": {"i": i},
            "status": "active",
            "memory_tier": "long_term",
            "retrieval_count": 0,
            "contradiction_count": 0,
            "last_retrieved_at": None,
            "created_at": now,
        })


@pytest.mark.asyncio
async def test_compile_happy_path(compile_module, fake_db, make_request,
                                  sample_company_id):
    _seed_long_term(fake_db, sample_company_id, count=5, discipline="support")
    _seed_long_term(fake_db, sample_company_id, count=3, discipline="billing")
    req = make_request(fake_db, body={"portfolio_company_id": sample_company_id})
    resp = await compile_module.compile_knowledge(req)
    assert resp.status == 200
    data = json.loads(resp.body)
    assert data["status"] == "complete"
    assert data["rows_processed"] == 8
    # Disciplines = 2 (support + billing) → compiler v1 surfaces 2 patterns
    assert data["patterns_extracted"] == 2
    runs = fake_db.tables["portfolio_knowledge_compiler_runs"]
    assert len(runs) == 1


@pytest.mark.asyncio
async def test_compile_debounce(compile_module, fake_db, make_request, sample_company_id):
    # Seed a recent (50s ago) successful run
    fake_db.tables["portfolio_knowledge_compiler_runs"].append({
        "id": str(uuid4()),
        "portfolio_company_id": sample_company_id,
        "started_at": datetime.now(timezone.utc) - timedelta(seconds=50),
        "finished_at": datetime.now(timezone.utc) - timedelta(seconds=40),
        "status": "complete",
        "rows_processed": 0,
        "patterns_extracted": 0,
    })
    req = make_request(fake_db, body={"portfolio_company_id": sample_company_id})
    resp = await compile_module.compile_knowledge(req)
    assert resp.status == 429
    data = json.loads(resp.body)
    assert data["error"] == "debounced"
    assert data["retry_after_seconds"] > 0


@pytest.mark.asyncio
async def test_compile_force_bypasses_debounce(compile_module, fake_db, make_request,
                                               sample_company_id):
    fake_db.tables["portfolio_knowledge_compiler_runs"].append({
        "id": str(uuid4()),
        "portfolio_company_id": sample_company_id,
        "started_at": datetime.now(timezone.utc) - timedelta(seconds=10),
        "finished_at": datetime.now(timezone.utc) - timedelta(seconds=5),
        "status": "complete",
        "rows_processed": 0,
        "patterns_extracted": 0,
    })
    _seed_long_term(fake_db, sample_company_id, count=2)
    req = make_request(fake_db, body={
        "portfolio_company_id": sample_company_id,
        "force": True,
    })
    resp = await compile_module.compile_knowledge(req)
    assert resp.status == 200


@pytest.mark.asyncio
async def test_compile_rejects_missing_company(compile_module, fake_db, make_request):
    req = make_request(fake_db, body={})
    resp = await compile_module.compile_knowledge(req)
    assert resp.status == 400


@pytest.mark.asyncio
async def test_compile_no_memories_runs_to_completion(compile_module, fake_db,
                                                     make_request, sample_company_id):
    req = make_request(fake_db, body={"portfolio_company_id": sample_company_id})
    resp = await compile_module.compile_knowledge(req)
    data = json.loads(resp.body)
    assert resp.status == 200
    assert data["rows_processed"] == 0
    assert data["patterns_extracted"] == 0
