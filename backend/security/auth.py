"""
Local Dashboard Authentication, Session Protection, and Live Trading Authorization Guard.
Protects state-changing API endpoints against unauthorized/CSRF requests.
"""
import hashlib
import hmac
import secrets
import time
from typing import Dict, Optional
from fastapi import Header, HTTPException, Request

from backend.core.logging_config import CredentialRedactingFilter


class DashboardSessionManager:
    """
    Manages local dashboard session tokens, optional operator PIN/passcode lock,
    and explicit Live Trading authorization tokens.
    """

    def __init__(self) -> None:
        self._active_tokens: Dict[str, float] = {}
        self._session_ttl_seconds = 12 * 3600  # 12 hours
        self._operator_passcode_hash: Optional[str] = None
        self._operator_salt: bytes = secrets.token_bytes(16)
        self._live_trading_authorized: bool = False
        self._live_auth_timestamp: Optional[float] = None
        # Generate default bootstrap session token for the local process
        self._bootstrap_token = self.issue_session_token()

    @property
    def bootstrap_token(self) -> str:
        return self._bootstrap_token

    def issue_session_token(self) -> str:
        token = secrets.token_urlsafe(32)
        CredentialRedactingFilter.register_secret(token)
        self._active_tokens[token] = time.time() + self._session_ttl_seconds
        return token

    def validate_token(self, token: Optional[str]) -> bool:
        if not token:
            return False
        now = time.time()
        # Clean up expired
        expired = [k for k, exp in self._active_tokens.items() if exp < now]
        for k in expired:
            self._active_tokens.pop(k, None)
        for valid_token in self._active_tokens:
            if hmac.compare_digest(valid_token, token):
                # Refresh sliding expiration
                self._active_tokens[valid_token] = now + self._session_ttl_seconds
                return True
        return False

    def set_operator_passcode(self, passcode: str) -> None:
        if not passcode or len(passcode.strip()) < 4:
            raise ValueError("Passcode must be at least 4 characters.")
        CredentialRedactingFilter.register_secret(passcode)
        dk = hashlib.pbkdf2_hmac("sha256", passcode.encode("utf-8"), self._operator_salt, 200_000)
        self._operator_passcode_hash = dk.hex()

    def verify_operator_passcode(self, passcode: str) -> bool:
        if not self._operator_passcode_hash:
            return True
        dk = hashlib.pbkdf2_hmac("sha256", passcode.encode("utf-8"), self._operator_salt, 200_000)
        return hmac.compare_digest(dk.hex(), self._operator_passcode_hash)

    def authorize_live_trading(
        self,
        confirmation_phrase: str,
        acknowledged_risk: bool,
        demo_tested: bool,
    ) -> Dict[str, object]:
        """
        Requires explicit confirmation phrase 'ENABLE LIVE TRADING',
        acknowledgement of financial risk, and confirmation of demo validation.
        Live trading is NEVER enabled by default or switched automatically.
        """
        if confirmation_phrase.strip() != "ENABLE LIVE TRADING":
            raise ValueError("Confirmation phrase must match 'ENABLE LIVE TRADING' exactly.")
        if not acknowledged_risk:
            raise ValueError("You must explicitly acknowledge live trading financial risk.")
        if not demo_tested:
            raise ValueError("You must complete or confirm demo validation before enabling live mode.")
        self._live_trading_authorized = True
        self._live_auth_timestamp = time.time()
        return {
            "live_trading_authorized": True,
            "authorized_at": self._live_auth_timestamp,
        }

    def revoke_live_trading(self) -> None:
        self._live_trading_authorized = False
        self._live_auth_timestamp = None

    @property
    def is_live_trading_authorized(self) -> bool:
        return self._live_trading_authorized


session_manager = DashboardSessionManager()


async def require_session_token(
    request: Request,
    x_2real_session_token: Optional[str] = Header(default=None),
) -> str:
    """
    FastAPI dependency that protects all state-changing endpoints against
    unauthorized requests or cross-site request forgery.
    """
    token = x_2real_session_token or request.headers.get("X-2Real-Session-Token")
    if not session_manager.validate_token(token):
        raise HTTPException(
            status_code=401,
            detail={
                "code": "UNAUTHORIZED_SESSION",
                "message": "Missing or invalid X-2Real-Session-Token header for state-changing operation.",
            },
        )
    return str(token)
