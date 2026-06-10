"""
routes/debug.py — Health check and debug endpoints.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Query

from app.models import HealthResponse
from app.services import instrument_utils as IU
from app.smartapi import get_client

logger = logging.getLogger(__name__)
router = APIRouter(tags=["debug"])

_START_TIME = time.monotonic()


@router.get("/")
async def root():
    return {"message": "✅ AntiGravity Backend Running (Python/FastAPI)"}


@router.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    client = get_client()
    return HealthResponse(
        status="ok",
        timestamp=datetime.now(tz=timezone.utc).isoformat(),
        mode="LIVE" if client.is_token_valid() else "MOCK",
        uptime=round(time.monotonic() - _START_TIME, 2),
    )


@router.get("/api/debug/cache")
async def debug_cache() -> dict[str, Any]:
    return IU.get_cache_status()


@router.get("/api/debug/validate")
async def debug_validate(
    sym:    str   = Query("NIFTY"),
    expiry: Optional[str] = Query(None),
    strike: float = Query(24500.0),
    type:   str   = Query("CE"),
) -> dict[str, Any]:
    info = IU.get_contract_debug_info(sym, expiry, strike, type)

    live_quote = None
    client = get_client()
    if info.get("contract") and client.is_token_valid():
        c = info["contract"]
        from app.routes.instruments import _batch_quote, _token_key
        q = await _batch_quote(
            [{"exchange": c["exch_seg"], "symboltoken": c["token"]}], "FULL"
        )
        live_quote = q.get(_token_key(c["token"]))

    cash_token = IU.get_cash_token(sym)

    return {"info": info, "liveQuote": live_quote, "cashToken": cash_token}
