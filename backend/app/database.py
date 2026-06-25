"""
database.py
SQLite helper for storing historical option data.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import List, Dict

DB_PATH = Path(__file__).parent.parent / "history.db"


class HistoryDB:

    def __init__(self):

        self.conn = sqlite3.connect(
            DB_PATH,
            check_same_thread=False
        )

        self.conn.row_factory = sqlite3.Row

        self.create_tables()

    def create_tables(self):

        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS option_history (

                id TEXT,

                trading_date TEXT,

                volume INTEGER,

                oi INTEGER,

                close REAL,

                PRIMARY KEY(id,trading_date)

            )
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

            (
                id,
                trading_date,
                volume,
                oi,
                close
            )

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

            WHERE id=?

            ORDER BY trading_date DESC

            LIMIT 5

            """,

            (contract_id,)

        )

        return [
            dict(row)
            for row in cur.fetchall()
        ]


history_db = HistoryDB()
