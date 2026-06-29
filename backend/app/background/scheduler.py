"""
scheduler.py — Background asyncio tasks for AntiGravity backend.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from app.auth import auto_login
from app.services.instrument_utils import fetch_and_cache_scrip_master
from app.services.history_service import run_daily_history_update

logger = logging.getLogger(__name__)

IST = ZoneInfo("Asia/Kolkata")

_AUTH_REFRESH_SEC = int(5.5 * 60 * 60)
_SCRIP_REFRESH_SEC = 24 * 60 * 60


async def startup_init() -> None:
    try:
        logger.info("[Init] Loading scrip master...")
        await fetch_and_cache_scrip_master()

        logger.info("[Init] Scrip master loaded")

        logger.info("[Init] SmartAPI login...")
        ok = await auto_login()

        if ok:
            logger.info("[Init] SmartAPI authenticated")
            
            logger.info("[Init] Downloading historical data...")

            await run_daily_history_update()

            logger.info("[Init] Historical data loaded.")
        else:
            logger.warning("[Init] Login failed. Running in MOCK mode.")

    except Exception as exc:
        logger.exception(exc)


async def _auth_refresh_loop():

    while True:

        await asyncio.sleep(_AUTH_REFRESH_SEC)

        try:

            logger.info("[Scheduler] Refreshing SmartAPI session")

            await auto_login()

        except Exception as exc:

            logger.exception(exc)


async def _scrip_refresh_loop():

    while True:

        await asyncio.sleep(_SCRIP_REFRESH_SEC)

        try:

            logger.info("[Scheduler] Refreshing Scrip Master")

            await fetch_and_cache_scrip_master()

        except Exception as exc:

            logger.exception(exc)


async def _history_refresh_loop():

    last_run = None

    while True:

        try:

            now = datetime.now(IST)

            #
            # Run once every trading day
            #

            if (
                now.weekday() < 5
                and now.hour == 15
                and now.minute >= 45
                and last_run != now.date()
            ):

                logger.info(
                    "[Scheduler] Starting Daily History Download"
                )

                await run_daily_history_update()

                last_run = now.date()

                logger.info(
                    "[Scheduler] History Download Completed"
                )

        except Exception as exc:

            logger.exception(exc)

        await asyncio.sleep(60)

def start_background_tasks():

    tasks = [

        asyncio.create_task(
            _auth_refresh_loop(),
            name="auth-refresh"
        ),

        asyncio.create_task(
            _scrip_refresh_loop(),
            name="scrip-refresh"
        ),

        asyncio.create_task(
            _history_refresh_loop(),
            name="history-refresh"
        )

    ]

    logger.info(
        "[Scheduler] Started %d background tasks",
        len(tasks)
    )

    return tasks
