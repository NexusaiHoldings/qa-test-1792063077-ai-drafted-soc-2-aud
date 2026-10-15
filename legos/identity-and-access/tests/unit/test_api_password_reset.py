"""Unit tests for password reset API handlers."""
import asyncio
import sys
import time
import unittest.mock as mock
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from api.password_reset import (
    handle_password_reset_request, handle_password_reset_confirm,
    _rate_limit_store,
)

def run(c): return asyncio.run(c)

def _db(*, query_rows=None):
    db = mock.AsyncMock()
    db.query.return_value = query_rows if query_rows is not None else []
    return db

def _req(body, *, db=None, js=None):
    r = mock.MagicMock()
    r.json = mock.AsyncMock(return_value=body)
    r.app = {"db": db, "js": js, "resend": None}
    return r

_KNOWN_USER = [{"id": "usr-1"}]


def _token_row(*, used_at=None, expired=False):
    exp = datetime.now(timezone.utc) + (timedelta(hours=-1) if expired else timedelta(hours=1))
    return [{"id": "tok-1", "user_id": "usr-1", "expires_at": exp, "used_at": used_at}]


class TestPasswordResetRequest:
    def setup_method(self, _): _rate_limit_store.clear()

    def test_known_email_200(self):
        assert run(handle_password_reset_request(_req({"email": "a@example.com"}, db=_db(query_rows=_KNOWN_USER)))).status == 200

    def test_unknown_email_also_200(self):
        assert run(handle_password_reset_request(_req({"email": "x@x.com"}, db=_db(query_rows=[])))).status == 200

    def test_missing_email_400(self):
        assert run(handle_password_reset_request(_req({}, db=_db()))).status == 400

    def test_publishes_event_for_known_user(self):
        js = mock.AsyncMock()
        run(handle_password_reset_request(_req({"email": "a@example.com"}, db=_db(query_rows=_KNOWN_USER), js=js)))
        assert "user.password_reset_requested" in [c[0][0] for c in js.publish.call_args_list]

    def test_rate_limit_429_on_fourth_request(self):
        _rate_limit_store["rl@x.com"].extend([time.time()] * 3)
        assert run(handle_password_reset_request(_req({"email": "rl@x.com"}, db=_db(query_rows=_KNOWN_USER)))).status == 429


class TestPasswordResetConfirm:
    def test_valid_token_200(self):
        assert run(handle_password_reset_confirm(_req({"token": "t", "new_password": "P@ss1"}, db=_db(query_rows=_token_row())))).status == 200

    def test_invalid_token_401(self):
        assert run(handle_password_reset_confirm(_req({"token": "bad", "new_password": "P@ss1"}, db=_db(query_rows=[])))).status == 401

    def test_expired_token_401(self):
        assert run(handle_password_reset_confirm(_req({"token": "t", "new_password": "P@ss1"}, db=_db(query_rows=_token_row(expired=True))))).status == 401

    def test_used_token_401(self):
        assert run(handle_password_reset_confirm(_req({"token": "t", "new_password": "P@ss1"}, db=_db(query_rows=_token_row(used_at=datetime.now(timezone.utc)))))).status == 401

    def test_valid_token_invalidates_sessions(self):
        db = _db(query_rows=_token_row())
        run(handle_password_reset_confirm(_req({"token": "t", "new_password": "P@ss1"}, db=db)))
        assert any("sessions" in str(c) for c in db.execute.call_args_list)

    def test_publishes_completed_event(self):
        js = mock.AsyncMock()
        run(handle_password_reset_confirm(_req({"token": "t", "new_password": "P@ss1"}, db=_db(query_rows=_token_row()), js=js)))
        assert "user.password_reset_completed" in [c[0][0] for c in js.publish.call_args_list]
