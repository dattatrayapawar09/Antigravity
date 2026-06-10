"""
cache.py — In-memory scrip-master cache for AntiGravity backend.

This module owns the mutable global state that instrument_utils writes into.
It is a plain module (no class) to mirror the Node.js pattern of a module-level
singleton, keeping cross-file imports simple.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

# ── Cache stores ──────────────────────────────────────────────────────────────

# { underlying_name: { expiry: { normalized_strike: { "CE"|"PE": contract_dict } } } }
options_cache: dict[str, dict[str, dict[float, dict[str, Any]]]] = {}

# { app_symbol: { "exchange": str, "tradingsymbol": str, "symboltoken": str } }
cash_tokens: dict[str, dict[str, str]] = {}

# { token_str: contract_dict }  — reverse lookup
token_to_contract: dict[str, dict[str, Any]] = {}

# Metadata
cache_loaded: bool = False
cache_loaded_at: Optional[str] = None
total_options_indexed: int = 0


def reset() -> None:
    """Clear all in-memory caches (called before a fresh scrip-master load)."""
    global options_cache, cash_tokens, token_to_contract
    global cache_loaded, cache_loaded_at, total_options_indexed

    options_cache        = {}
    cash_tokens          = {}
    token_to_contract    = {}
    cache_loaded         = False
    cache_loaded_at      = None
    total_options_indexed = 0


def mark_loaded() -> None:
    global cache_loaded, cache_loaded_at
    cache_loaded    = True
    cache_loaded_at = datetime.utcnow().isoformat() + "Z"


def get_status() -> dict[str, Any]:
    return {
        "loaded":              cache_loaded,
        "loadedAt":            cache_loaded_at,
        "totalOptionsIndexed": total_options_indexed,
        "tokenMapSize":        len(token_to_contract),
        "underlyingsCount":    len(options_cache),
        "cashTokensCount":     len(cash_tokens),
        "underlyings":         sorted(options_cache.keys()),
    }
