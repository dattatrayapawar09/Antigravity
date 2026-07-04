"""
history_service.py

Downloads historical option data from Angel One and stores the
latest five trading sessions for scanner contracts.

Production Version
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

from app.database import history_db
from app.smartapi import get_client
from app.services import instrument_utils as IU
from app.scanner_config import (
    INDEX_SYMBOLS,
    TOP_50_STOCKS,
    STRIKE_RANGE,
)

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------

INTERVAL = "ONE_DAY"

LOOKBACK_DAYS = 10

# Angel One historical API rate limit
MAX_CONCURRENT_REQUESTS = 2

MAX_RETRIES = 3

RETRY_DELAY = 1

REQUEST_DELAY = 0.35

semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)


# ------------------------------------------------------------------
# Date Helpers
# ------------------------------------------------------------------

def get_date_range() -> tuple[str, str]:
    """
    Returns the date range used for historical download.
    """

    today = datetime.now()

    start = today - timedelta(days=LOOKBACK_DAYS)

    return (
        start.strftime("%Y-%m-%d 09:15"),
        today.strftime("%Y-%m-%d 15:30"),
    )


# ------------------------------------------------------------------
# Retry Wrapper
# ------------------------------------------------------------------

async def fetch_history(
    exchange: str,
    token: str,
):
    """
    Download historical candles with retry logic.
    """

    client = get_client()

    from_date, to_date = get_date_range()

    for attempt in range(MAX_RETRIES):

        try:

            candles = await client.get_historical_data(
                exchange=exchange,
                symboltoken=token,
                interval=INTERVAL,
                from_date=from_date,
                to_date=to_date,
            )

            if candles:
                return candles

        except Exception as e:

            logger.warning(
                "[History] Retry %d/%d : %s",
                attempt + 1,
                MAX_RETRIES,
                e,
            )

        await asyncio.sleep(RETRY_DELAY)

    return None


# ------------------------------------------------------------------
# Download one option contract
# ------------------------------------------------------------------

async def download_contract_history(contract: dict):

    async with semaphore:

        contract_id = (
            f"{contract['underlying']}_"
            f"{contract['strike']}_"
            f"{contract['type']}"
        )

        today = datetime.now().strftime("%Y-%m-%d")

        # Skip if already downloaded today
        if history_db.already_updated(
            contract_id,
            today,
        ):
            logger.debug(
                "[History] Already updated %s",
                contract_id,
            )
            return

        logger.info(
            "[History] Downloading %s",
            contract_id,
        )

        exchange = (
            contract.get("exchange")
            or contract.get("exch_seg")
        )

        token = (
            contract.get("symboltoken")
            or contract.get("token")
        )

        candles = await fetch_history(
            exchange=exchange,
            token=token,
        )

        if not candles:

            logger.warning(
                "[History] No candles for %s",
                contract_id,
            )

            return

        save_history(
            contract_id,
            candles,
        )

        # Prevent Angel One rate limiting
        await asyncio.sleep(REQUEST_DELAY)
# ------------------------------------------------------------------
# Save candles into SQLite
# ------------------------------------------------------------------

def save_history(
    contract_id: str,
    candles: list,
):
    """
    Save the latest five historical candles into SQLite.
    """

    if not candles:
        return

    # Keep only the latest 5 sessions
    candles = candles[-5:]

    saved = 0

    for candle in candles:

        try:

            trade_date = candle["datetime"][:10]

            history_db.save_history(
                contract_id=contract_id,
                trading_date=trade_date,
                open_price=float(candle["open"]),
                high=float(candle["high"]),
                low=float(candle["low"]),
                close=float(candle["close"]),
                volume=int(candle["volume"]),
                oi=int(candle.get("oi", 0)),
            )

            saved += 1

        except Exception as e:

            logger.exception(
                "[History] SQLite insert failed %s : %s",
                contract_id,
                e,
            )

    history_db.cleanup(contract_id)

    logger.info(
        "[History] Saved %d candles for %s",
        saved,
        contract_id,
    )


# ------------------------------------------------------------------
# Download history for scanner contracts
# ------------------------------------------------------------------

async def update_all_option_history():

    logger.info(
        "[History] Starting historical download..."
    )

    contracts = await build_scanner_contracts()

    if not contracts:

        logger.warning(
            "[History] No scanner contracts found."
        )

        return

    logger.info(
        "[History] %d scanner contracts",
        len(contracts),
    )

    completed = 0

    #
    # NOTE:
    # We intentionally process sequentially.
    #
    # download_contract_history() already uses
    # a semaphore + request delay.
    #
    # This avoids creating hundreds of asyncio
    # tasks at once which causes Angel One
    # historical API rate limiting.
    #
    for contract in contracts:

        try:

            await download_contract_history(
                contract
            )

        except Exception as e:

            logger.exception(
                "[History] Worker failed : %s",
                e,
            )

        completed += 1

        if completed % 10 == 0 or completed == len(contracts):

            logger.info(
                "[History] Progress : %d / %d",
                completed,
                len(contracts),
            )

    logger.info(
        "[History] Historical download completed."
    )


# ------------------------------------------------------------------
# Scheduler Entry Point
# ------------------------------------------------------------------

async def run_daily_history_update():

    try:

        await update_all_option_history()

    except Exception as e:

        logger.exception(
            "[History] Daily update failed : %s",
            e,
        )

# ------------------------------------------------------------------
# Build scanner contracts
# ------------------------------------------------------------------

async def build_scanner_contracts() -> list[dict]:
    """
    Build only the option contracts required by the scanner.

    For every tracked symbol:

        • Get live spot price
        • Generate nearest expiry option chain
        • Keep ATM ± STRIKE_RANGE
    """

    client = get_client()

    contracts: list[dict] = []

    symbols = INDEX_SYMBOLS + TOP_50_STOCKS

    logger.info(
        "[History] Building scanner contracts..."
    )

    for symbol in symbols:

        try:

            cash = IU.get_cash_token(symbol)

            if not cash:

                logger.warning(
                    "[History] Cash token not found : %s",
                    symbol,
                )

                continue

            ltp = await client.get_ltp_data(
                cash["exchange"],
                cash["tradingsymbol"],
                cash["symboltoken"],
            )

            if not ltp:

                logger.warning(
                    "[History] LTP unavailable : %s",
                    symbol,
                )

                continue

            spot = float(ltp.get("ltp", 0))

            if spot <= 0:
                logger.warning(
                    "[History] Invalid spot price for %s",
                    symbol,
                )
                continue

            mapping = IU.generate_option_chain_mapping(
                underlying=symbol,
                expiry=None,
                spot_price=spot,
                num_strikes=STRIKE_RANGE,
            )

            if not mapping:

                continue

            if "error" in mapping:

                logger.warning(
                    "[History] %s : %s",
                    symbol,
                    mapping["error"],
                )

                continue

            chain = mapping.get(
                "chain",
                [],
            )

            if not chain:

                logger.warning(
                    "[History] Empty chain : %s",
                    symbol,
                )

                continue

            contracts.extend(chain)

            logger.info(
                "[History] %-12s Spot=%10.2f Contracts=%3d",
                symbol,
                spot,
                len(chain),
            )

        except Exception as e:

            logger.exception(
                "[History] Failed building contracts for %s : %s",
                symbol,
                e,
            )

    logger.info(
        "[History] Scanner Contracts : %d",
        len(contracts),
    )

    return contracts
