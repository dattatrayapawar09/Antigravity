"""
auth.py — async authentication helper (retry / login lock).
Lives in app/ (not routes/) so it can be imported by background tasks too.
"""
from __future__ import annotations

import asyncio
import logging

from app.smartapi import get_client

logger = logging.getLogger(__name__)

_login_in_progress = False
_lock = asyncio.Lock()


async def auto_login() -> bool:
    """
    Thread-safe login helper.
    Returns True if the client is authenticated after the call.
    """
    global _login_in_progress
    async with _lock:
        if _login_in_progress:
            logger.info("[Auth] Login already in progress — skipping")
            return get_client().is_token_valid()

        _login_in_progress = True

    try:
        client = get_client()
        if client.is_token_valid():
            logger.debug("[Auth] Token still valid — skipping login")
            return True

        logger.info("[Auth] Attempting SmartAPI login...")
        result = await client.login()

        if result["success"]:
            logger.info("[Auth] ✅ SmartAPI authenticated")
            return True
        else:
            logger.error("[Auth] ❌ Login failed: %s", result.get("reason", "Unknown"))
            return False

    except Exception as exc:
        logger.error("[Auth] Fatal login error: %s", exc)
        return False

    finally:
        async with _lock:
            _login_in_progress = False
