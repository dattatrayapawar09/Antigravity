"""
scheduler.py — Background asyncio tasks for AntiGravity backend.

Tasks launched during FastAPI lifespan:
  • startup_init   : loads scrip master → auto-logins once
  • auth_refresh   : re-logins every 5.5 hours
  • scrip_refresh  : re-fetches scrip master every 24 hours
"""
from __future__ import annotations

import asyncio
import logging

from app.auth import auto_login
from app.services.instrument_utils import fetch_and_cache_scrip_master

logger = logging.getLogger(__name__)

_AUTH_REFRESH_SEC  = int(5.5 * 60 * 60)   # 5.5 hours
_SCRIP_REFRESH_SEC = 24 * 60 * 60          # 24 hours


async def startup_init() -> None:
    """
    Run once after server is up:
      1. Load scrip master
      2. Login to SmartAPI
    """
    try:
        logger.info("[Init] Loading scrip master...")
        await fetch_and_cache_scrip_master()
        logger.info("[Init] ✅ Scrip master loaded")

        logger.info("[Init] Performing initial SmartAPI login...")
        ok = await auto_login()
        if ok:
            logger.info("[Init] ✅ SmartAPI authenticated")
        else:
            logger.error("[Init] ❌ Initial login failed — running in MOCK mode")

    except Exception as exc:
        logger.error("[Init] Fatal startup error: %s", exc, exc_info=True)


async def _auth_refresh_loop() -> None:
    while True:
        await asyncio.sleep(_AUTH_REFRESH_SEC)
        logger.info("[Scheduler] Auth refresh triggered")
        try:
            ok = await auto_login()
            if ok:
                logger.info("[Scheduler] ✅ Auth refreshed")
            else:
                logger.warning("[Scheduler] ⚠️  Auth refresh failed")
        except Exception as exc:
            logger.error("[Scheduler] Auth refresh error: %s", exc)


async def _scrip_refresh_loop() -> None:
    while True:
        await asyncio.sleep(_SCRIP_REFRESH_SEC)
        logger.info("[Scheduler] Daily scrip master refresh triggered")
        try:
            await fetch_and_cache_scrip_master()
            logger.info("[Scheduler] ✅ Scrip master refreshed")
        except Exception as exc:
            logger.error("[Scheduler] Scrip refresh error: %s", exc)


def start_background_tasks() -> list[asyncio.Task]:
    """
    Spawn all background asyncio tasks and return them so callers can cancel
    on shutdown.
    """
    tasks = [
        asyncio.create_task(_auth_refresh_loop(),  name="auth-refresh"),
        asyncio.create_task(_scrip_refresh_loop(), name="scrip-refresh"),
    ]
    logger.info("[Scheduler] Background tasks started: %s", [t.get_name() for t in tasks])
    return tasks
