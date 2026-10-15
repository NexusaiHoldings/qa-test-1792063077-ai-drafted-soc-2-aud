"""Unit tests for /api/memory/store."""
from __future__ import annotations

import json
from uuid import uuid4

import pytest


@pytest.mark.asyncio
async def test_store_long_term_happy_path(store_module, fake_db, make_request,
                                          sample_company_id):
    body = {
        "portfolio_company_id": sample_company_id,
        "memory_tier": "long_term",
        "discipline": "support",
        "memory_type": "decision",
        "importance": "high",
        "payload": {"summary": "always escalate billing disputes after 2 retries"},
    }
    req = make_request(fake_db, body=body)
    resp = await store_module.store_memory(req)
    assert resp.status == 200
    data = json.loads(resp.body)
    assert data["memory_tier"] == "long_term"
    assert data["expires_at"] is None
    assert "memory_id" in data
    assert len(fake_db.tables["memory_items"]) == 1
    row = fake_db.tables["memory_items"][0]
    assert row["discipline"] == "support"
    assert row["importance"] == "high"


@pytest.mark.asyncio
async def test_store_working_happy_path(store_module, fake_db, make_request,
                                        sample_company_id):
    body = {
        "portfolio_company_id": sample_company_id,
        "portfolio_user_id": str(uuid4()),
        "memory_tier": "working",
        "memory_kind": "active_goal",
        "payload": {"goal": "complete onboarding"},
        "ttl_days": 14,
    }
    req = make_request(fake_db, body=body)
    resp = await store_module.store_memory(req)
    assert resp.status == 200
    data = json.loads(resp.body)
    assert data["memory_tier"] == "working"
    assert data["expires_at"] is not None
    assert len(fake_db.tables["portfolio_runtime_memory"]) == 1


@pytest.mark.asyncio
async def test_store_rejects_invalid_tier(store_module, fake_db, make_request,
                                          sample_company_id):
    body = {
        "portfolio_company_id": sample_company_id,
        "memory_tier": "shared",      # client cannot write to shared
        "payload": {},
    }
    req = make_request(fake_db, body=body)
    resp = await store_module.store_memory(req)
    assert resp.status == 400
    assert json.loads(resp.body)["error"] == "invalid_memory_tier"


@pytest.mark.asyncio
async def test_store_rejects_missing_company(store_module, fake_db, make_request):
    body = {"memory_tier": "long_term", "payload": {}}
    req = make_request(fake_db, body=body)
    resp = await store_module.store_memory(req)
    assert resp.status == 400


@pytest.mark.asyncio
async def test_store_rejects_invalid_kind(store_module, fake_db, make_request,
                                          sample_company_id):
    body = {
        "portfolio_company_id": sample_company_id,
        "memory_tier": "working",
        "memory_kind": "totally_made_up",
        "payload": {},
    }
    req = make_request(fake_db, body=body)
    resp = await store_module.store_memory(req)
    assert resp.status == 400
    assert json.loads(resp.body)["error"] == "invalid_memory_kind"


@pytest.mark.asyncio
async def test_store_rejects_payload_not_object(store_module, fake_db, make_request,
                                                sample_company_id):
    body = {
        "portfolio_company_id": sample_company_id,
        "memory_tier": "long_term",
        "payload": "string-payload-not-object",
    }
    req = make_request(fake_db, body=body)
    resp = await store_module.store_memory(req)
    assert resp.status == 400


@pytest.mark.asyncio
async def test_store_ttl_out_of_range(store_module, fake_db, make_request,
                                      sample_company_id):
    body = {
        "portfolio_company_id": sample_company_id,
        "memory_tier": "working",
        "memory_kind": "active_goal",
        "payload": {},
        "ttl_days": 0,
    }
    req = make_request(fake_db, body=body)
    resp = await store_module.store_memory(req)
    assert resp.status == 400
