"""Integration tests for login handler + MFA check."""
import asyncio
import json
import sys
import unittest.mock as mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from api.login import handle_login
from api.signup import _hash_password

def run(c): return asyncio.run(c)

_PW = "Str0ng!"
_USER = {"id": "usr-1", "password_hash": _hash_password(_PW), "status": "active"}
_ACTIVE_FACTOR = [{"id": "fac-1"}]
_NO_FACTOR: list = []

def _db_with_mfa(*, user_row=None, mfa_rows=None):
    db = mock.AsyncMock()
    call_seq = []

    async def _query(sql, *args):
        if "users" in sql:
            return [user_row or _USER]
        if "mfa_factors" in sql:
            return mfa_rows if mfa_rows is not None else _NO_FACTOR
        return []

    async def _execute(*args):
        call_seq.append(args)

    db.query.side_effect = _query
    db.execute.side_effect = _execute
    return db

def _req(body, *, db=None):
    r = mock.MagicMock()
    r.json = mock.AsyncMock(return_value=body)
    r.app = {"db": db, "js": None}
    return r

CREDS = {"email": "u@example.com", "password": _PW}


class TestLoginMfaIntegration:
    def test_login_with_mfa_active_returns_requires_mfa(self):
        db = _db_with_mfa(mfa_rows=_ACTIVE_FACTOR)
        r = _req(CREDS, db=db)
        resp = run(handle_login(r))
        assert resp.status == 200
        body = json.loads(resp.body)
        assert body.get("requires_mfa") is True
        assert "factor_id" in body

    def test_login_with_mfa_active_does_not_issue_session_token(self):
        db = _db_with_mfa(mfa_rows=_ACTIVE_FACTOR)
        r = _req(CREDS, db=db)
        body = json.loads(run(handle_login(r)).body)
        assert "session_token" not in body

    def test_login_without_mfa_returns_session_token(self):
        db = _db_with_mfa(mfa_rows=_NO_FACTOR)
        r = _req(CREDS, db=db)
        body = json.loads(run(handle_login(r)).body)
        assert "session_token" in body
        assert "requires_mfa" not in body

    def test_login_wrong_password_still_401(self):
        db = _db_with_mfa(mfa_rows=_ACTIVE_FACTOR)
        r = _req({**CREDS, "password": "wrong"}, db=db)
        assert run(handle_login(r)).status == 401
