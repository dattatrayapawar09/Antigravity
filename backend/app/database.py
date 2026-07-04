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
from typing import Dict, List, Optional

DB_FILE = Path(__file__).resolve().parent.parent / "history.db"


class HistoryDB:

    def __init__(self):

        self.conn = sqlite3.connect(
            DB_FILE,
            check_same_thread=False,
        )

        self.conn.row_factory = sqlite3.Row

        self._create_tables()

    # ---------------------------------------------------------
    # Create database
    # ---------------------------------------------------------

    def _create_tables(self):

        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS option_history(

                contract_id TEXT,

                trading_date TEXT,

                open REAL,

                high REAL,

                low REAL,

                close REAL,

                volume INTEGER,

                oi INTEGER,

                PRIMARY KEY(contract_id, trading_date)

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

        self._migrate_schema()

    # ---------------------------------------------------------
    # Automatic schema migration
    # ---------------------------------------------------------

    def _migrate_schema(self):

        cur = self.conn.execute(
            "PRAGMA table_info(option_history)"
        )

        columns = {row["name"] for row in cur.fetchall()}

        if "open" not in columns:

            self.conn.execute(
                "ALTER TABLE option_history ADD COLUMN open REAL DEFAULT 0"
            )

        if "high" not in columns:

            self.conn.execute(
                "ALTER TABLE option_history ADD COLUMN high REAL DEFAULT 0"
            )

        if "low" not in columns:

            self.conn.execute(
                "ALTER TABLE option_history ADD COLUMN low REAL DEFAULT 0"
            )

        self.conn.commit()

    # ---------------------------------------------------------
    # Save history
    # ---------------------------------------------------------

    def save_history(
        self,
        contract_id: str,
        trading_date: str,
        open_price: float,
        high: float,
        low: float,
        close: float,
        volume: int,
        oi: int,
    ):

        self.conn.execute(
            """
            INSERT OR REPLACE INTO option_history(

                contract_id,
                trading_date,
                open,
                high,
                low,
                close,
                volume,
                oi

            )

            VALUES(?,?,?,?,?,?,?,?)
            """,
            (
                contract_id,
                trading_date,
                open_price,
                high,
                low,
                close,
                volume,
                oi,
            ),
        )

        self.conn.commit()

        self.cleanup(contract_id)

    # ---------------------------------------------------------
    # Keep only latest 5 sessions
    # ---------------------------------------------------------

    def cleanup(
        self,
        contract_id: str,
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
                contract_id,
            ),
        )

        self.conn.commit()
        
    def get_history_map(
        self,
        contract_ids: list[str],
    ) -> dict[str, list[dict]]:

        if not contract_ids:
            return {}

        placeholders = ",".join("?" * len(contract_ids))

        cur = self.conn.execute(
            f"""
            SELECT
                contract_id,
                trading_date,
                open,
                high,
                low,
                close,
                volume,
                oi
            FROM option_history
            WHERE contract_id IN ({placeholders})
            ORDER BY contract_id, trading_date
            """,
            contract_ids,
        )

        history_map: dict[str, list[dict]] = {}

        for row in cur.fetchall():
            history_map.setdefault(
                row["contract_id"],
                [],
            ).append(dict(row))

        return history_map
    # ---------------------------------------------------------
    # Read last 5 trading sessions
    # ---------------------------------------------------------

    def get_last_5_days(
        self,
        contract_id: str,
    ) -> List[Dict]:

        cur = self.conn.execute(
            """
            SELECT
                trading_date,
                open,
                high,
                low,
                close,
                volume,
                oi
            FROM option_history
            WHERE contract_id=?
            ORDER BY trading_date ASC
            LIMIT 5
            """,
            (contract_id,),
        )

        return [
            dict(row)
            for row in cur.fetchall()
        ]

    # ---------------------------------------------------------
    # Average Volume
    # ---------------------------------------------------------

    def get_average_volume(
        self,
        contract_id: str,
    ) -> int:

        rows = self.get_last_5_days(contract_id)

        if not rows:
            return 0

        return int(
            sum(
                row["volume"]
                for row in rows
            ) / len(rows)
        )

    # ---------------------------------------------------------
    # Previous Close
    # ---------------------------------------------------------

    def get_previous_close(
        self,
        contract_id: str,
    ) -> float:

        rows = self.get_last_5_days(contract_id)

        if not rows:
            return 0.0

        return float(rows[-1]["close"])

    # ---------------------------------------------------------
    # Previous Volume
    # ---------------------------------------------------------

    def get_previous_volume(
        self,
        contract_id: str,
    ) -> int:

        rows = self.get_last_5_days(contract_id)

        if not rows:
            return 0

        return int(rows[-1]["volume"])

    # ---------------------------------------------------------
    # Previous OI
    # ---------------------------------------------------------

    def get_previous_oi(
        self,
        contract_id: str,
    ) -> int:

        rows = self.get_last_5_days(contract_id)

        if not rows:
            return 0

        return int(rows[-1]["oi"])

    # ---------------------------------------------------------
    # Average OI
    # ---------------------------------------------------------

    def get_average_oi(
        self,
        contract_id: str,
    ) -> int:

        rows = self.get_last_5_days(contract_id)

        if not rows:
            return 0

        return int(
            sum(
                row["oi"]
                for row in rows
            ) / len(rows)
        )

    # ---------------------------------------------------------
    # Average Close
    # ---------------------------------------------------------

    def get_average_close(
        self,
        contract_id: str,
    ) -> float:

        rows = self.get_last_5_days(contract_id)

        if not rows:
            return 0.0

        return round(
            sum(
                row["close"]
                for row in rows
            ) / len(rows),
            2,
        )
            # ---------------------------------------------------------
    # Last Record
    # ---------------------------------------------------------

    def get_last_record(
        self,
        contract_id: str,
    ) -> Optional[Dict]:

        rows = self.get_last_5_days(contract_id)

        if not rows:
            return None

        return rows[-1]

    # ---------------------------------------------------------
    # Already Updated Today?
    # ---------------------------------------------------------

    def already_updated(
        self,
        contract_id: str,
        trade_date: str,
    ) -> bool:

        cur = self.conn.execute(
            """
            SELECT COUNT(*)
            FROM option_history
            WHERE contract_id=?
            AND trading_date=?
            """,
            (
                contract_id,
                trade_date,
            ),
        )

        return cur.fetchone()[0] > 0

    # ---------------------------------------------------------
    # Delete History
    # ---------------------------------------------------------

    def delete_contract_history(
        self,
        contract_id: str,
    ):

        self.conn.execute(
            """
            DELETE FROM option_history
            WHERE contract_id=?
            """,
            (contract_id,),
        )

        self.conn.commit()

    # ---------------------------------------------------------
    # Total Records
    # ---------------------------------------------------------

    def total_records(self) -> int:

        cur = self.conn.execute(
            """
            SELECT COUNT(*)
            FROM option_history
            """
        )

        return cur.fetchone()[0]

    # ---------------------------------------------------------
    # Database Status
    # ---------------------------------------------------------

    def get_status(self) -> Dict:

        return {
            "database": str(DB_FILE),
            "records": self.total_records(),
        }

    # ---------------------------------------------------------
    # Close Connection
    # ---------------------------------------------------------

    def close(self):

        self.conn.close()


# ---------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------

history_db = HistoryDB()