"""Unit tests for admin/routes.py."""
import asyncio
import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import aiohttp.web

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from admin.routes import (
    handle_admin_list_documents,
    handle_admin_doc_type_history,
    handle_admin_list_acknowledgments,
    handle_admin_force_reacknowledge,
)

_TOKEN = "admin-tok"
_NOW = datetime(2026, 5, 9, 12, 0, 0, tzinfo=timezone.utc)
_DOC_ROW = {
    "id": "doc-001",
    "doc_type": "terms_of_service",
    "version": "1.0",
    "jurisdiction": "us",
    "content_summary": "Placeholder ToS",
    "effective_at": _NOW,
    "published_by": None,
    "created_at": _NOW,
}
_ACK_ROW = {
    "id": "ack-001",
    "user_id": "usr-001",
    "doc_id": "doc-001",
    "doc_type": "terms_of_service",
    "version": "1.0",
    "acknowledged_at": _NOW,
}


def _app(db=None):
    app = aiohttp.web.Application()
    app["db"] = db
    app["admin_token"] = _TOKEN
    return app


def _req(app, *, authed=True, body=None, match_info=None, query=None):
    req = MagicMock(spec=aiohttp.web.Request)
    req.app = app
    req.headers = {"X-Admin-Token": _TOKEN} if authed else {}
    req.match_info = match_info or {}
    req.rel_url = MagicMock()
    req.rel_url.query = query or {}
    if body is not None:
        req.json = AsyncMock(return_value=body)
    return req


def run(c):
    return asyncio.run(c)


class TestAdminListDocuments(unittest.TestCase):
    def test_unauthenticated_403(self):
        resp = run(handle_admin_list_documents(_req(_app(db=AsyncMock()), authed=False)))
        self.assertEqual(resp.status, 403)

    def test_db_unavailable_503(self):
        resp = run(handle_admin_list_documents(_req(_app())))
        self.assertEqual(resp.status, 503)

    def test_returns_all_docs(self):
        db = AsyncMock()
        db.query = AsyncMock(return_value=[_DOC_ROW])
        resp = run(handle_admin_list_documents(_req(_app(db=db))))
        self.assertEqual(resp.status, 200)
        data = json.loads(resp.body)
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["documents"][0]["doc_type"], "terms_of_service")


class TestAdminDocTypeHistory(unittest.TestCase):
    def test_unauthenticated_403(self):
        resp = run(handle_admin_doc_type_history(_req(_app(db=AsyncMock()), authed=False, match_info={"doc_type": "terms_of_service"})))
        self.assertEqual(resp.status, 403)

    def test_not_found_404(self):
        db = AsyncMock()
        db.query = AsyncMock(return_value=[])
        resp = run(handle_admin_doc_type_history(_req(_app(db=db), match_info={"doc_type": "terms_of_service"})))
        self.assertEqual(resp.status, 404)

    def test_returns_version_history(self):
        db = AsyncMock()
        db.query = AsyncMock(return_value=[_DOC_ROW])
        resp = run(handle_admin_doc_type_history(_req(_app(db=db), match_info={"doc_type": "terms_of_service"})))
        self.assertEqual(resp.status, 200)
        data = json.loads(resp.body)
        self.assertEqual(data["doc_type"], "terms_of_service")
        self.assertEqual(len(data["versions"]), 1)
        self.assertEqual(data["versions"][0]["version"], "1.0")


class TestAdminListAcknowledgments(unittest.TestCase):
    def test_unauthenticated_403(self):
        resp = run(handle_admin_list_acknowledgments(_req(_app(db=AsyncMock()), authed=False)))
        self.assertEqual(resp.status, 403)

    def test_returns_paginated_results(self):
        db = AsyncMock()
        db.query = AsyncMock(return_value=[_ACK_ROW])
        resp = run(handle_admin_list_acknowledgments(_req(_app(db=db), query={"limit": "10", "offset": "0"})))
        self.assertEqual(resp.status, 200)
        data = json.loads(resp.body)
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["acknowledgments"][0]["user_id"], "usr-001")

    def test_filter_by_user_id(self):
        db = AsyncMock()
        db.query = AsyncMock(return_value=[])
        run(handle_admin_list_acknowledgments(_req(_app(db=db), query={"user_id": "usr-001"})))
        sql = db.query.call_args[0][0]
        self.assertIn("user_id", sql)


class TestAdminForceReacknowledge(unittest.TestCase):
    def test_unauthenticated_403(self):
        resp = run(handle_admin_force_reacknowledge(_req(_app(db=AsyncMock()), authed=False, body={"doc_id": "doc-001"})))
        self.assertEqual(resp.status, 403)

    def test_missing_doc_id_400(self):
        db = AsyncMock()
        resp = run(handle_admin_force_reacknowledge(_req(_app(db=db), body={})))
        self.assertEqual(resp.status, 400)

    def test_clears_acknowledgments(self):
        db = AsyncMock()
        db.execute = AsyncMock(return_value="DELETE 5")
        resp = run(handle_admin_force_reacknowledge(_req(_app(db=db), body={"doc_id": "doc-001"})))
        self.assertEqual(resp.status, 200)
        data = json.loads(resp.body)
        self.assertEqual(data["status"], "reacknowledgment_required")
        self.assertEqual(data["acknowledgments_cleared"], 5)
        delete_sql = db.execute.call_args[0][0]
        self.assertIn("DELETE", delete_sql)
        self.assertIn("doc_id = $1", delete_sql)
