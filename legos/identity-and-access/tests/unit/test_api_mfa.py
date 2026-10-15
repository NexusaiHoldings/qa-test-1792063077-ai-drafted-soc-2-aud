"""Unit tests for MFA API handlers."""
import asyncio
import base64
import sys
import types
import unittest.mock as mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

# Stub cryptography before importing mfa
_fernet_mod = types.ModuleType("cryptography.fernet")
class _FF:
    def __init__(self, key): pass
    @staticmethod
    def generate_key(): return b"fake-key-32bytes-padded-xxxxxxxx"
    def encrypt(self, d): return b"enc:" + d
    def decrypt(self, d): return d[4:] if d.startswith(b"enc:") else (_ for _ in ()).throw(Exception("bad"))
_fernet_mod.Fernet = _FF
sys.modules.setdefault("cryptography", types.ModuleType("cryptography"))
sys.modules.setdefault("cryptography.fernet", _fernet_mod)

from api.mfa import (
    handle_mfa_enroll_totp, handle_mfa_enroll_totp_verify,
    handle_mfa_challenge, handle_mfa_recovery_code,
    _totp, _verify_totp, _generate_recovery_codes, _hash_code,
)

def run(c): return asyncio.run(c)

def _req(body, *, db=None, js=None, headers=None):
    r = mock.MagicMock()
    r.json = mock.AsyncMock(return_value=body)
    r.app = {"db": db or mock.AsyncMock(), "js": js}
    r.headers = headers if headers is not None else {"Authorization": "Bearer tok"}
    return r

_SECRET = b"\xde\xad" * 10
# Stub Fernet.decrypt returns d[4:] (strips "enc:"). Real handler stores
# f.encrypt(secret_bytes) which under the stub renders as b"enc:" + secret_bytes.
# So _SECRET_ENC must mirror that format: prefix + RAW secret bytes (no extra
# base32). Without this, decrypt yields b32encoded bytes → HMAC key mismatch
# → TOTP verification fails. Bug surfaced during SS2.2 salvage.
_SECRET_ENC = b"enc:" + _SECRET
_FACTOR_ROW = [{"user_id": "usr-1", "secret_encrypted": _SECRET_ENC}]
_SESS_ROW = [{"user_id": "usr-1"}]


class TestTotpUtils:
    def test_verify_correct_code(self):
        assert _verify_totp(_SECRET, _totp(_SECRET, 0))

    def test_verify_wrong_code(self):
        assert not _verify_totp(b"\x00" * 20, "000000")

    def test_recovery_codes_generated(self):
        codes, hashes = _generate_recovery_codes()
        assert len(codes) == 8 and _hash_code(codes[0]) == hashes[0]


class TestMfaEnrollTotp:
    def _sess_db(self, *, sess=None):
        db = mock.AsyncMock()
        async def _q(sql, *a): return (sess if sess is not None else _SESS_ROW) if "sessions" in sql else []
        db.query.side_effect = _q
        return db

    def test_enroll_200(self):
        assert run(handle_mfa_enroll_totp(_req({}, db=self._sess_db()))).status == 200

    def test_enroll_has_otpauth_uri(self):
        import json
        body = json.loads(run(handle_mfa_enroll_totp(_req({}, db=self._sess_db()))).body)
        assert body["otpauth_uri"].startswith("otpauth://totp/")

    def test_enroll_no_session_401(self):
        assert run(handle_mfa_enroll_totp(_req({}, db=self._sess_db(sess=[])))).status == 401

    def test_enroll_no_auth_header_401(self):
        assert run(handle_mfa_enroll_totp(_req({}, db=self._sess_db(), headers={}))).status == 401


