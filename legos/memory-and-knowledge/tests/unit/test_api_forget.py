"""Unit tests for /api/memory/forget — GDPR right-to-be-forgotten."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest


def _seed_user_memories(fake_db, company_id, user_id, long_term_count=3, working_count=2):
    now = datetime.now(timezone.utc)
    for i in range(long_term_count):
        fake_db.tables["memory_items"].append({
            "id": str(uuid4()),
            "portfolio_company_id": company_id,
            "portfolio_user_id": user_id,
            "discipline": "support",
            "memory_type": "decision",
            "payload_json": {"i": i},
            "importance": "medium",
            "status": "active",
            "memory_tier": "long_term",
            "retrieval_count": 0,
            "contradiction_count": 0,
            "last_retrieved_at": None,
            "created_at": now,
        })
    for i in range(working_count):
        fake_db.tables["portfolio_runtime_memory"].append({
            "id": str(uuid4()),
            "portfolio_company_id": company_id,
            "portfolio_user_id": user_id,
            "workflow_id": None,
            "memory_kind": "active_goal",
            "payload": {"i": i},
            "expires_at": now + timedelta(days=7),
            "last_accessed_at": now,
            "created_at": now,
        })


@pytest.mark.asyncio
async def test_forget_happy_path(forget_module, fake_db, make_request,
                                 sample_company_id, sample_user_id):
    _seed_user_memories(fake_db, sample_company_id, sample_user_id, 3, 2)
    req = make_request(fake_db, body={
        "portfolio_company_id": sample_company_id,
        "portfolio_user_id": sample_user_id,
        "reason": "gdpr_self_request",
    })
    resp = await forget_module.forget_user(req)
    assert resp.status == 200
    data = json.loads(resp.body)
    assert data["rows_deleted_memory_items"] == 3
    assert data["rows_deleted_runtime_memory"] == 2
    assert data["audit_id"] is not None
    # Audit row written
    assert len(fake_db.tables["portfolio_memory_forget_log"]) == 1


@pytest.mark.asyncio
async def test_forget_idempotent_second_call(forget_module, fake_db, make_request,
                                             sample_company_id, sample_user_id):
    _seed_user_memories(fake_db, sample_company_id, sample_user_id, 2, 1)
    body = {
        "portfolio_company_id": sample_company_id,
        "portfolio_user_id": sample_user_id,
    }
    await forget_module.forget_user(make_request(fake_db, body=body))
    resp2 = await forget_module.forget_user(make_request(fake_db, body=body))
    data2 = json.loads(resp2.body)
    # Second call — nothing left to delete
    assert data2["rows_deleted_memory_items"] == 0
    assert data2["rows_deleted_runtime_memory"] == 0
    # But audit log captures both attempts
    assert len(fake_db.tables["portfolio_memory_forget_log"]) == 2


@pytest.mark.asyncio
async def test_forget_isolates_other_users(forget_module, fake_db, make_request,
                                           sample_company_id):
    target_user = str(uuid4())
    other_user = str(uuid4())
    _seed_user_memories(fake_db, sample_company_id, target_user, 2, 1)
    _seed_user_memories(fake_db, sample_company_id, other_user, 3, 2)
    body = {
        "portfolio_company_id": sample_company_id,
        "portfolio_user_id": target_user,
    }
    await forget_module.forget_user(make_request(fake_db, body=body))
    # Other user's memories untouched
    remaining_long = [
        r for r in fake_db.tables["memory_items"]
        if r["portfolio_user_id"] == other_user
    ]
    remaining_working = [
        r for r in fake_db.tables["portfolio_runtime_memory"]
        if r["portfolio_user_id"] == other_user
    ]
    assert len(remaining_long) == 3
    assert len(remaining_working) == 2


@pytest.mark.asyncio
async def test_forget_isolates_other_companies(forget_module, fake_db, make_request,
                                               sample_user_id):
    company_a = str(uuid4())
    company_b = str(uuid4())
    _seed_user_memories(fake_db, company_a, sample_user_id, 2, 1)
    _seed_user_memories(fake_db, company_b, sample_user_id, 4, 2)
    body = {
        "portfolio_company_id": company_a,
        "portfolio_user_id": sample_user_id,
    }
    await forget_module.forget_user(make_request(fake_db, body=body))
    # Company B rows untouched even though same user_id
    remaining = [
        r for r in fake_db.tables["memory_items"]
        if r["portfolio_company_id"] == company_b
    ]
    assert len(remaining) == 4


@pytest.mark.asyncio
async def test_forget_rejects_missing_company(forget_module, fake_db, make_request,
                                              sample_user_id):
    req = make_request(fake_db, body={"portfolio_user_id": sample_user_id})
    resp = await forget_module.forget_user(req)
    assert resp.status == 400


@pytest.mark.asyncio
async def test_forget_rejects_missing_user(forget_module, fake_db, make_request,
                                           sample_company_id):
    req = make_request(fake_db, body={"portfolio_company_id": sample_company_id})
    resp = await forget_module.forget_user(req)
    assert resp.status == 400


@pytest.mark.asyncio
async def test_forget_records_admin_request(forget_module, fake_db, make_request,
                                            sample_company_id, sample_user_id):
    admin_id = str(uuid4())
    body = {
        "portfolio_company_id": sample_company_id,
        "portfolio_user_id": sample_user_id,
        "requested_by_user_id": admin_id,
        "reason": "admin_compliance",
    }
    await forget_module.forget_user(make_request(fake_db, body=body))
    audit_row = fake_db.tables["portfolio_memory_forget_log"][0]
    assert audit_row["requested_by_user_id"] == admin_id
    assert audit_row["reason"] == "admin_compliance"
