"""Unit tests for api/documents.py."""
import asyncio
import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import aiohttp.web

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from api.documents import (
    handle_list_documents,
    handle_get_document,
    handle_publish_document,
)

_TOKEN = "tok-secret"
_DOC_ID = "00000000-0000-0000-0000-000000000001"
_NOW = datetime(2026, 5, 9, 12, 0, 0, tzinfo=timezone.utc)

_ROW = {
    "id": _DOC_ID,
    "doc_type": "terms_of_service",
    "version": "1.0",
    "jurisdiction": "us",
    "content_html": "<p>PLACEHOLDER Terms of Service.</p>",
    "content_summary": "Standard ToS placeholder.",
    "effective_at": _NOW,
    "published_by": None,
    "created_at": _NOW,
}


def _app(db=None, js=None):
    app = aiohttp.web.Application()
    app["db"] = db
    app["js"] = js
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


class TestListDocuments(unittest.TestCase):
    def test_db_unavailable_503(self):
        resp = run(handle_list_documents(_req(_app())))
        self.assertEqual(resp.status, 503)

    def test_returns_documents(self):
        db = AsyncMock()
        db.query = AsyncMock(return_value=[_ROW])
        resp = run(handle_list_documents(_req(_app(db=db), query={"jurisdiction": "us"})))
        self.assertEqual(resp.status, 200)
        data = json.loads(resp.body)
        self.assertEqual(len(data["documents"]), 1)
        self.assertEqual(data["documents"][0]["doc_type"], "terms_of_service")

    def test_filter_by_doc_type(self):
        db = AsyncMock()
        db.query = AsyncMock(return_value=[_ROW])
        resp = run(handle_list_documents(_req(_app(db=db), query={"doc_type": "terms_of_service", "jurisdiction": "us"})))
        self.assertEqual(resp.status, 200)
        # query was called — spot-check the call happened
        db.query.assert_called_once()
        call_sql = db.query.call_args[0][0]
        self.assertIn("doc_type = $1", call_sql)

    def test_no_doc_type_uses_distinct_query(self):
        db = AsyncMock()
        db.query = AsyncMock(return_value=[])
        resp = run(handle_list_documents(_req(_app(db=db), query={})))
        self.assertEqual(resp.status, 200)
        call_sql = db.query.call_args[0][0]
        self.assertIn("DISTINCT ON", call_sql)

    def test_db_error_500(self):
        db = AsyncMock()
        db.query = AsyncMock(side_effect=Exception("db down"))
        resp = run(handle_list_documents(_req(_app(db=db))))
        self.assertEqual(resp.status, 500)


class TestGetDocument(unittest.TestCase):
    def test_not_found_404(self):
        db = AsyncMock()
        db.query = AsyncMock(return_value=[])
        resp = run(handle_get_document(_req(_app(db=db), match_info={"id": _DOC_ID})))
        self.assertEqual(resp.status, 404)

    def test_found_200(self):
        db = AsyncMock()
        db.query = AsyncMock(return_value=[_ROW])
        resp = run(handle_get_document(_req(_app(db=db), match_info={"id": _DOC_ID})))
        self.assertEqual(resp.status, 200)
        doc = json.loads(resp.body)["document"]
        self.assertEqual(doc["doc_type"], "terms_of_service")
        self.assertEqual(doc["version"], "1.0")


class TestPublishDocument(unittest.TestCase):
    _VALID_BODY = {
        "doc_type": "terms_of_service",
        "version": "2.0",
        "jurisdiction": "us",
        "content_html": "<p>Updated PLACEHOLDER Terms of Service.</p>",
        "effective_at": "2026-06-01T00:00:00+00:00",
    }

    def test_unauthenticated_403(self):
        resp = run(handle_publish_document(_req(_app(db=AsyncMock()), authed=False, body=self._VALID_BODY)))
        self.assertEqual(resp.status, 403)

    def test_db_unavailable_503(self):
        resp = run(handle_publish_document(_req(_app(), authed=True, body=self._VALID_BODY)))
        self.assertEqual(resp.status, 503)

    def test_missing_fields_400(self):
        body = {"doc_type": "terms_of_service"}
        resp = run(handle_publish_document(_req(_app(db=AsyncMock()), body=body)))
        self.assertEqual(resp.status, 400)
        self.assertIn("missing fields", resp.text)

    def test_invalid_doc_type_400(self):
        body = {**self._VALID_BODY, "doc_type": "invalid_type"}
        resp = run(handle_publish_document(_req(_app(db=AsyncMock()), body=body)))
        self.assertEqual(resp.status, 400)

    def test_invalid_jurisdiction_400(self):
        body = {**self._VALID_BODY, "jurisdiction": "mars"}
        resp = run(handle_publish_document(_req(_app(db=AsyncMock()), body=body)))
        self.assertEqual(resp.status, 400)

    def test_publish_201_and_event(self):
        db = AsyncMock()
        db.execute = AsyncMock(return_value="INSERT 1")
        js = AsyncMock()
        js.publish = AsyncMock()
        resp = run(handle_publish_document(_req(_app(db=db, js=js), body=self._VALID_BODY)))
        self.assertEqual(resp.status, 201)
        data = json.loads(resp.body)
        self.assertEqual(data["status"], "published")
        self.assertIn("doc_id", data)
        js.publish.assert_called_once()
        subj = js.publish.call_args[0][0]
        self.assertEqual(subj, "legal.document_published")

    def test_force_reacknowledge_clears_acks(self):
        db = AsyncMock()
        db.execute = AsyncMock(return_value="INSERT 1")
        body = {**self._VALID_BODY, "force_reacknowledge": True}
        resp = run(handle_publish_document(_req(_app(db=db), body=body)))
        self.assertEqual(resp.status, 201)
        # Two execute calls: INSERT + DELETE
        self.assertEqual(db.execute.call_count, 2)
        second_call = db.execute.call_args_list[1][0][0]
        self.assertIn("DELETE", second_call)
