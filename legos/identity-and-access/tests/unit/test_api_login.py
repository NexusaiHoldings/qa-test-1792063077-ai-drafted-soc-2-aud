"""Unit tests for login API handler."""
import asyncio
import json
import sys
import unittest.mock as mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from api.login import handle_login, _verify_password
from api.signup import _hash_password

def run(c): return asyncio.run(c)

def _user(pw="Str0ng!", status="active"):
    return {"id": "aaa-bbb", "password_hash": _hash_password(pw), "status": status}

def _db(*, row=None, mfa_factors=None):
    """Mock db that distinguishes user lookup vs mfa_factors lookup by SQL.

    Without SQL-routing, query.return_value=[user_row] falsely returns the
    user row for the mfa_factors query added in SS2.2 too — falsely
    triggering the MFA-required path. Set mfa_factors=[...] to opt INTO
    the MFA path; default [] = no MFA active = legacy session-token path.
    """
    db = mock.AsyncMock()
    async def _q(sql, *args):
        if "mfa_factors" in sql:
            return mfa_factors if mfa_factors is not None else []
        return [row] if row else []
    db.query.side_effect = _q
    return db

def _req(body, *, db=None, js=None):
    r = mock.MagicMock(); r.json = mock.AsyncMock(return_value=body)
    r.app = {"db": db if db is not None else _db(), "js": js}; return r

CREDS = {"email": "u@example.com", "password": "Str0ng!"}


class TestLoginHandler:
    def test_valid_returns_200(self):
        assert run(handle_login(_req(CREDS, db=_db(row=_user())))).status == 200

    def test_response_has_token(self):
        b = json.loads(run(handle_login(_req(CREDS, db=_db(row=_user())))).body)
        assert "session_token" in b and "user_id" in b

    def test_wrong_password_401(self):
        assert run(handle_login(_req({**CREDS, "password": "wrong"}, db=_db(row=_user())))).status == 401

    def test_unknown_email_401(self):
        assert run(handle_login(_req(CREDS))).status == 401

    def test_disabled_user_401(self):
        assert run(handle_login(_req(CREDS, db=_db(row=_user(status="disabled"))))).status == 401

    def test_missing_fields_400(self):
        assert run(handle_login(_req({"email": "u@example.com"}))).status == 400

    def test_db_none_503(self):
        r = _req(CREDS); r.app["db"] = None; assert run(handle_login(r)).status == 503

    def test_publishes_signed_in(self):
        js = mock.AsyncMock()
        run(handle_login(_req(CREDS, db=_db(row=_user()), js=js)))
        subjects = [c[0][0] for c in js.publish.call_args_list]
        assert "user.signed_in" in subjects

    def test_publishes_login_failed_on_bad_pw(self):
        js = mock.AsyncMock()
        run(handle_login(_req({**CREDS, "password": "x"}, db=_db(row=_user()), js=js)))
        subjects = [c[0][0] for c in js.publish.call_args_list]
        assert "user.login_failed" in subjects

    def test_bad_json_400(self):
        r = mock.MagicMock(); r.json = mock.AsyncMock(side_effect=Exception("bad"))
        r.app = {"db": mock.AsyncMock(), "js": None}
        assert run(handle_login(r)).status == 400


class TestVerifyPassword:
    def test_correct(self): assert _verify_password("s", _hash_password("s")) is True
    def test_wrong(self):   assert _verify_password("x", _hash_password("s")) is False
    def test_malformed(self): assert _verify_password("s", "not-a-hash") is False

    def test_uses_constant_time_compare(self):
        """Security review 2026-05-10: regression guard.

        Confirms _verify_password uses hmac.compare_digest rather than ==.
        Locking this prevents a future refactor from silently reintroducing
        the timing side-channel that was fixed in this PR.
        """
        import inspect
        src = inspect.getsource(_verify_password)
        # Strip docstring + comments before checking. Look for the actual
        # `return` statement and confirm it's the constant-time form.
        code_lines = []
        in_docstring = False
        for line in src.splitlines():
            stripped = line.strip()
            if stripped.startswith('"""'):
                in_docstring = not in_docstring
                if stripped.count('"""') == 2:
                    in_docstring = False
                continue
            if in_docstring:
                continue
            if stripped.startswith("#"):
                continue
            code_lines.append(line)
        code = "\n".join(code_lines)
        assert "compare_digest" in code, (
            "_verify_password must use hmac.compare_digest in code — see ADR 0016"
        )
        # Verify the exact bug pattern is gone from CODE (not just docs)
        assert "dk.hex() == dk_hex" not in code, (
            "_verify_password must NOT use direct == comparison on the hash in code"
        )

    def test_handles_short_stored_hash(self):
        """compare_digest tolerates length mismatch — verify return False."""
        assert _verify_password("anything", "deadbeef:short") is False
