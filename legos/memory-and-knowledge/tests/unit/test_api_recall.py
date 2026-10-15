"""Unit tests for /api/memory/recall."""
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
            "portfolio_user_id": None,
            "scope_type": "company",
            "discipline": discipline,
            "memory_type": "pattern",
            "payload_json": {"i": i},
            "importance": "medium",
            "status": "active",
            "memory_tier": "long_term",
            "retrieval_count": 0,
            "contradiction_count": 0,
            "last_retrieved_at": None,
            "created_at": now - timedelta(seconds=i),
        })


def _seed_working(fake_db, company_id, count, kind="active_goal"):
    now = datetime.now(timezone.utc)
    for i in range(count):
        fake_db.tables["portfolio_runtime_memory"].append({
            "id": str(uuid4()),
            "portfolio_company_id": company_id,
            "portfolio_user_id": None,
            "workflow_id": None,
            "memory_kind": kind,
            "payload": {"i": i},
            "expires_at": now + timedelta(days=7),
            "last_accessed_at": now - timedelta(seconds=i),
            "created_at": now,
        })


@pytest.mark.asyncio
async def test_recall_long_term_happy_path(recall_module, fake_db, make_request,
                                           sample_company_id):
    _seed_long_term(fake_db, sample_company_id, 5)
    req = make_request(fake_db, query={
        "portfolio_company_id": sample_company_id,
        "memory_tier": "long_term",
    })
    resp = await recall_module.recall_memories(req)
    assert resp.status == 200
    data = json.loads(resp.body)
    assert data["count"] == 5
    assert len(data["memories"]) == 5


@pytest.mark.asyncio
async def test_recall_working_happy_path(recall_module, fake_db, make_request,
                                         sample_company_id):
    _seed_working(fake_db, sample_company_id, 3)
    req = make_request(fake_db, query={
        "portfolio_company_id": sample_company_id,
        "memory_tier": "working",
    })
    resp = await recall_module.recall_memories(req)
    assert resp.status == 200
    data = json.loads(resp.body)
    assert data["count"] == 3


@pytest.mark.asyncio
async def test_recall_increments_retrieval_count(recall_module, fake_db, make_request,
                                                 sample_company_id):
    _seed_long_term(fake_db, sample_company_id, 2)
    req = make_request(fake_db, query={
        "portfolio_company_id": sample_company_id,
        "memory_tier": "long_term",
    })
    await recall_module.recall_memories(req)
    for row in fake_db.tables["memory_items"]:
        assert row["retrieval_count"] == 1
        assert row["last_retrieved_at"] is not None


@pytest.mark.asyncio
async def test_recall_rejects_invalid_tier(recall_module, fake_db, make_request,
                                           sample_company_id):
    req = make_request(fake_db, query={
        "portfolio_company_id": sample_company_id,
        "memory_tier": "short_term",
    })
    resp = await recall_module.recall_memories(req)
    assert resp.status == 400


@pytest.mark.asyncio
async def test_recall_rejects_missing_company(recall_module, fake_db, make_request):
    req = make_request(fake_db, query={"memory_tier": "long_term"})
    resp = await recall_module.recall_memories(req)
    assert resp.status == 400


@pytest.mark.asyncio
async def test_recall_clamps_limit_above_max(recall_module, fake_db, make_request,
                                             sample_company_id):
    _seed_long_term(fake_db, sample_company_id, 5)
    req = make_request(fake_db, query={
        "portfolio_company_id": sample_company_id,
        "memory_tier": "long_term",
        "limit": "5000",
    })
    resp = await recall_module.recall_memories(req)
    assert resp.status == 200


@pytest.mark.asyncio
async def test_recall_isolation_between_companies(recall_module, fake_db, make_request):
    company_a = str(uuid4())
    company_b = str(uuid4())
    _seed_long_term(fake_db, company_a, 3)
    _seed_long_term(fake_db, company_b, 4)
    req = make_request(fake_db, query={
        "portfolio_company_id": company_a,
        "memory_tier": "long_term",
    })
    resp = await recall_module.recall_memories(req)
    data = json.loads(resp.body)
    assert data["count"] == 3
