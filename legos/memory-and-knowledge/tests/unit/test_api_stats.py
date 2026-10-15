"""Unit tests for /api/memory/stats."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest


def _seed(fake_db, company_id, long_term=2, working=1, expired=1, forget_logs=2):
    now = datetime.now(timezone.utc)
    for i in range(long_term):
        fake_db.tables["memory_items"].append({
            "id": str(uuid4()),
            "portfolio_company_id": company_id,
            "discipline": "support" if i == 0 else "billing",
            "memory_type": "pattern",
            "status": "active",
            "memory_tier": "long_term",
            "retrieval_count": 0,
            "contradiction_count": 0,
            "last_retrieved_at": None,
            "created_at": now,
        })
    for i in range(working):
        fake_db.tables["portfolio_runtime_memory"].append({
            "id": str(uuid4()),
            "portfolio_company_id": company_id,
            "memory_kind": "active_goal",
            "expires_at": now + timedelta(days=7),
            "last_accessed_at": now,
            "created_at": now,
        })
    for i in range(expired):
        fake_db.tables["portfolio_runtime_memory"].append({
            "id": str(uuid4()),
            "portfolio_company_id": company_id,
            "memory_kind": "in_flight_task",
            "expires_at": now - timedelta(days=1),
            "last_accessed_at": now - timedelta(days=8),
            "created_at": now - timedelta(days=8),
        })
    for i in range(forget_logs):
        fake_db.tables["portfolio_memory_forget_log"].append({
            "id": str(uuid4()),
            "portfolio_company_id": company_id,
            "portfolio_user_id": str(uuid4()),
            "reason": "self",
            "rows_deleted_memory_items": 1,
            "rows_deleted_runtime_memory": 0,
            "created_at": now,
        })


@pytest.mark.asyncio
async def test_stats_happy_path(stats_module, fake_db, make_request, sample_company_id):
    _seed(fake_db, sample_company_id)
    req = make_request(fake_db, query={"portfolio_company_id": sample_company_id})
    resp = await stats_module.memory_stats(req)
    assert resp.status == 200
    data = json.loads(resp.body)
    assert data["long_term"]["total"] == 2
    assert data["working"]["total"] == 1
    assert data["working"]["expired_pending_cleanup"] == 1
    assert data["forget_log_count"] == 2


@pytest.mark.asyncio
async def test_stats_low_utility_candidates(stats_module, fake_db, make_request,
                                            sample_company_id):
    # Seed with one stale long-term row (last retrieved 100 days ago)
    now = datetime.now(timezone.utc)
    fake_db.tables["memory_items"].append({
        "id": str(uuid4()),
        "portfolio_company_id": sample_company_id,
        "discipline": "support",
        "memory_type": "pattern",
        "status": "active",
        "memory_tier": "long_term",
        "last_retrieved_at": now - timedelta(days=100),
        "created_at": now - timedelta(days=120),
    })
    req = make_request(fake_db, query={"portfolio_company_id": sample_company_id})
    resp = await stats_module.memory_stats(req)
    data = json.loads(resp.body)
    assert data["long_term"]["low_utility_candidates"] == 1


@pytest.mark.asyncio
async def test_stats_rejects_missing_company(stats_module, fake_db, make_request):
    req = make_request(fake_db, query={})
    resp = await stats_module.memory_stats(req)
    assert resp.status == 400


@pytest.mark.asyncio
async def test_stats_isolates_other_companies(stats_module, fake_db, make_request):
    company_a = str(uuid4())
    company_b = str(uuid4())
    _seed(fake_db, company_a, long_term=3)
    _seed(fake_db, company_b, long_term=10)
    req = make_request(fake_db, query={"portfolio_company_id": company_a})
    resp = await stats_module.memory_stats(req)
    data = json.loads(resp.body)
    assert data["long_term"]["total"] == 3
