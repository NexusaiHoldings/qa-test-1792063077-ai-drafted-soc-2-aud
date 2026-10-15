"""Unit tests for signup API handler."""
import asyncio
import json
import sys
import unittest.mock as mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from api.signup import handle_signup, _hash_password, _validate_password


def _db(*, exists=False, err=False):
    db = mock.AsyncMock()
    db.query.return_value = [{"id": "x"}] if exists else []
    if err: db.execute.side_effect = Exception("db error")
    return db

def _req(body, *, db=None, js=None, cfg=None):
    r = mock.MagicMock()
    r.json = mock.AsyncMock(return_value=body)
    r.app = {"db": db if db is not None else _db(), "js": js, "lego_config": cfg or {}}
    return r

def run(c): return asyncio.run(c)

VALID = {"email": "u@example.com", "password": "Str0ngPass!", "confirm_password": "Str0ngPass!"}


class TestSignupHandler:
    def test_valid_returns_201(self):
        assert run(handle_signup(_req(VALID))).status == 201

    def test_response_has_token_and_user_id(self):
        b = json.loads(run(handle_signup(_req(VALID))).body)
        assert "session_token" in b and "user_id" in b

    def test_bad_email_400(self):
        assert run(handle_signup(_req({**VALID, "email": "nope"}))).status == 400

    def test_mismatch_password_400(self):
        assert run(handle_signup(_req({**VALID, "confirm_password": "other"}))).status == 400

    def test_short_password_400(self):
        b = {"email": "u@example.com", "password": "x", "confirm_password": "x"}
        assert run(handle_signup(_req(b, cfg={"password_policy": {"min_length": 8}}))).status == 400

    def test_duplicate_email_409(self):
        assert run(handle_signup(_req(VALID, db=_db(exists=True)))).status == 409

    def test_db_none_503(self):
        r = _req(VALID); r.app["db"] = None
        assert run(handle_signup(r)).status == 503

    def test_db_insert_error_500(self):
        assert run(handle_signup(_req(VALID, db=_db(err=True)))).status == 500

    def test_publishes_user_created(self):
        js = mock.AsyncMock()
        run(handle_signup(_req(VALID, js=js)))
        assert js.publish.call_args[0][0] == "user.created"

    def test_bad_json_400(self):
        r = mock.MagicMock()
        r.json = mock.AsyncMock(side_effect=Exception("bad"))
        r.app = {"db": mock.AsyncMock(), "js": None, "lego_config": {}}
        assert run(handle_signup(r)).status == 400


class TestHelpers:
    def test_hash_format(self):
        h = _hash_password("x"); parts = h.split(":")
        assert len(parts) == 2 and len(bytes.fromhex(parts[0])) == 16

    def test_different_salts(self):
        assert _hash_password("x") != _hash_password("x")

    def test_validate_min_length(self):
        assert _validate_password("short", {"min_length": 8}) != []

    def test_validate_require_uppercase(self):
        errs = _validate_password("alllower1!", {"require_uppercase": True, "min_length": 1})
        assert any("uppercase" in e for e in errs)
