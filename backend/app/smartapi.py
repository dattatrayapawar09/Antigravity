"""
smartapi.py — Async Angel One SmartAPI client for AntiGravity backend.

Translated from backend/smartapi.js.  Uses httpx.AsyncClient for all I/O.
TOTP is generated with pyotp (standard TOTP RFC 6238 — same as totp-generator).
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Optional

import httpx
import pyotp

from app.config import Settings

logger = logging.getLogger(__name__)

_ANGEL_BASE = "https://apiconnect.angelone.in"

# Token validity: 6 hours (Angel One sessions expire at midnight IST; 6 h is safe)
_TOKEN_TTL_SEC = 6 * 60 * 60

# Lock so only one login happens at a time
_login_lock = asyncio.Lock()


class SmartAPIClient:
    """Async Angel One SmartAPI wrapper."""

    def __init__(self, settings: Settings) -> None:
        self._api_key     = settings.angel_api_key
        self._client_id   = settings.angel_client_id
        self._password    = settings.angel_password
        self._totp_secret = settings.angel_totp_secret

        self.jwt_token:     Optional[str] = None
        self.feed_token:    Optional[str] = None
        self.refresh_token: Optional[str] = None
        self.token_expiry:  float = 0.0   # unix timestamp

        logger.info("[SmartAPI] ✅ Credentials loaded for client: %s", self._client_id)

    # ── Internal helpers ────────────────────────────────────────────────────────

    def _generate_totp(self) -> str:
        try:
            code = pyotp.TOTP(self._totp_secret).now()
            logger.debug("[SmartAPI] TOTP generated: %s", code)
            return code
        except Exception as exc:
            logger.error("[SmartAPI] TOTP generation error: %s", exc)
            return "000000"

    def _base_headers(self, *, with_auth: bool = False) -> dict[str, str]:
        h: dict[str, str] = {
            "Content-Type":      "application/json",
            "Accept":            "application/json",
            "X-UserType":        "USER",
            "X-SourceID":        "WEB",
            "X-ClientLocalIP":   "127.0.0.1",
            "X-ClientPublicIP":  "127.0.0.1",
            "X-MACAddress":      "00:00:00:00:00:00",
            "X-PrivateKey":      self._api_key,
        }
        if with_auth and self.jwt_token:
            h["Authorization"] = f"Bearer {self.jwt_token}"
        return h

    def _group_by_exchange(
        self, instruments: list[dict[str, str]]
    ) -> dict[str, list[str]]:
        grouped: dict[str, list[str]] = {}
        for instr in instruments:
            exch = instr.get("exchange", "NSE")
            tok  = instr.get("symboltoken", "")
            grouped.setdefault(exch, []).append(tok)
        return grouped

    # ── Public API ──────────────────────────────────────────────────────────────

    def is_token_valid(self) -> bool:
        return bool(self.jwt_token and time.time() < self.token_expiry)

    async def login(self) -> dict[str, Any]:
        """Authenticate with Angel One SmartAPI. Returns {success, reason?}."""
        async with _login_lock:
            if self.is_token_valid():
                return {"success": True}

            totp_code = self._generate_totp()
            logger.info(
                "[SmartAPI] Attempting login for client: %s TOTP: %s",
                self._client_id, totp_code,
            )

            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.post(
                        f"{_ANGEL_BASE}/rest/auth/angelbroking/user/v1/loginByPassword",
                        json={
                            "clientcode": self._client_id,
                            "password":   self._password,
                            "totp":       totp_code,
                        },
                        headers=self._base_headers(),
                    )
                    data = resp.json()

                logger.info("[SmartAPI] Login response status: %s", data.get("status"))
                logger.info("[SmartAPI] Login response message: %s", data.get("message"))

                if data.get("status") and data.get("data", {}).get("jwtToken"):
                    d = data["data"]
                    self.jwt_token     = d["jwtToken"]
                    self.feed_token    = d.get("feedToken")
                    self.refresh_token = d.get("refreshToken")
                    self.token_expiry  = time.time() + _TOKEN_TTL_SEC
                    logger.info("[SmartAPI] ✅ Login successful! LIVE MODE active.")
                    return {"success": True}

                msg = data.get("message") or "Login failed — no JWT in response"
                logger.error("[SmartAPI] ❌ Login failed: %s", msg)
                return {"success": False, "reason": msg}

            except Exception as exc:
                msg = str(exc)
                logger.error("[SmartAPI] ❌ Login HTTP error: %s", msg)
                return {"success": False, "reason": msg}

    async def ensure_authenticated(self) -> dict[str, Any]:
        if not self.is_token_valid():
            return await self.login()
        return {"success": True}

    async def get_quote(
        self, instruments: list[dict[str, str]], mode: str = "FULL"
    ) -> Optional[dict[str, Any]]:
        """
        Fetch market quotes.
        instruments: [{"exchange": "NSE", "symboltoken": "26000"}, ...]
        mode: "LTP" | "OHLC" | "FULL"
        """
        auth = await self.ensure_authenticated()
        if not auth["success"]:
            return None

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.post(
                    f"{_ANGEL_BASE}/rest/secure/angelbroking/market/v1/quote/",
                    json={
                        "mode":           mode,
                        "exchangeTokens": self._group_by_exchange(instruments),
                    },
                    headers=self._base_headers(with_auth=True),
                )
                data = resp.json()
                return data.get("data")
        except Exception as exc:
            logger.error("[SmartAPI] Quote error: %s", exc)
            return None

    async def get_ltp_data(
        self, exchange: str, tradingsymbol: str, symboltoken: str
    ) -> Optional[dict[str, Any]]:
        """Fetch single-instrument LTP via the getLtpData endpoint."""
        auth = await self.ensure_authenticated()
        if not auth["success"]:
            return None

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(
                    f"{_ANGEL_BASE}/rest/secure/angelbroking/order/v1/getLtpData",
                    json={
                        "exchange":       exchange,
                        "tradingsymbol":  tradingsymbol,
                        "symboltoken":    symboltoken,
                    },
                    headers=self._base_headers(with_auth=True),
                )
                data = resp.json()
                return data.get("data")
        except Exception as exc:
            logger.error("[SmartAPI] LTP error: %s", exc)
            return None

    async def get_option_chain(
        self, symbol: str, expiry_date: str, strike_price: float
    ) -> Optional[dict[str, Any]]:
        """Fetch option chain from Angel One derivatives endpoint."""
        auth = await self.ensure_authenticated()
        if not auth["success"]:
            return None

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"{_ANGEL_BASE}/rest/secure/angelbroking/derivatives/v1/optionchain",
                    json={
                        "name":        symbol,
                        "expirydate":  expiry_date,
                        "strikePrice": strike_price,
                        "optionType":  "CE PE",
                    },
                    headers=self._base_headers(with_auth=True),
                )
                data = resp.json()
                return data.get("data")
        except Exception as exc:
            logger.error("[SmartAPI] OptionChain error: %s", exc)
            return None


# ── Module-level singleton (created during lifespan) ───────────────────────────
_client: Optional[SmartAPIClient] = None


def init_client(settings: Settings) -> SmartAPIClient:
    global _client
    _client = SmartAPIClient(settings)
    return _client


def get_client() -> SmartAPIClient:
    if _client is None:
        raise RuntimeError("SmartAPIClient not initialised — call init_client() first")
    return _client
