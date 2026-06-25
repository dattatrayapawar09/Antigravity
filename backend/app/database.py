"""
database.py

SQLite database helper for Options Pulse Tracker.

Stores the latest five trading sessions of every option contract.

Contract ID format:

NIFTY_25000_CE
BANKNIFTY_56000_PE
RELIANCE_3000_CE
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import List, Dict

DB_FILE = Path(__file__).resolve().parent.parent / "history.db"


class HistoryDB:

    def __init__(self):

        self.conn = sqlite3.connect(
            DB_FILE,
            check_same_thread=False
        )

        self.conn.row_factory = sqlite3.Row

        self._create_tables()

    def _create_tables(self):

        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS option_history(

                contract_id TEXT,

                trading_date TEXT,

                volume INTEGER,

                oi INTEGER,

                close REAL,

                PRIMARY KEY(
                    contract_id,
                    trading_date
                )

            )
            """
        )

        self.conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_contract

            ON option_history(contract_id)
            """
        )

        self.conn.commit()

    def save_history(

        self,

        contract_id: str,

        trading_date: str,

        volume: int,

        oi: int,

        close: float

    ):

        self.conn.execute(

            """
            INSERT OR REPLACE INTO option_history

            VALUES

            (
                ?,
                ?,
                ?,
                ?,
                ?
            )

            """,

            (
                contract_id,
                trading_date,
                volume,
                oi,
                close
            )

        )

        self.conn.commit()

        self.cleanup(contract_id)

    def cleanup(
        self,
        contract_id: str
    ):

        self.conn.execute(

            """
            DELETE FROM option_history

            WHERE rowid NOT IN (

                SELECT rowid

                FROM option_history

                WHERE contract_id=?

                ORDER BY trading_date DESC

                LIMIT 5

            )

            AND contract_id=?

            """,

            (
                contract_id,
                contract_id
            )

        )

        self.conn.commit()

    def get_last_5_days(

        self,

        contract_id: str

    ) -> List[Dict]:

        cur = self.conn.execute(

            """
            SELECT

                trading_date,

                volume,

                oi,

                close

            FROM option_history

            WHERE contract_id=?

            ORDER BY trading_date ASC

            LIMIT 5

            """,

            (contract_id,)

        )

        return [
            dict(r)
            for r in cur.fetchall()
        ]

    def get_average_volume(

        self,

        contract_id: str

    ) -> int:

        rows = self.get_last_5_days(contract_id)

        if not rows:
            return 0

        return int(

            sum(
                r["volume"]
                for r in rows
            ) / len(rows)

        )

    def close(self):

        self.conn.close()


history_db = HistoryDB()
