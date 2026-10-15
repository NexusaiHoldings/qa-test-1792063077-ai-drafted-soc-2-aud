"""Unit tests for /api/memory/promote — working → long_term transition."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest


def _seed_working_row(fake_db, company_id, user_id=None, payload=None):
    row_id = str(uuid4())
    now = datetime.now(timezone.utc)
    fake_db.tables["portfolio_runtime_memory"].append({
        "id": row_id,
        "portfolio_company_id": company_id,
        "portfolio_user_id": user_id,
        "workflow_id": None,
        "memory_kind": "active_goal",
        "payload": payload or {"summary": "agent observed pattern X"},
        "expires_at": now + timedelta(days=7),
        "last_accessed_at": now,
        "created_at": now,
    })
    return row_id


@pytest.mark.asyncio
async def test_promote_happy_path(promote_module, fake_db, make_request,
                                  sample_company_id, sample_user_id):
    working_id = _seed_working_row(fake_db, sample_company_id, sample_user_id)
    body = {
        "working_memory_id": working_id,
        "discipline": "support",
        "memory_type": "pattern",
        "summary": "Always escalate after 2 retries",
    }
    req = make_request(fake_db, body=body)
    resp = await promote_module.promote_memory(req)
    assert resp.status == 200
    data = json.loads(resp.body)
    assert data["working_memory_id"] == working_id
    assert "long_term_memory_id" in data
    # Working row removed
    assert len(fake_db.tables["portfolio_runtime_memory"]) == 0
    # Long-term row inserted
    assert len(fake_db.tables["memory_items"]) == 1
    new_row = fake_db.tables["memory_items"][0]
    assert new_row["discipline"] == "support"
    assert new_row["memory_tier"] == "long_term"
    payload = new_row["payload_json"]
    assert payload.get("promoted_summary") == "Always escalate after 2 retries"


@pytest.mark.asyncio
async def test_promote_404_for_unknown_working(promote_module, fake_db, make_request):
    req = make_request(fake_db, body={
        "working_memory_id": str(uuid4()),
        "discipline": "billing",
    })
    resp = await promote_module.promote_memory(req)
    assert resp.status == 404


@pytest.mark.asyncio
async def test_promote_rejects_missing_discipline(promote_module, fake_db, make_request,
                                                  sample_company_id):
    working_id = _seed_working_row(fake_db, sample_company_id)
    req = make_request(fake_db, body={"working_memory_id": working_id})
    resp = await promote_module.promote_memory(req)
    assert resp.status == 400


@pytest.mark.asyncio
async def test_promote_rejects_missing_working_id(promote_module, fake_db, make_request):
    req = make_request(fake_db, body={"discipline": "support"})
    resp = await promote_module.promote_memory(req)
    assert resp.status == 400


@pytest.mark.asyncio
async def test_promote_preserves_user_attribution(promote_module, fake_db, make_request,
                                                  sample_company_id, sample_user_id):
    working_id = _seed_working_row(fake_db, sample_company_id, sample_user_id)
    body = {"working_memory_id": working_id, "discipline": "support"}
    req = make_request(fake_db, body=body)
    await promote_module.promote_memory(req)
    new_row = fake_db.tables["memory_items"][0]
    assert new_row["portfolio_user_id"] == sample_user_id
