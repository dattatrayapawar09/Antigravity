"""
history_service.py

Downloads daily historical candle data for option contracts
and stores the latest 5 trading sessions in SQLite.

Used by scheduler.py once per day.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from typing import List

from app.database import history_db
from app.smartapi import get_client
from app.services import instrument_utils as IU

logger = logging.getLogger(__name__)

# ----------------------------------------------------
# Settings
# ----------------------------------------------------

MAX_CONCURRENT_REQUESTS = 10

INTERVAL = "ONE_DAY"

LOOKBACK_DAYS = 10

semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)


# ----------------------------------------------------
# Date Helpers
# ----------------------------------------------------

def get_date_range():
    """
    Returns from_date and to_date
    suitable for Angel Historical API.
    """

    today = datetime.now()

    start = today - timedelta(days=LOOKBACK_DAYS)

    from_date = start.strftime("%Y-%m-%d 09:15")

    to_date = today.strftime("%Y-%m-%d 15:30")

    return from_date, to_date


# ----------------------------------------------------
# Download one contract
# ----------------------------------------------------

async def download_contract_history(contract: dict):

    async with semaphore:

        client = get_client()

        contract_id = (
            f"{contract['underlying']}_"
            f"{contract['strike']}_"
            f"{contract['type']}"
        )

        from_date, to_date = get_date_range()

        logger.info(
            "[History] Downloading %s",
            contract_id
        )

        candles = await client.get_historical_data(
            exchange=contract["exch_seg"],
            symboltoken=contract["token"],
            interval=INTERVAL,
            from_date=from_date,
            to_date=to_date,
        )

        if not candles:
            logger.warning(
                "[History] No candles for %s",
                contract_id
            )
            return

        save_history(contract_id, candles)
# ----------------------------------------------------
# Save candles into SQLite
# ----------------------------------------------------

def save_history(contract_id: str, candles: list):

    if not candles:
        return

    # Keep only latest 5 sessions
    candles = candles[-5:]

    for candle in candles:

        try:

            trade_date = candle["datetime"][:10]

            history_db.save_history(
                contract_id=contract_id,
                trade_date=trade_date,
                volume=int(candle["volume"]),
                close=float(candle["close"]),
                oi=0      # Historical API doesn't return OI
            )

        except Exception as e:

            logger.exception(
                "[History] SQLite insert failed %s : %s",
                contract_id,
                e
            )

    logger.info(
        "[History] Saved %d candles for %s",
        len(candles),
        contract_id
    )

    history_db.cleanup(contract_id)


# ----------------------------------------------------
# Keep only latest 5 rows
# ----------------------------------------------------

def cleanup_history(contract_id: str):

    try:

        history_db.delete_old_history(
            contract_id=contract_id,
            keep_last=5
        )

    except Exception as e:

        logger.exception(
            "[History] Cleanup failed %s : %s",
            contract_id,
            e
        )

# ----------------------------------------------------
# Download history for every option contract
# ----------------------------------------------------

async def update_all_option_history():

    logger.info(
        "[History] Starting historical download..."
    )

    contracts = IU.get_all_option_contracts()

    if not contracts:
        logger.warning(
            "[History] No option contracts available."
        )
        return

    logger.info(
        "[History] %d contracts found",
        len(contracts)
    )

    tasks = [
        download_contract_history(contract)
        for contract in contracts
    ]

    completed = 0

    for future in asyncio.as_completed(tasks):

        try:
            await future

        except Exception as e:

            logger.exception(
                "[History] Worker failed : %s",
                e
            )

        completed += 1

        if completed % 500 == 0:

            logger.info(
                "[History] Progress : %d / %d",
                completed,
                len(tasks)
            )

    logger.info(
        "[History] Historical download completed."
    )


# ----------------------------------------------------
# Scheduler Entry Point
# ----------------------------------------------------

async def run_daily_history_update():

    try:

        await update_all_option_history()

    except Exception as e:

        logger.exception(
            "[History] Daily update failed : %s",
            e
        )
