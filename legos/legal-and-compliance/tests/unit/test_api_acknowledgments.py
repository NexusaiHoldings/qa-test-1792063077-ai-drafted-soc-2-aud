"""Unit tests for api/acknowledgments.py."""
import asyncio
import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import aiohttp.web

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from api.acknowledgments import (
    handle_acknowledge,
    handle_my_acknowledgments,
    handle_missing_acknowledgments,
)

_USER = "user-0000-0000-0000-000000000001"
_DOC_ID = "doc-0000-0000-0000-000000000001"
_NOW = datetime(2026, 5, 9, 12, 0, 0, tzinfo=timezone.utc)

_DOC_ROW = {"id": _DOC_ID, "doc_type": "terms_of_service", "version": "1.0"}
_ACK_ROW = {
    "id": "ack-0000-0000-0000-000000000001",
    "doc_id": _DOC_ID,
    "doc_type": "terms_of_service",
    "version": "1.0",
    "jurisdiction": "us",
    "acknowledged_at": _NOW,
}


def _app(db=None, js=None, user_id=None):
    app = aiohttp.web.Application()
    app["db"] = db
    app["js"] = js
    if user_id:
        app["current_user_id"] = user_id
    return app


def _req(app, *, body=None, match_info=None, query=None, headers=None):
    req = MagicMock(spec=aiohttp.web.Request)
    req.app = app
    req.match_info = match_info or {}
    req.rel_url = MagicMock()
    req.rel_url.query = query or {}
    h = headers or {}
    req.headers = h
    if body is not None:
        req.json = AsyncMock(return_value=body)
    return req


def run(c):
    return asyncio.run(c)


class TestAcknowledge(unittest.TestCase):
    def test_no_auth_401(self):
        resp = run(handle_acknowledge(_req(_app())))
        self.assertEqual(resp.status, 401)

    def test_db_unavailable_503(self):
        resp = run(handle_acknowledge(_req(_app(user_id=_USER), body={"doc_id": _DOC_ID})))
        self.assertEqual(resp.status, 503)

    def test_missing_doc_id_400(self):
        db = AsyncMock()
        resp = run(handle_acknowledge(_req(_app(db=db, user_id=_USER), body={})))
        self.assertEqual(resp.status, 400)

    def test_doc_not_found_404(self):
        db = AsyncMock()
        db.query = AsyncMock(return_value=[])
        resp = run(handle_acknowledge(_req(_app(db=db, user_id=_USER), body={"doc_id": _DOC_ID})))
        self.assertEqual(resp.status, 404)

    def test_happy_path_200(self):
        db = AsyncMock()
        db.query = AsyncMock(return_value=[_DOC_ROW])
        db.execute = AsyncMock(return_value="INSERT 1")
        js = AsyncMock()
        js.publish = AsyncMock()
        resp = run(handle_acknowledge(_req(_app(db=db, js=js, user_id=_USER), body={"doc_id": _DOC_ID})))
        self.assertEqual(resp.status, 200)
        data = json.loads(resp.body)
        self.assertEqual(data["status"], "acknowledged")
        js.publish.assert_called_once()
        self.assertEqual(js.publish.call_args[0][0], "legal.user_acknowledged")

    def test_idempotent_on_conflict(self):
        """ON CONFLICT DO NOTHING means second call still returns 200."""
        db = AsyncMock()
        db.query = AsyncMock(return_value=[_DOC_ROW])
        db.execute = AsyncMock(return_value="INSERT 0")  # 0 rows — already exists
        resp = run(handle_acknowledge(_req(_app(db=db, user_id=_USER), body={"doc_id": _DOC_ID})))
        self.assertEqual(resp.status, 200)
        # Confirm ON CONFLICT is in the INSERT SQL
        insert_sql = db.execute.call_args[0][0]
        self.assertIn("ON CONFLICT", insert_sql)


class TestMyAcknowledgments(unittest.TestCase):
    def test_no_auth_401(self):
        resp = run(handle_my_acknowledgments(_req(_app())))
        self.assertEqual(resp.status, 401)

    def test_returns_history(self):
        db = AsyncMock()
        db.query = AsyncMock(return_value=[_ACK_ROW])
        resp = run(handle_my_acknowledgments(_req(_app(db=db, user_id=_USER))))
        self.assertEqual(resp.status, 200)
        data = json.loads(resp.body)
        self.assertEqual(len(data["acknowledgments"]), 1)
        self.assertEqual(data["acknowledgments"][0]["doc_type"], "terms_of_service")

    def test_empty_history(self):
        db = AsyncMock()
        db.query = AsyncMock(return_value=[])
        resp = run(handle_my_acknowledgments(_req(_app(db=db, user_id=_USER))))
        self.assertEqual(resp.status, 200)
        self.assertEqual(json.loads(resp.body)["acknowledgments"], [])


class TestMissingAcknowledgments(unittest.TestCase):
    _MISSING_ROW = {
        "id": _DOC_ID,
        "doc_type": "privacy_policy",
        "version": "1.0",
        "jurisdiction": "us",
        "effective_at": _NOW,
    }

    def test_no_auth_401(self):
        resp = run(handle_missing_acknowledgments(_req(_app())))
        self.assertEqual(resp.status, 401)

    def test_returns_missing_docs(self):
        db = AsyncMock()
        db.query = AsyncMock(return_value=[self._MISSING_ROW])
        resp = run(handle_missing_acknowledgments(_req(_app(db=db, user_id=_USER), query={"jurisdiction": "us"})))
        self.assertEqual(resp.status, 200)
        data = json.loads(resp.body)
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["missing"][0]["doc_type"], "privacy_policy")

    def test_empty_when_all_acknowledged(self):
        db = AsyncMock()
        db.query = AsyncMock(return_value=[])
        resp = run(handle_missing_acknowledgments(_req(_app(db=db, user_id=_USER))))
        self.assertEqual(resp.status, 200)
        data = json.loads(resp.body)
        self.assertEqual(data["count"], 0)
        self.assertEqual(data["missing"], [])

    def test_uses_not_exists_subquery(self):
        db = AsyncMock()
        db.query = AsyncMock(return_value=[])
        run(handle_missing_acknowledgments(_req(_app(db=db, user_id=_USER))))
        sql = db.query.call_args[0][0]
        self.assertIn("NOT EXISTS", sql)
