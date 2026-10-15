"""Unit tests for session validation handler."""
import asyncio
import hashlib
import json
import secrets
import sys
import unittest.mock as mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from api.session import handle_session

def run(c): return asyncio.run(c)

def _tok():
    t = secrets.token_urlsafe(32)
    return t, hashlib.sha256(t.encode()).hexdigest()

ROW = {"session_id": "s-uuid", "user_id": "u-uuid", "expires_at": "2099-01-01", "email": "u@ex.com", "status": "active"}

def _req(*, token=None, rows=None):
    db = mock.AsyncMock(); db.query.return_value = rows or []
    r = mock.MagicMock()
    r.headers = {"Authorization": f"Bearer {token}"} if token else {}
    r.app = {"db": db}; return r


class TestSessionHandler:
    def test_valid_token_200(self):
        tok, _ = _tok()
        assert run(handle_session(_req(token=tok, rows=[ROW]))).status == 200

    def test_response_has_user_info(self):
        tok, _ = _tok()
        b = json.loads(run(handle_session(_req(token=tok, rows=[ROW]))).body)
        assert b["email"] == "u@ex.com" and "user_id" in b

    def test_unknown_token_401(self):
        tok, _ = _tok()
        assert run(handle_session(_req(token=tok))).status == 401

    def test_missing_header_401(self):
        assert run(handle_session(_req())).status == 401

    def test_db_none_503(self):
        tok, _ = _tok()
        r = _req(token=tok); r.app["db"] = None
        assert run(handle_session(r)).status == 503

    def test_db_error_500(self):
        tok, _ = _tok()
        db = mock.AsyncMock(); db.query.side_effect = Exception("err")
        r = _req(token=tok); r.app["db"] = db
        assert run(handle_session(r)).status == 500
