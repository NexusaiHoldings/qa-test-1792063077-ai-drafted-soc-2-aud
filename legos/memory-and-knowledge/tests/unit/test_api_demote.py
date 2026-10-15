"""Unit tests for /api/memory/contradict and /api/memory/evict-low-utility."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest


def _seed_active_long_term(fake_db, company_id, count=1, contradiction_count=0,
                           last_retrieved_at=None):
    ids = []
    now = datetime.now(timezone.utc)
    for i in range(count):
        row_id = str(uuid4())
        ids.append(row_id)
        fake_db.tables["memory_items"].append({
            "id": row_id,
            "portfolio_company_id": company_id,
            "portfolio_user_id": None,
            "discipline": "support",
            "memory_type": "pattern",
            "payload_json": {"i": i},
            "importance": "medium",
            "status": "active",
            "memory_tier": "long_term",
            "retrieval_count": 0,
            "contradiction_count": contradiction_count,
            "last_retrieved_at": last_retrieved_at,
            "created_at": now,
        })
    return ids


@pytest.mark.asyncio
async def test_contradict_increments_count(demote_module, fake_db, make_request,
                                           sample_company_id):
    [memory_id] = _seed_active_long_term(fake_db, sample_company_id, 1)
    req = make_request(fake_db, body={"memory_id": memory_id})
    resp = await demote_module.record_contradiction(req)
    assert resp.status == 200
    data = json.loads(resp.body)
    assert data["contradiction_count"] == 1
    assert data["demoted"] is False


@pytest.mark.asyncio
async def test_contradict_demotes_at_threshold(demote_module, fake_db, make_request,
                                               sample_company_id):
    # Pre-seed with 2 contradictions; threshold is 3 by default
    [memory_id] = _seed_active_long_term(fake_db, sample_company_id, 1,
                                         contradiction_count=2)
    req = make_request(fake_db, body={"memory_id": memory_id})
    resp = await demote_module.record_contradiction(req)
    data = json.loads(resp.body)
    assert data["contradiction_count"] == 3
    assert data["demoted"] is True
    row = fake_db.tables["memory_items"][0]
    assert row["status"] == "demoted"


@pytest.mark.asyncio
async def test_contradict_404_for_unknown_memory(demote_module, fake_db, make_request):
    req = make_request(fake_db, body={"memory_id": str(uuid4())})
    resp = await demote_module.record_contradiction(req)
    assert resp.status == 404


@pytest.mark.asyncio
async def test_contradict_rejects_missing_memory_id(demote_module, fake_db, make_request):
    req = make_request(fake_db, body={})
    resp = await demote_module.record_contradiction(req)
    assert resp.status == 400


@pytest.mark.asyncio
async def test_evict_low_utility_dry_run(demote_module, fake_db, make_request,
                                         sample_company_id):
    old_date = datetime.now(timezone.utc) - timedelta(days=120)
    _seed_active_long_term(fake_db, sample_company_id, count=3,
                           last_retrieved_at=old_date)
    _seed_active_long_term(fake_db, sample_company_id, count=2,
                           last_retrieved_at=datetime.now(timezone.utc))
    req = make_request(fake_db, body={
        "portfolio_company_id": sample_company_id,
        "dry_run": True,
    })
    resp = await demote_module.evict_low_utility(req)
    assert resp.status == 200
    data = json.loads(resp.body)
    assert data["demoted_count"] == 3
    assert data["dry_run"] is True
    # No actual demotion happened
    active_rows = [r for r in fake_db.tables["memory_items"] if r["status"] == "active"]
    assert len(active_rows) == 5


@pytest.mark.asyncio
async def test_evict_low_utility_real_run(demote_module, fake_db, make_request,
                                          sample_company_id):
    old_date = datetime.now(timezone.utc) - timedelta(days=120)
    _seed_active_long_term(fake_db, sample_company_id, count=3,
                           last_retrieved_at=old_date)
    req = make_request(fake_db, body={
        "portfolio_company_id": sample_company_id,
    })
    resp = await demote_module.evict_low_utility(req)
    data = json.loads(resp.body)
    assert data["demoted_count"] == 3
    demoted_rows = [r for r in fake_db.tables["memory_items"] if r["status"] == "demoted"]
    assert len(demoted_rows) == 3
