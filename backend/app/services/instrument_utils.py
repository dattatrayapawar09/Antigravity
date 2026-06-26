"""
instrument_utils.py — Angel One Scrip Master cache & option-chain helpers.

Direct Python port of backend/utils/instrumentUtils.js.

Key behaviours preserved:
  • normalise_strike()  — raw strike is always stored as integer × 100 in the
                          Angel One scrip master (verified format).
  • parse_option_symbol() — handles underlying names that contain & or -.
  • generate_option_chain_mapping() — returns ±N strikes around ATM.
  • get_cash_token() — returns hardcoded index tokens first (indices are NOT
                       present in the EQ/equity section of the scrip master).
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from app.services import cache as C
from app.config.scanner_config import (
    INDEX_SYMBOLS,
    TOP_50_STOCKS,
    STRIKE_RANGE,
)

logger = logging.getLogger(__name__)

SCRIP_MASTER_URL = (
    "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json"
)

# ── Hardcoded index tokens (not present in scrip master EQ section) ───────────
INDEX_TOKENS: dict[str, dict[str, str]] = {
    "NIFTY":      {"exchange": "NSE", "tradingsymbol": "NIFTY",      "symboltoken": "26000"},
    "BANKNIFTY":  {"exchange": "NSE", "tradingsymbol": "BANKNIFTY",  "symboltoken": "26009"},
    "FINNIFTY":   {"exchange": "NSE", "tradingsymbol": "FINNIFTY",   "symboltoken": "26037"},
    "MIDCPNIFTY": {"exchange": "NSE", "tradingsymbol": "MIDCPNIFTY", "symboltoken": "26074"},
    "SENSEX":     {"exchange": "BSE", "tradingsymbol": "SENSEX",     "symboltoken": "1"},
    "BANKEX":     {"exchange": "BSE", "tradingsymbol": "BANKEX",     "symboltoken": "999901"},
    "NIFTYNXT50": {"exchange": "NSE", "tradingsymbol": "NIFTYNXT50", "symboltoken": "26013"},
}

# ── Symbol map: app name → scrip master 'name' field ─────────────────────────
SYMBOL_MAP: dict[str, str] = {
    "TATAMOTORS": "TMPV",
    "M&MFIN":     "MFSL",
    "MCDOWELL-N": "UNITDSPR",
    "GMRINFRA":   "GMRAIRPORT",
    "PVRINOX":    "PVRINOX",
}
REVERSE_SYMBOL_MAP: dict[str, str] = {v: k for k, v in SYMBOL_MAP.items()}

_MONTH_MAP = {
    "JAN": 0, "FEB": 1, "MAR": 2, "APR": 3, "MAY": 4,  "JUN": 5,
    "JUL": 6, "AUG": 7, "SEP": 8, "OCT": 9, "NOV": 10, "DEC": 11,
}


# ── Utility functions ─────────────────────────────────────────────────────────

def resolve_symbol(app_symbol: str) -> str:
    return SYMBOL_MAP.get(app_symbol, app_symbol)


def unresolve_symbol(scrip_name: str) -> str:
    return REVERSE_SYMBOL_MAP.get(scrip_name, scrip_name)


def normalise_strike(raw_strike: Any, symbol: str | None = None) -> float:
    """
    Angel One ALWAYS stores raw strike as strike × 100.
    If a full trading symbol is given, prefer parsing from that (most reliable).
    """
    if symbol:
        parsed = parse_option_symbol(symbol)
        if parsed and parsed["strike"]:
            return parsed["strike"]
    if raw_strike is None:
        return 0.0
    val = float(raw_strike)
    if val <= 0:
        return 0.0
    return round(val / 100, 2)


# Two separate patterns for 4-digit-year (DDMMMYYYY) and 2-digit-year (DDMMMYY) expiry formats.
# 4-digit year is anchored to 19xx/20xx to prevent greedy matching of strike digits.
_OPT_RE_4Y = re.compile(
    r"^([A-Z&\-]+?)(\d{2}[A-Z]{3}(?:19|20)\d{2})(\d+(?:\.\d+)?)(CE|PE)$"
)
_OPT_RE_2Y = re.compile(
    r"^([A-Z&\-]+?)(\d{2}[A-Z]{3}\d{2})(\d+(?:\.\d+)?)(CE|PE)$"
)


def parse_option_symbol(symbol: str) -> Optional[dict[str, Any]]:
    """
    Parse Angel One option trading symbol into components.
    Handles both 4-digit (DDMMMYYYY) and 2-digit (DDMMMYY) year variants.
    Examples:
      NIFTY29MAY2624500CE  → 2-digit year → expiry 29MAY2026, strike 24500
      NIFTY29MAY202624500CE → 4-digit year → expiry 29MAY2026, strike 24500
    """
    if not symbol:
        return None

    for pattern, digits in ((_OPT_RE_4Y, 4), (_OPT_RE_2Y, 2)):
        m = pattern.match(symbol)
        if not m:
            continue
        underlying = m.group(1)
        expiry_raw = m.group(2)
        strike_str = m.group(3)
        opt_type   = m.group(4)

        # Normalise 2-digit year → 4-digit
        if digits == 2:
            yr     = int(expiry_raw[5:])
            prefix = "20" if yr < 50 else "19"
            expiry_raw = expiry_raw[:5] + prefix + expiry_raw[5:]

        return {
            "underlying": underlying,
            "expiry":     expiry_raw,
            "strike":     float(strike_str),
            "type":       opt_type,
            "raw":        symbol,
        }

    logger.debug("[InstrumentUtils] parse_option_symbol: no match for %r", symbol)
    return None


def _parse_expiry_date(expiry_str: str) -> Optional[datetime]:
    m = re.match(r"^(\d{2})([A-Z]{3})(\d{4})$", expiry_str)
    if not m:
        return None
    day   = int(m.group(1))
    month = _MONTH_MAP.get(m.group(2), 0)
    year  = int(m.group(3))
    return datetime(year, month + 1, day, tzinfo=timezone.utc)


def is_expiry_future(expiry_str: str) -> bool:
    """Return True if the expiry is today or in the future (1-day grace)."""
    return True # Angel One Scrip Master only contains active expiries anyway. This prevents dropping 2024 dataset in a 2026 simulation.


def sort_expiries(expiries: list[str]) -> list[str]:
    def _key(s: str):
        dt = _parse_expiry_date(s)
        return dt or datetime.max.replace(tzinfo=timezone.utc)
    return sorted(expiries, key=_key)


def get_available_expiries(underlying: str) -> list[str]:
    resolved = resolve_symbol(underlying)
    oc = C.options_cache.get(resolved) or C.options_cache.get(underlying, {})
    return sort_expiries([e for e in oc if is_expiry_future(e)])


# ── Scrip Master loader ───────────────────────────────────────────────────────

async def fetch_and_cache_scrip_master() -> None:
    """
    Download the Angel One OpenAPIScripMaster.json and build all in-memory
    lookup tables.  Safe to call multiple times (resets and rebuilds).
    """
    logger.info("[InstrumentUtils] ── Fetching Angel One Scrip Master ──────────────")
    t0 = datetime.utcnow()

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.get(SCRIP_MASTER_URL)
            resp.raise_for_status()
            data: list[dict] = resp.json()
    except Exception as exc:
        logger.error("[InstrumentUtils] ❌ Scrip master fetch failed: %s", exc)
        return

    if not isinstance(data, list):
        logger.error("[InstrumentUtils] ❌ Scrip master is not a list")
        return

    elapsed = (datetime.utcnow() - t0).total_seconds()
    logger.info(
        "[InstrumentUtils] Downloaded %d records in %.1fs. Indexing...",
        len(data), elapsed,
    )

    # Reset caches
    C.reset()
    C.cash_tokens.update(INDEX_TOKENS)   # seed with hardcoded index tokens

    underlying_set: set[str] = set()
    skipped_expired    = 0
    skipped_bad_symbol = 0
    skipped_bad_strike = 0
    cash_indexed       = 0
    duplicate_strikes  = 0
    sample_printed     = 0

    for item in data:
        exch_seg      = item.get("exch_seg", "")
        instrtype     = item.get("instrumenttype", "")
        name          = item.get("name", "")
        expiry        = item.get("expiry", "")
        raw_strike    = item.get("strike")
        symbol        = item.get("symbol", "")
        token         = item.get("token", "")
        lotsize       = item.get("lotsize", 1)

        if not name or not symbol or not token:
            continue

        # ── 1. Cash market tokens ─────────────────────────────────────────────
        if exch_seg in ("NSE", "BSE") and instrtype in ("EQ", "AMXIDX", "INDEX", ""):
            is_exact = (symbol == name or symbol == f"{name}-EQ")
            existing = C.cash_tokens.get(name)

            should_update = False
            if existing is None:
                should_update = True
            else:
                existing_exact = (
                    existing["tradingsymbol"] == name
                    or existing["tradingsymbol"] == f"{name}-EQ"
                )
                if is_exact and not existing_exact:
                    should_update = True
                elif is_exact and existing_exact and exch_seg == "NSE" and existing["exchange"] == "BSE":
                    should_update = True
                elif not is_exact and not existing_exact and exch_seg == "NSE" and existing["exchange"] == "BSE":
                    should_update = True

            if should_update:
                C.cash_tokens[name] = {
                    "exchange":      exch_seg,
                    "tradingsymbol": symbol,
                    "symboltoken":   token,
                }
                cash_indexed += 1
            continue

        # ── 2. F&O options only ───────────────────────────────────────────────
        if exch_seg not in ("NFO", "BFO"):
            continue
        if instrtype not in ("OPTIDX", "OPTSTK"):
            continue
        if not expiry or raw_strike is None:
            continue

        # Skip past expiries
        if not is_expiry_future(expiry):
            skipped_expired += 1
            continue

        # Parse option type from symbol
        parsed = parse_option_symbol(symbol)
        if parsed:
            option_type = parsed["type"]
            norm_strike = parsed["strike"]
        else:
            option_type = "CE" if symbol.endswith("CE") else ("PE" if symbol.endswith("PE") else None)
            norm_strike = normalise_strike(raw_strike)

        if not option_type:
            skipped_bad_symbol += 1
            continue
        if norm_strike <= 0:
            skipped_bad_strike += 1
            continue

        # Debug: first 20 samples
        if sample_printed < 20:
            logger.info(
                "[InstrumentUtils][SAMPLE] token=%s | sym=%s | name=%s"
                " | exch=%s | expiry=%s | rawStrike=%s → normStrike=%s | type=%s",
                token, symbol, name, exch_seg, expiry, raw_strike, norm_strike, option_type,
            )
            sample_printed += 1

        # Build cache tree
        underlying_set.add(name)
        C.options_cache.setdefault(name, {}).setdefault(expiry, {}).setdefault(norm_strike, {})

        contract: dict[str, Any] = {
            "token":           token,
            "symbol":          symbol,
            "name":            name,
            "lotsize":         int(lotsize) if lotsize else 1,
            "exch_seg":        exch_seg,
            "expiry":          expiry,
            "normalizedStrike": norm_strike,
            "rawStrike":       str(raw_strike),
            "optionType":      option_type,
        }

        # Deduplication: keep the contract with the smaller (primary) token number
        existing_contract = C.options_cache[name][expiry][norm_strike].get(option_type)
        if existing_contract:
            duplicate_strikes += 1
            if int(token) >= int(existing_contract["token"]):
                continue  # keep existing

        C.options_cache[name][expiry][norm_strike][option_type] = contract
        C.token_to_contract[str(token)] = {
            **contract,
            "underlying": unresolve_symbol(name) or name,
        }
        C.total_options_indexed += 1

    C.mark_loaded()
    u_count = len(underlying_set)

    logger.info("\n[InstrumentUtils] ✅ Indexing complete:")
    logger.info("   Options indexed   : %d", C.total_options_indexed)
    logger.info("   Underlyings       : %d", u_count)
    logger.info(
        "   Cash tokens       : %d (%d hardcoded indices)",
        len(C.cash_tokens), len(INDEX_TOKENS),
    )
    logger.info("   Skipped expired   : %d", skipped_expired)
    logger.info("   Skipped bad sym   : %d", skipped_bad_symbol)
    logger.info("   Skipped bad strike: %d", skipped_bad_strike)
    logger.info("   Duplicates removed: %d", duplicate_strikes)
    logger.info("   Token map size    : %d", len(C.token_to_contract))
    logger.info(
        "   Underlyings list  : %s...",
        ", ".join(sorted(underlying_set)[:30]),
    )

    # Validation spot-checks
    for sym in ("NIFTY", "BANKNIFTY", "FINNIFTY"):
        expiries = get_available_expiries(sym)
        if expiries:
            first = expiries[0]
            strikes = list(C.options_cache.get(sym, {}).get(first, {}).keys())
            logger.info(
                "[InstrumentUtils][CHECK] %s: %d expiries | nearest=%s | %d strikes | sample: %s",
                sym, len(expiries), first, len(strikes),
                ", ".join(str(s) for s in sorted(strikes)[:5]),
            )
        else:
            logger.warning("[InstrumentUtils][CHECK] ⚠️  %s: no active expiries found!", sym)


# ── Option chain builder ──────────────────────────────────────────────────────

def generate_option_chain_mapping(
    underlying: str,
    expiry: Optional[str],
    spot_price: float,
    num_strikes: int = 10,
) -> dict[str, Any]:
    """
    Returns a dict with keys: underlying, expiry, allExpiries, spotPrice,
    atmStrike, strikeCount, chain (list of contracts), plus optional error key.
    """
    resolved = resolve_symbol(underlying)
    oc = C.options_cache.get(resolved) or C.options_cache.get(underlying)

    if oc is None:
        msg = (
            f"Underlying '{underlying}' not in scrip master"
            if C.cache_loaded
            else "Scrip master not yet loaded — retry in a few seconds"
        )
        return {"error": msg}

    available_expiries = get_available_expiries(resolved or underlying)
    if not available_expiries:
        return {"error": f"No active expiries for {underlying}"}

    # Pick nearest if not specified or specified one not available
    upper_expiry = expiry.upper() if expiry else None
    target_expiry = (
        upper_expiry
        if upper_expiry and upper_expiry in available_expiries
        else available_expiries[0]
    )

    strikes_obj = oc.get(target_expiry, {})
    all_strikes = sorted(strikes_obj.keys())
    if not all_strikes:
        return {"error": f"No strikes for {underlying} {target_expiry}"}

    # ATM = closest strike to spot
    atm_strike = min(all_strikes, key=lambda s: abs(s - spot_price))
    atm_idx    = all_strikes.index(atm_strike)
    start_idx  = max(0, atm_idx - num_strikes)
    end_idx    = min(len(all_strikes) - 1, atm_idx + num_strikes)
    selected   = all_strikes[start_idx : end_idx + 1]

    chain: list[dict[str, Any]] = []
    for strike in selected:
        data = strikes_obj[strike]
        for opt_type in ("CE", "PE"):
            c = data.get(opt_type)
            if c is None:
                continue
            chain.append({
                "symbol":     c["symbol"],
                "token":      c["token"],
                "underlying": underlying,
                "resolvedAs": resolved if resolved != underlying else None,
                "expiry":     target_expiry,
                "strike":     strike,
                "type":       opt_type,
                "lotsize":    c["lotsize"],
                "exch_seg":   c["exch_seg"],
                "rawStrike":  c["rawStrike"],
            })
            if len(chain) <= 6:
                logger.debug(
                    "[InstrumentUtils][CHAIN] %s %s %.2f %s → token=%s sym=%s",
                    underlying, target_expiry, strike, opt_type, c["token"], c["symbol"],
                )

    logger.info(
        "[InstrumentUtils] Built chain: %s | expiry=%s | spot=%.2f | ATM=%.2f | contracts=%d",
        underlying, target_expiry, spot_price, atm_strike, len(chain),
    )

    return {
        "underlying":    underlying,
        "resolvedAs":    resolved if resolved != underlying else None,
        "expiry":        target_expiry,
        "allExpiries":   available_expiries,
        "spotPrice":     spot_price,
        "atmStrike":     atm_strike,
        "strikeCount":   len(selected),
        "chain":         chain,
    }


# ── Token / cash lookups ──────────────────────────────────────────────────────

def get_cash_token(symbol: str) -> Optional[dict[str, str]]:
    """
    Return {exchange, tradingsymbol, symboltoken} for a symbol.
    Index tokens take priority.
    """
    return (
        INDEX_TOKENS.get(symbol)
        or C.cash_tokens.get(resolve_symbol(symbol))
        or C.cash_tokens.get(symbol)
    )


def get_all_cash_tokens() -> list[dict[str, str]]:
    return list(C.cash_tokens.values())


def get_contract_by_token(token: str) -> Optional[dict[str, Any]]:
    return C.token_to_contract.get(str(token))


def get_contract_debug_info(
    underlying: str,
    expiry: Optional[str],
    strike: float,
    opt_type: str,
) -> dict[str, Any]:
    resolved = resolve_symbol(underlying)
    oc = C.options_cache.get(resolved) or C.options_cache.get(underlying, {})
    available_expiries = get_available_expiries(resolved or underlying)

    upper_expiry = expiry.upper() if expiry else None
    target_expiry = (
        next((e for e in available_expiries if e.upper() == upper_expiry), None)
        if upper_expiry else (available_expiries[0] if available_expiries else None)
    )

    contract = None
    if target_expiry:
        strike_data = oc.get(target_expiry, {})
        contract = strike_data.get(strike, {}).get(opt_type)
        if contract is None:
            # Tolerance search
            for s, data in strike_data.items():
                if abs(s - strike) < 0.01:
                    contract = data.get(opt_type)
                    if contract:
                        break

    strikes_for_expiry = sorted(
        oc.get(target_expiry, {}).keys()
    ) if target_expiry else []
    try:
        atm_idx = strikes_for_expiry.index(strike)
    except ValueError:
        atm_idx = -1

    return {
        "queried":          {"underlying": underlying, "expiry": expiry, "strike": strike, "type": opt_type},
        "resolved":         resolved,
        "targetExpiry":     target_expiry,
        "availableExpiries": available_expiries,
        "contract":         contract,
        "adjacentStrikes":  strikes_for_expiry[max(0, atm_idx - 3): atm_idx + 4],
        "cacheStats":       C.get_status(),
    }


def get_cache_status() -> dict[str, Any]:
    return C.get_status()

def get_scanner_contracts() -> list[dict]:
    """
    Return only contracts required for the scanner.

    • Index -> nearest weekly expiry
    • Stocks -> nearest monthly expiry
    • All strikes for now (ATM filtering will be added next)
    """

    contracts = []

    symbols = INDEX_SYMBOLS + TOP_50_STOCKS

    for symbol in symbols:

        expiries = get_available_expiries(symbol)

        if not expiries:
            continue

        expiry = expiries[0]

        resolved = resolve_symbol(symbol)

        option_cache = (
            C.options_cache.get(resolved)
            or C.options_cache.get(symbol)
        )

        if not option_cache:
            continue

        strike_map = option_cache.get(expiry)

        if not strike_map:
            continue

        for strike, option_map in strike_map.items():

            for option_type in ("CE", "PE"):

                contract = option_map.get(option_type)

                if contract:

                    contracts.append({

                        "exchange": contract["exch_seg"],

                        "symboltoken": contract["token"],

                        "tradingsymbol": contract["symbol"],

                        "underlying": symbol,

                        "expiry": expiry,

                        "strike": strike,

                        "type": option_type,

                    })

    logger.info(
        "[Scanner] %d contracts selected",
        len(contracts)
    )

    return contracts
def get_nearest_strikes(
    strikes: list[float],
    spot_price: float,
    strike_range: int = STRIKE_RANGE,
) -> list[float]:
    """
    Return ATM ± strike_range strikes.
    """

    if not strikes:
        return []

    atm = min(
        strikes,
        key=lambda s: abs(s - spot_price)
    )

    atm_index = strikes.index(atm)

    start = max(0, atm_index - strike_range)

    end = min(len(strikes), atm_index + strike_range + 1)

    return strikes[start:end]
def get_scanner_contracts() -> list[dict]:
    """
    Return only the contracts required by the scanner.

    - Index options -> nearest weekly expiry
    - Stock options -> nearest monthly expiry
    - ATM ± STRIKE_RANGE
    """

    contracts = []

    tracked_symbols = INDEX_SYMBOLS + TOP_50_STOCKS

    for symbol in tracked_symbols:

        expiries = get_available_expiries(symbol)

        if not expiries:
            continue

        # nearest expiry
        expiry = expiries[0]

        oc = (
            C.options_cache.get(resolve_symbol(symbol))
            or C.options_cache.get(symbol)
        )

        if not oc:
            continue

        strike_map = oc.get(expiry)

        if not strike_map:
            continue

        strikes = sorted(strike_map.keys())

        if not strikes:
            continue

        # Middle strike (temporary ATM)
        atm_index = len(strikes) // 2

        start = max(0, atm_index - STRIKE_RANGE)

        end = min(len(strikes) - 1, atm_index + STRIKE_RANGE)

        for strike in strikes[start:end + 1]:

            option_map = strike_map[strike]

            for option_type in ("CE", "PE"):

                contract = option_map.get(option_type)

                if contract:

                    contracts.append({

                        "exchange": contract["exch_seg"],

                        "symboltoken": contract["token"],

                        "tradingsymbol": contract["symbol"],

                        "underlying": symbol,

                        "expiry": expiry,

                        "strike": strike,

                        "type": option_type,

                    })

    logger.info(
        "[Scanner] Returning %d scanner contracts",
        len(contracts)
    )

    return contracts
  
def get_all_option_contracts() -> list[dict]:
    """
    Return every option contract currently loaded in the scrip master.
    Used by history_service.py.
    """

    contracts = []

    for underlying, expiry_map in C.options_cache.items():

        for expiry, strike_map in expiry_map.items():

            for strike, option_map in strike_map.items():

                for option_type in ("CE", "PE"):

                    contract = option_map.get(option_type)

                    if contract:

                        contracts.append({

                            "exchange": contract["exch_seg"],

                            "symboltoken": contract["token"],

                            "tradingsymbol": contract["symbol"],

                            "underlying": underlying,

                            "expiry": expiry,

                            "strike": strike,

                            "type": option_type

                        })

    logger.info(
        "[InstrumentUtils] Returning %d contracts",
        len(contracts)
    )

    return contracts
