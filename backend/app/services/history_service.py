"""
history_service.py

Stores end-of-day option statistics in SQLite.

Runs once daily (after market close).

Uses LIVE SmartAPI quote data.
"""

from __future__ import annotations

import logging
from datetime import date

from app.database import history_db
from app.smartapi import get_client
from app.services.instrument_utils import get_all_option_contracts

logger = logging.getLogger(__name__)


async def update_history():

    """
    Save today's Volume / OI / Close
    for every option contract.
    """

    client = get_client()

    contracts = get_all_option_contracts()

    if not contracts:

        logger.warning(
            "[History] No option contracts found."
        )

        return

    logger.info(

        "[History] Fetching %d contracts",

        len(contracts)

    )

    quotes = await client.get_quote(

        contracts,

        mode="FULL"

    )

    if not quotes:

        logger.warning(

            "[History] Quote request failed."

        )

        return

    today = date.today().isoformat()

    saved = 0

    for q in quotes:

        try:

            contract_id = (

                f"{q.get('underlying')}_"

                f"{q.get('strike')}_"

                f"{q.get('type')}"

            )

            volume = int(

                q.get("volume") or 0

            )

            oi = int(

                q.get("opnInterest") or 0

            )

            close = float(

                q.get("ltp") or 0

            )

            history_db.save_history(

                contract_id=contract_id,

                trading_date=today,

                volume=volume,

                oi=oi,

                close=close

            )

            saved += 1

        except Exception as exc:

            logger.exception(

                "[History] %s",

                exc

            )

    logger.info(

        "[History] Saved %d contracts",

        saved

    )
