"""
smartapi.py — Async Angel One SmartAPI client for AntiGravity backend.
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

# ------------------------------------------------------------------
# Constants
# ------------------------------------------------------------------

_ANGEL_BASE = "https://apiconnect.angelone.in"

_HISTORICAL_API = (
    f"{_ANGEL_BASE}/rest/secure/angelbroking/historical/v1/getCandleData"
)

_TOKEN_TTL_SEC = 6 * 60 * 60

_login_lock = asyncio.Lock()


# ------------------------------------------------------------------
# SmartAPI Client
# ------------------------------------------------------------------

class SmartAPIClient:
    """Async Angel One SmartAPI wrapper."""

    def __init__(self, settings: Settings) -> None:

        self._api_key = settings.angel_api_key
        self._client_id = settings.angel_client_id
        self._password = settings.angel_password
        self._totp_secret = settings.angel_totp_secret

        self.jwt_token: Optional[str] = None
        self.feed_token: Optional[str] = None
        self.refresh_token: Optional[str] = None

        self.token_expiry = 0.0

        logger.info(
            "[SmartAPI] Client initialised : %s",
            self._client_id,
        )
    # --------------------------------------------------------------

    def _generate_totp(self) -> str:

        try:

            return pyotp.TOTP(
                self._totp_secret
            ).now()

        except Exception as e:

            logger.exception(e)

            return "000000"

    # --------------------------------------------------------------

    def _base_headers(
        self,
        *,
        with_auth: bool = False,
    ) -> dict[str, str]:

        headers = {

            "Content-Type": "application/json",

            "Accept": "application/json",

            "X-UserType": "USER",

            "X-SourceID": "WEB",

            "X-ClientLocalIP": "127.0.0.1",

            "X-ClientPublicIP": "127.0.0.1",

            "X-MACAddress": "00:00:00:00:00:00",

            "X-PrivateKey": self._api_key,

        }

        if with_auth and self.jwt_token:

            headers["Authorization"] = (
                f"Bearer {self.jwt_token}"
            )

        return headers

    # --------------------------------------------------------------

    def _group_by_exchange(
        self,
        instruments: list[dict[str, str]],
    ) -> dict[str, list[str]]:

        grouped: dict[str, list[str]] = {}

        for instrument in instruments:

            exchange = instrument.get(
                "exchange",
                "NSE",
            )

            token = instrument.get(
                "symboltoken",
                "",
            )

            grouped.setdefault(
                exchange,
                [],
            ).append(token)

        return grouped

    # --------------------------------------------------------------

    def is_token_valid(self) -> bool:

        return (

            self.jwt_token is not None

            and

            time.time() < self.token_expiry

        )

    # --------------------------------------------------------------

    async def login(self) -> dict[str, Any]:

        async with _login_lock:

            if self.is_token_valid():

                return {
                    "success": True
                }

            totp = self._generate_totp()

            logger.info(
                "[SmartAPI] Login..."
            )

            try:

                async with httpx.AsyncClient(
                    timeout=15
                ) as client:

                    response = await client.post(

                        f"{_ANGEL_BASE}/rest/auth/angelbroking/user/v1/loginByPassword",

                        json={

                            "clientcode": self._client_id,

                            "password": self._password,

                            "totp": totp,

                        },

                        headers=self._base_headers(),

                    )

                if response.status_code != 200:
                    logger.error(
                        "[Historical] %s\n%s",
                        response.status_code,
                        response.text,
                    )
                    return []

                try:
                    data = response.json()
                except Exception:
                    logger.error(response.text)
                    return []

                if (

                    data.get("status")

                    and

                    data.get("data", {}).get("jwtToken")

                ):

                    auth = data["data"]

                    self.jwt_token = auth["jwtToken"]

                    self.feed_token = auth.get(
                        "feedToken"
                    )

                    self.refresh_token = auth.get(
                        "refreshToken"
                    )

                    self.token_expiry = (
                        time.time()
                        + _TOKEN_TTL_SEC
                    )

                    logger.info(
                        "[SmartAPI] Login successful."
                    )

                    return {
                        "success": True
                    }

                logger.error(
                    data.get("message")
                )

                return {

                    "success": False,

                    "reason": data.get("message"),

                }

            except Exception as e:

                logger.exception(e)

                return {

                    "success": False,

                    "reason": str(e),

                }

    # --------------------------------------------------------------

    async def ensure_authenticated(
        self,
    ) -> dict[str, Any]:

        if not self.is_token_valid():

            return await self.login()

        return {
            "success": True
        }

    # --------------------------------------------------------------

    async def get_quote(

        self,

        instruments: list[dict[str, str]],

        mode: str = "FULL",

    ) -> Optional[dict]:

        auth = await self.ensure_authenticated()

        if not auth["success"]:

            return None

        try:

            async with httpx.AsyncClient(
                timeout=8
            ) as client:

                response = await client.post(

                    f"{_ANGEL_BASE}/rest/secure/angelbroking/market/v1/quote/",

                    json={

                        "mode": mode,

                        "exchangeTokens": self._group_by_exchange(
                            instruments
                        ),

                    },

                    headers=self._base_headers(
                        with_auth=True
                    ),

                )

            data = response.json()
            import json

            logger.info(
                "[SmartAPI Quote Response]\n%s",
                json.dumps(data, indent=2)
            )
            return data.get("data")

        except Exception as e:

            logger.exception(e)

            return None
    
    # --------------------------------------------------------------
    # LTP API
    # --------------------------------------------------------------

    async def get_ltp_data(
        self,
        exchange: str,
        tradingsymbol: str,
        symboltoken: str,
    ) -> Optional[dict[str, Any]]:

        auth = await self.ensure_authenticated()

        if not auth["success"]:
            return None

        try:

            async with httpx.AsyncClient(timeout=8.0) as client:

                response = await client.post(

                    f"{_ANGEL_BASE}/rest/secure/angelbroking/order/v1/getLtpData",

                    json={

                        "exchange": exchange,

                        "tradingsymbol": tradingsymbol,

                        "symboltoken": symboltoken,

                    },

                    headers=self._base_headers(
                        with_auth=True
                    ),

                )

            data = response.json()

            return data.get("data")

        except Exception as e:

            logger.exception(
                "[SmartAPI] LTP Error : %s",
                e,
            )

            return None

    # --------------------------------------------------------------
    # Option Chain API
    # --------------------------------------------------------------

    async def get_option_chain(
        self,
        symbol: str,
        expiry_date: str,
        strike_price: float,
    ) -> Optional[dict[str, Any]]:

        auth = await self.ensure_authenticated()

        if not auth["success"]:
            return None

        try:

            async with httpx.AsyncClient(timeout=10.0) as client:

                response = await client.post(

                    f"{_ANGEL_BASE}/rest/secure/angelbroking/derivatives/v1/optionchain",

                    json={

                        "name": symbol,

                        "expirydate": expiry_date,

                        "strikePrice": strike_price,

                        "optionType": "CE PE",

                    },

                    headers=self._base_headers(
                        with_auth=True
                    ),

                )

            data = response.json()

            return data.get("data")

        except Exception as e:

            logger.exception(
                "[SmartAPI] OptionChain Error : %s",
                e,
            )

            return None

    # --------------------------------------------------------------
    # Historical Candle API
    # --------------------------------------------------------------

    async def get_historical_data(
        self,
        exchange: str,
        symboltoken: str,
        interval: str,
        from_date: str,
        to_date: str,
    ) -> Optional[list[dict[str, Any]]]:

        auth = await self.ensure_authenticated()

        if not auth["success"]:
            return None

        payload = {

            "exchange": exchange,

            "symboltoken": symboltoken,

            "interval": interval,

            "fromdate": from_date,

            "todate": to_date,

        }

        try:

            async with httpx.AsyncClient(timeout=30.0) as client:

                logger.info("[Historical] Payload: %s", payload)
                headers = self._base_headers(with_auth=True).copy()

                if "Authorization" in headers:
                    headers["Authorization"] = "Bearer ****"

                logger.info(
                    "[Historical] Headers: %s",
                    headers,
                )

                response = await client.post(
                    _HISTORICAL_API,
                    json=payload,
                    headers=self._base_headers(with_auth=True),
                )

                logger.error("[Historical] Status: %s", response.status_code)
                logger.error("[Historical] Body: %s", response.text)

                if response.status_code != 200:
                    return None

                try:
                    data = response.json()
                except Exception:
                    logger.exception("Invalid JSON received")
                    return None
            if not data.get("status"):

                logger.warning(

                    "[Historical] %s",

                    data.get("message"),

                )

                return None

            candles = []

            for row in data.get("data", []):

                candles.append(
                    {
                        "datetime": row[0],
                        "open": float(row[1]),
                        "high": float(row[2]),
                        "low": float(row[3]),
                        "close": float(row[4]),
                        "volume": int(row[5]),
                        "oi": int(row[6]) if len(row) > 6 else 0,
                    }
                )

            logger.info(

                "[Historical] %d candles downloaded",

                len(candles),

            )

            return candles

        except Exception as e:

            logger.exception(

                "[Historical] %s",

                e,

            )

            return None

# ------------------------------------------------------------------
# Module Singleton
# ------------------------------------------------------------------

_client: Optional[SmartAPIClient] = None


def init_client(settings: Settings) -> SmartAPIClient:

    global _client

    _client = SmartAPIClient(settings)

    return _client


def get_client() -> SmartAPIClient:

    if _client is None:

        raise RuntimeError(
            "SmartAPIClient not initialised."
        )

    return _client
