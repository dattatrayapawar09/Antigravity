"""
history_service.py

Build option history from LIVE option chain.
Runs once after market close.
"""

from __future__ import annotations

import logging
from datetime import date

from app.database import history_db
from app.smartapi import get_client
from app.services.instrument_utils import (
    get_all_option_contracts,
)

logger = logging.getLogger(__name__)


async def update_history():

    client = get_client()

    contracts = get_all_option_contracts()

    logger.info(
        "[History] Saving %d contracts",
        len(contracts)
    )

    quotes = await client.get_quote(
        contracts,
        mode="FULL"
    )

    if not quotes:
        logger.warning(
            "[History] No quote data"
        )
        return

    today = date.today().isoformat()

    for q in quotes:

        try:

            contract_id = (
                f"{q['symbol']}_"
                f"{q['strike']}_"
                f"{q['type']}"
            )

            history_db.save_history(

                contract_id=contract_id,

                trading_date=today,

                volume=int(
                    q.get("volume") or 0
                ),

                oi=int(
                    q.get("opnInterest") or 0
                ),

                close=float(
                    q.get("ltp") or 0
                )

            )

        except Exception as exc:

            logger.exception(exc)

    logger.info(
        "[History] Database updated"
    )