class TestMfaEnrollTotpVerify:
    def test_valid_code_200(self):
        code = _totp(_SECRET, 0)
        db = mock.AsyncMock(); db.query.return_value = _FACTOR_ROW
        r = _req({"factor_id": "f", "code": code, "fernet_key": "k"}, db=db)
        assert run(handle_mfa_enroll_totp_verify(r)).status == 200

    def test_wrong_code_401(self):
        db = mock.AsyncMock(); db.query.return_value = _FACTOR_ROW
        r = _req({"factor_id": "f", "code": "000000", "fernet_key": "k"}, db=db)
        assert run(handle_mfa_enroll_totp_verify(r)).status == 401

    def test_factor_not_found_404(self):
        db = mock.AsyncMock(); db.query.return_value = []
        assert run(handle_mfa_enroll_totp_verify(_req({"factor_id": "f", "code": "1", "fernet_key": "k"}, db=db))).status == 404

    def test_publishes_mfa_enrolled(self):
        js = mock.AsyncMock(); code = _totp(_SECRET, 0)
        db = mock.AsyncMock(); db.query.return_value = _FACTOR_ROW
        run(handle_mfa_enroll_totp_verify(_req({"factor_id": "f", "code": code, "fernet_key": "k"}, db=db, js=js)))
        assert "user.mfa_enrolled" in [c[0][0] for c in js.publish.call_args_list]


class TestMfaChallenge:
    def test_valid_code_200(self):
        code = _totp(_SECRET, 0)
        db = mock.AsyncMock(); db.query.return_value = _FACTOR_ROW
        r = _req({"user_id": "u", "factor_id": "f", "code": code, "fernet_key": "k"}, db=db)
        assert run(handle_mfa_challenge(r)).status == 200

    def test_wrong_code_401(self):
        db = mock.AsyncMock(); db.query.return_value = _FACTOR_ROW
        r = _req({"user_id": "u", "factor_id": "f", "code": "000000", "fernet_key": "k"}, db=db)
        assert run(handle_mfa_challenge(r)).status == 401

    def test_factor_not_found_401(self):
        db = mock.AsyncMock(); db.query.return_value = []
        assert run(handle_mfa_challenge(_req({"user_id": "u", "factor_id": "f", "code": "1", "fernet_key": "k"}, db=db))).status == 401

    def test_publishes_succeeded(self):
        js = mock.AsyncMock(); code = _totp(_SECRET, 0)
        db = mock.AsyncMock(); db.query.return_value = _FACTOR_ROW
        run(handle_mfa_challenge(_req({"user_id": "u", "factor_id": "f", "code": code, "fernet_key": "k"}, db=db, js=js)))
        assert "user.mfa_challenge_succeeded" in [c[0][0] for c in js.publish.call_args_list]

    def test_publishes_failed_on_wrong_code(self):
        js = mock.AsyncMock()
        db = mock.AsyncMock(); db.query.return_value = _FACTOR_ROW
        run(handle_mfa_challenge(_req({"user_id": "u", "factor_id": "f", "code": "000000", "fernet_key": "k"}, db=db, js=js)))
        assert "user.mfa_challenge_failed" in [c[0][0] for c in js.publish.call_args_list]


class TestMfaRecoveryCode:
    def _row(self, *, used=False):
        from datetime import datetime, timezone
        return [{"id": "rc-1", "used_at": datetime.now(timezone.utc) if used else None}]

    def test_valid_code_200(self):
        db = mock.AsyncMock(); db.query.return_value = self._row()
        assert run(handle_mfa_recovery_code(_req({"user_id": "u", "code": "ABCD-EFGH"}, db=db))).status == 200

    def test_invalid_code_401(self):
        db = mock.AsyncMock(); db.query.return_value = []
        assert run(handle_mfa_recovery_code(_req({"user_id": "u", "code": "XXXX-YYYY"}, db=db))).status == 401

    def test_used_code_401(self):
        db = mock.AsyncMock(); db.query.return_value = self._row(used=True)
        assert run(handle_mfa_recovery_code(_req({"user_id": "u", "code": "ABCD-EFGH"}, db=db))).status == 401

    def test_valid_code_marks_used(self):
        db = mock.AsyncMock(); db.query.return_value = self._row()
        run(handle_mfa_recovery_code(_req({"user_id": "u", "code": "ABCD-EFGH"}, db=db)))
        db.execute.assert_awaited()
