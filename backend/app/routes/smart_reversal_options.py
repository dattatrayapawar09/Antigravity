"""
routes/smart_reversal_options.py — Smart Reversal Options Scanner.

GET /api/scanner/smart-reversal-options
    ?lookbackDays=20        – sessions to find the recent swing high
    ?minPriceDrop=10        – min % drop from recent high (positive number)
    ?minVolumeRatio=2       – min stock today/5dayAvg volume ratio
    ?closePosition=70       – min close-position % for the underlying
    ?optionVolumeRatio=2    – min option today/5dayAvg volume ratio
    ?strikeRange=2          – ATM ± N strikes  (0 = ATM only, 1, 2, 5)
    ?expiry=both            – current / next / both
    ?optionType=both        – CE / PE / both
    ?minOI=0                – minimum open interest per contract
    ?maxSpreadPct=2.0       – max bid-ask spread as % of mid-price
    ?limit=100              – max results returned

Six-phase pipeline
──────────────────────────────────────────────────────────────────
Phase 1  Underlying stock filter  – price drop, vol surge, close pos
Phase 2  Option chain build       – ATM ±N for current / next expiry
Phase 3  Batch option quotes      – single FULL quote call to Angel One
Phase 4  Option SQLite history    – avg vol + prev OI for all contracts
Phase 5  Per-contract scoring     – vol ratio, OI pattern, liquidity, score
Phase 6  Sort, rank, cache, return
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.services import instrument_utils as IU
from app.services.stock_metadata import get_stock_metadata
from app.database import history_db
from app.routes.instruments import _batch_quote, _token_key
from app.scanner_config import ALL_FNO_STOCKS
from app.smartapi import get_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/scanner", tags=["scanner"])

_sro_cache: Dict[str, Any] = {}
_CACHE_TTL = 60   # seconds


# ── Pydantic models ───────────────────────────────────────────────────────────

class SmartReversalOptionContract(BaseModel):
    rank: int

    # Stock identity
    symbol: str
    company: str
    sector: str

    # Underlying reversal data
    underlyingScore: float
    recentHigh: float
    currentPrice: float
    priceDropPercent: float
    stockVolumeRatio: float
    stockClosePosition: float
    stockVolumeHistory: List[int]

    # Option contract identity
    optionType: str       # CE / PE
    strike: float
    expiry: str
    lotSize: int

    # Option OHLC (live quote)
    optionLTP: float
    optionOpen: float
    optionHigh: float
    optionLow: float
    optionClosePosition: float

    # Option volume
    optionVolume: int          # today – converted to lots
    avgOptionVolume: int       # 5-day avg – in lots
    yesterdayOptionVolume: int
    volumeRatio: float
    optionVolumeHistory: List[int]

    # Open Interest
    oi: int
    prevOI: int
    oiChange: float            # % change vs previous session
    oiPattern: str             # Long Build-up / Short Covering / etc.

    # Liquidity
    bid: float
    ask: float
    spread: float
    spreadPct: float

    # Greeks (optional – absent if Angel One does not return them)
    iv: Optional[float] = None
    delta: Optional[float] = None
    gamma: Optional[float] = None
    theta: Optional[float] = None
    vega: Optional[float] = None

    smartScore: float
    signal: str                # Strong Bullish / Bullish / Watch / Ignore


class SmartReversalOptionsResponse(BaseModel):
    contracts: List[SmartReversalOptionContract]
    stocksQualified: int
    optionsScanned: int
    totalFnoScanned: int
    elapsedMs: int


# ── Helper: underlying reversal score (mirrors scanner.py formula) ────────────

def _underlying_score(
    vol_ratio: float,
    price_drop_pct: float,   # negative  e.g.  -12.5
    close_pos: float,        # 0-100
    high: float,
    low: float,
    close: float,
    bullish: bool,
) -> float:
    """
    Weight  Parameter
    30      Volume Ratio      (capped at 5× → 30 pts)
    25      Price Drop        (deeper = higher, capped at -25 % → 25 pts)
    20      Close Position    (0-100 % → 0-20 pts)
    15      Recovery from Low ((close-low)/(high-low) → 0-15 pts)
    10      Bullish Candle    (boolean)
    """
    vol_s  = min(vol_ratio / 5.0, 1.0) * 30
    drop_s = min(abs(price_drop_pct) / 25.0, 1.0) * 25
    cp_s   = (close_pos / 100.0) * 20
    rng    = high - low
    rec_s  = ((close - low) / rng * 15) if rng > 0 else 0.0
    bull_s = 10.0 if bullish else 0.0
    return round(vol_s + drop_s + cp_s + rec_s + bull_s, 2)


# ── Helper: OI pattern detection ──────────────────────────────────────────────

_BULLISH_OI_PATTERNS = frozenset({"Long Build-up", "Short Covering"})


def _oi_pattern_and_score(
    oi_change_pct: float,
    prev_close: float,
    current_ltp: float,
    option_type: str,
) -> Tuple[str, float]:
    """
    Returns (oiPattern label, oi_score 0-20).

    CE – bullish reversal context:
        OI↑ + Price↑  →  Long Build-up   (strong bullish)  20 pts
        OI↓ + Price↑  →  Short Covering  (bullish)          15 pts
        OI↑ + Price↓  →  Short Build-up  (bearish)           3 pts
        OI↓ + Price↓  →  Long Unwinding  (bearish)           3 pts
        neutral                           10 pts

    PE – bullish reversal context:
        OI↓ + Price↓  →  Short Covering  (bears covering)   20 pts
        OI↑ + Price↑  →  Short Build-up  (neutral)          10 pts
        OI↓ + Price↑  →  Long Unwinding  (slightly bullish) 10 pts
        OI↑ + Price↓  →  Long Build-up   (bearish for stk)   3 pts
        neutral                           10 pts
    """
    THRESHOLD = 1.0                         # % OI change considered significant
    oi_up    = oi_change_pct >  THRESHOLD
    oi_down  = oi_change_pct < -THRESHOLD
    price_up = (current_ltp > prev_close) if prev_close > 0 else False

    if option_type == "CE":
        if oi_up   and price_up:  return "Long Build-up",  20.0
        if oi_down and price_up:  return "Short Covering", 15.0
        if oi_up   and not price_up: return "Short Build-up",  3.0
        if oi_down and not price_up: return "Long Unwinding",  3.0
        return "Neutral", 10.0

    if option_type == "PE":
        if oi_down and not price_up: return "Short Covering", 20.0
        if oi_up   and price_up:     return "Short Build-up", 10.0
        if oi_down and price_up:     return "Long Unwinding",  10.0
        if oi_up   and not price_up: return "Long Build-up",    3.0
        return "Neutral", 10.0

    return "Neutral", 10.0


# ── Helper: option close position ─────────────────────────────────────────────

def _close_position(ltp: float, low: float, high: float) -> float:
    rng = high - low
    if rng <= 0:
        return 0.0
    return round(((ltp - low) / rng) * 100, 2)


# ── Helper: smart score for option contract ───────────────────────────────────

def _option_smart_score(
    underlying_score: float,
    opt_vol_ratio: float,
    oi_score: float,         # raw 0-20 from _oi_pattern_and_score
    opt_close_pos: float,
    spread_pct: float,
    max_spread_pct: float,
) -> float:
    """
    Weight  Component
    35      Underlying reversal score   (0-100 → 0-35 pts)
    25      Option volume ratio         (capped 5× → 0-25 pts)
    20      OI pattern score            (raw 0-20 pts, already normalised)
    10      Option price recovery       (close position → 0-10 pts)
    10      Liquidity / spread quality  (0-10 pts)
    """
    u_s   = (underlying_score / 100.0) * 35
    vr_s  = min(opt_vol_ratio / 5.0, 1.0) * 25
    oi_s  = oi_score                       # already 0-20
    cp_s  = (opt_close_pos / 100.0) * 10
    liq_s = max(0.0, (max_spread_pct - spread_pct) / max(max_spread_pct, 0.1)) * 10
    return round(u_s + vr_s + oi_s + cp_s + liq_s, 2)


# ── Helper: option signal ─────────────────────────────────────────────────────

def _option_signal(
    underlying_score: float,
    price_drop_pct: float,
    opt_vol_ratio: float,
    oi_pattern: str,
    opt_close_pos: float,
    spread_pct: float,
) -> str:
    drop       = abs(price_drop_pct)
    bullish_oi = oi_pattern in _BULLISH_OI_PATTERNS

    if (
        underlying_score >= 85
        and drop >= 10
        and opt_vol_ratio >= 3
        and bullish_oi
        and opt_close_pos >= 80
        and spread_pct < 2.0
    ):
        return "Strong Bullish"

    if (
        underlying_score >= 75
        and opt_vol_ratio >= 2
        and bullish_oi
        and opt_close_pos >= 70
    ):
        return "Bullish"

    if opt_vol_ratio >= 1.5:
        return "Watch"

    return "Ignore"


# ── Helper: pick expiries for a stock ────────────────────────────────────────

def _get_stock_expiry_list(symbol: str, count: int = 2) -> list[str]:
    """Return up to `count` distinct monthly expiries for a F&O stock, ascending."""
    resolved  = IU.resolve_symbol(symbol)
    available = IU.get_available_expiries(resolved) or IU.get_available_expiries(symbol)
    result: list[str] = []
    seen_months: set[str] = set()
    for exp in available:           # already sorted ascending
        month_key = exp[2:]         # "DDMMMYYYY" → "MMMYYYY"
        if month_key not in seen_months:
            seen_months.add(month_key)
            result.append(exp)
            if len(result) >= count:
                break
    return result


# ── Main endpoint ─────────────────────────────────────────────────────────────

@router.get("/smart-reversal-options", response_model=SmartReversalOptionsResponse)
async def smart_reversal_options_scanner(
    lookbackDays: int        = Query(default=20,  ge=5,   le=60),
    minPriceDrop: float      = Query(default=10,  ge=1,   le=50),
    minVolumeRatio: float    = Query(default=2,   ge=0.5, le=20),
    closePosition: float     = Query(default=70,  ge=0,   le=100),
    optionVolumeRatio: float = Query(default=2,   ge=0.5, le=20),
    strikeRange: int         = Query(default=2,   ge=0,   le=5),
    expiry: str              = Query(default="both"),      # current / next / both
    optionType: str          = Query(default="both"),      # CE / PE / both
    minOI: int               = Query(default=0,   ge=0),
    maxSpreadPct: float      = Query(default=2.0, ge=0.1, le=10.0),
    limit: int               = Query(default=100, ge=1,   le=500),
) -> SmartReversalOptionsResponse:

    t_start = time.time()

    cache_key = (
        f"{lookbackDays}|{minPriceDrop}|{minVolumeRatio}|{closePosition}|"
        f"{optionVolumeRatio}|{strikeRange}|{expiry}|{optionType}|"
        f"{minOI}|{maxSpreadPct}"
    )
    cached = _sro_cache.get(cache_key)
    if cached and (time.time() - cached["ts"]) < _CACHE_TTL:
        age = int(time.time() - cached["ts"])
        logger.info("[SRO] Cache HIT key=%s age=%ds", cache_key, age)
        return cached["data"]

    client = get_client()
    if not client.is_token_valid():
        logger.warning("[SRO] Not authenticated — returning empty")
        return SmartReversalOptionsResponse(
            contracts=[], stocksQualified=0, optionsScanned=0,
            totalFnoScanned=0, elapsedMs=0,
        )

    all_symbols = list(ALL_FNO_STOCKS)
    logger.info("[SRO] Phase 1 — scanning %d F&O stocks for underlying reversal", len(all_symbols))

    # ─────────────────────────────────────────────────────────────────────────
    # Phase 1A: Batch SQLite history for all stock symbols
    # ─────────────────────────────────────────────────────────────────────────
    stock_history_map = history_db.get_history_map(all_symbols)

    # ─────────────────────────────────────────────────────────────────────────
    # Phase 1B: Batch live FULL quotes for all F&O cash instruments
    # ─────────────────────────────────────────────────────────────────────────
    cash_instruments: list[dict] = []
    sym_to_token:     dict[str, str] = {}

    for sym in all_symbols:
        cash = IU.get_cash_token(sym)
        if cash:
            token = cash["symboltoken"]
            cash_instruments.append({"exchange": cash["exchange"], "symboltoken": token})
            sym_to_token[sym] = _token_key(token)

    stock_quotes: dict[str, Any] = {}
    if cash_instruments:
        stock_quotes = await _batch_quote(cash_instruments, "FULL") or {}

    # ─────────────────────────────────────────────────────────────────────────
    # Phase 1C: Apply underlying stock reversal filter
    # ─────────────────────────────────────────────────────────────────────────
    qualified_stocks: dict[str, dict] = {}

    for sym in all_symbols:
        try:
            tk = sym_to_token.get(sym)
            if not tk:
                continue
            q = stock_quotes.get(tk)
            if not q:
                continue

            today_close = float(q.get("ltp")    or q.get("close")  or 0)
            today_open  = float(q.get("open")   or 0)
            today_high  = float(q.get("high")   or 0)
            today_low   = float(q.get("low")    or 0)
            today_vol   = int(q.get("volume")   or q.get("tradeVolume") or 0)

            if today_close <= 0 or today_high <= today_low:
                continue

            history = stock_history_map.get(sym, [])
            if not history:
                continue

            hist_sorted = sorted(history, key=lambda h: h.get("trading_date", ""))
            lookback    = hist_sorted[-lookbackDays:]

            # Step 1: Recent Swing High
            recent_high      = 0.0
            recent_high_date = ""
            for c in lookback:
                h = float(c.get("high") or 0)
                if h > recent_high:
                    recent_high      = h
                    recent_high_date = c.get("trading_date", "")
            if today_high > recent_high:
                recent_high = today_high
            if recent_high <= 0:
                continue

            # Step 2: Price Drop
            price_drop_pct = ((today_close - recent_high) / recent_high) * 100
            if price_drop_pct > -minPriceDrop:
                continue

            # Yesterday's session values
            yesterday     = hist_sorted[-1]
            yesterday_low = float(yesterday.get("low")    or 0)
            yesterday_vol = int(yesterday.get("volume")   or 0)

            # Step 3a: Volume Ratio
            recent_5  = hist_sorted[-5:]
            avg_vol   = (
                int(sum(int(h.get("volume") or 0) for h in recent_5) / len(recent_5))
                if recent_5 else 0
            )
            vol_ratio = round(today_vol / avg_vol, 2) if avg_vol > 0 else 0.0
            if vol_ratio < minVolumeRatio:
                continue

            # Step 3b: Stock price recovery (bullish candle + close position)
            candle_rng = today_high - today_low
            close_pos  = (
                round(((today_close - today_low) / candle_rng) * 100, 2)
                if candle_rng > 0 else 0.0
            )
            if close_pos < closePosition:
                continue
            if today_close <= today_open:
                continue   # must be a bullish candle
            if today_low >= yesterday_low and yesterday_low > 0:
                continue   # lower low required
            if today_vol <= yesterday_vol:
                continue   # today's volume must exceed yesterday

            score       = _underlying_score(
                vol_ratio, price_drop_pct, close_pos,
                today_high, today_low, today_close, True,
            )
            vol_history = [int(h.get("volume") or 0) for h in hist_sorted[-6:]]

            qualified_stocks[sym] = {
                "score":         score,
                "spot":          today_close,
                "recentHigh":    round(recent_high, 2),
                "recentHighDate": recent_high_date,
                "priceDropPct":  round(price_drop_pct, 2),
                "volRatio":      vol_ratio,
                "closePos":      close_pos,
                "volHistory":    vol_history,
            }

        except Exception as exc:
            logger.warning("[SRO] Underlying error %s: %s", sym, exc)

    logger.info("[SRO] Phase 1 done — %d stocks qualified of %d", len(qualified_stocks), len(all_symbols))

    if not qualified_stocks:
        elapsed = int((time.time() - t_start) * 1000)
        resp = SmartReversalOptionsResponse(
            contracts=[], stocksQualified=0, optionsScanned=0,
            totalFnoScanned=len(all_symbols), elapsedMs=elapsed,
        )
        _sro_cache[cache_key] = {"ts": time.time(), "data": resp}
        return resp

    # ─────────────────────────────────────────────────────────────────────────
    # Phase 2: Build option chains for qualifying stocks
    # ─────────────────────────────────────────────────────────────────────────
    logger.info(
        "[SRO] Phase 2 — option chains (strike±%d, expiry=%s, type=%s)",
        strikeRange, expiry, optionType,
    )

    option_instruments:   list[dict]        = []   # for batch quote
    option_meta:          dict[str, dict]   = {}   # token_key → contract metadata
    seen_contract_ids:    set[str]          = set()
    option_contract_ids:  list[str]         = []   # for SQLite

    for sym, stock_data in qualified_stocks.items():
        try:
            spot            = stock_data["spot"]
            expiry_list_raw = _get_stock_expiry_list(sym, count=2)
            if not expiry_list_raw:
                continue

            expiry_lower = expiry.lower()
            if expiry_lower == "current":
                expiries_to_scan = expiry_list_raw[:1]
            elif expiry_lower == "next":
                expiries_to_scan = expiry_list_raw[1:2] if len(expiry_list_raw) > 1 else expiry_list_raw[:1]
            else:   # both
                expiries_to_scan = expiry_list_raw[:2]

            for target_expiry in expiries_to_scan:
                mapping = IU.generate_option_chain_mapping(
                    underlying=sym,
                    expiry=target_expiry,
                    spot_price=spot,
                    num_strikes=strikeRange,
                )
                if "error" in mapping:
                    logger.debug("[SRO] Chain mapping error %s %s: %s", sym, target_expiry, mapping["error"])
                    continue

                for contract in mapping.get("chain", []):
                    opt_type = contract["type"]   # CE / PE
                    opt_type_lower = optionType.lower()
                    if opt_type_lower == "ce" and opt_type != "CE":
                        continue
                    if opt_type_lower == "pe" and opt_type != "PE":
                        continue

                    token       = _token_key(contract["token"])
                    contract_id = f"{contract['underlying']}_{contract['strike']}_{opt_type}"

                    option_instruments.append({
                        "exchange":    contract["exch_seg"],
                        "symboltoken": contract["token"],
                    })
                    option_meta[token] = {
                        "symbol":     sym,
                        "underlying": contract["underlying"],
                        "optionType": opt_type,
                        "strike":     contract["strike"],
                        "expiry":     contract["expiry"],
                        "lotSize":    int(contract.get("lotsize") or 1),
                        "contractId": contract_id,
                    }
                    if contract_id not in seen_contract_ids:
                        seen_contract_ids.add(contract_id)
                        option_contract_ids.append(contract_id)

        except Exception as exc:
            logger.warning("[SRO] Chain build error %s: %s", sym, exc)

    logger.info("[SRO] Phase 2 done — %d option contracts to quote", len(option_instruments))

    # ─────────────────────────────────────────────────────────────────────────
    # Phase 3: Batch option FULL quotes
    # ─────────────────────────────────────────────────────────────────────────
    option_quotes: dict[str, Any] = {}
    if option_instruments:
        logger.info("[SRO] Phase 3 — fetching quotes for %d option contracts", len(option_instruments))
        option_quotes = await _batch_quote(option_instruments, "FULL") or {}
        logger.info("[SRO] Phase 3 done — %d quotes received", len(option_quotes))

    # ─────────────────────────────────────────────────────────────────────────
    # Phase 4: Option SQLite history (avg volume + prev OI)
    # ─────────────────────────────────────────────────────────────────────────
    option_history_map = history_db.get_history_map(option_contract_ids)
    logger.info("[SRO] Phase 4 done — %d contract histories found", len(option_history_map))

    # ─────────────────────────────────────────────────────────────────────────
    # Phase 5: Per-contract scoring and signal
    # ─────────────────────────────────────────────────────────────────────────
    results: list[SmartReversalOptionContract] = []
    options_scanned = 0

    for token, meta in option_meta.items():
        try:
            q = option_quotes.get(token)
            if not q:
                continue

            options_scanned += 1
            sym        = meta["symbol"]
            stock_data = qualified_stocks.get(sym)
            if not stock_data:
                continue

            opt_type    = meta["optionType"]
            lot_size    = max(int(meta["lotSize"]), 1)
            contract_id = meta["contractId"]

            # ── Live OHLC ─────────────────────────────────────────────────────
            opt_ltp  = float(q.get("ltp")  or q.get("lastPrice") or 0)
            opt_open = float(q.get("open") or 0)
            opt_high = float(q.get("high") or 0)
            opt_low  = float(q.get("low")  or 0)

            if opt_ltp <= 0:
                continue

            # Step 8: Option price recovery
            opt_close_pos = _close_position(opt_ltp, opt_low, opt_high)
            if opt_close_pos < 70:
                continue
            if opt_open > 0 and opt_ltp <= opt_open:
                continue   # option must close higher than open

            # ── Live Volume (convert qty → lots) ──────────────────────────────
            opt_vol_qty  = int(
                q.get("volume") or q.get("tradeVolume") or
                q.get("volumeTradedToday") or q.get("totalTradedVolume") or 0
            )
            opt_vol_lots = round(opt_vol_qty / lot_size)

            # ── Live OI ───────────────────────────────────────────────────────
            current_oi = int(q.get("opnInterest") or q.get("openInterest") or q.get("open_interest") or 0)

            # ── Liquidity (Step 7) ────────────────────────────────────────────
            bid      = float(q.get("bestBidPrice") or q.get("bidPrice") or 0)
            ask      = float(q.get("bestAskPrice") or q.get("askPrice") or 0)
            spread   = round(max(0.0, ask - bid), 2)
            mid      = (ask + bid) / 2.0 if (ask + bid) > 0 else max(opt_ltp, 0.01)
            spread_pct = round((spread / mid) * 100, 2) if mid > 0 else 99.0

            if spread_pct > maxSpreadPct:
                continue   # too illiquid
            if current_oi < minOI:
                continue

            # ── Optional Greeks ───────────────────────────────────────────────
            def _safe_float(v: Any) -> Optional[float]:
                try:
                    f = float(v or 0)
                    return f if f != 0 else None
                except Exception:
                    return None

            iv    = _safe_float(q.get("impliedVol") or q.get("impliedVolatility"))
            delta = _safe_float(q.get("delta"))
            gamma = _safe_float(q.get("gamma"))
            theta = _safe_float(q.get("theta"))
            vega  = _safe_float(q.get("vega"))

            # ── Option history: avg vol + prev OI ─────────────────────────────
            opt_hist = option_history_map.get(contract_id, [])
            opt_hist_sorted = sorted(opt_hist, key=lambda h: h.get("trading_date", ""))

            recent_5_opt = opt_hist_sorted[-5:]
            avg_opt_vol  = (
                int(sum(int(h.get("volume") or 0) for h in recent_5_opt) / len(recent_5_opt))
                if recent_5_opt else 0
            )
            prev_oi      = int(opt_hist_sorted[-1].get("oi", 0)) if opt_hist_sorted else 0
            oi_change_pct = (
                round(((current_oi - prev_oi) / prev_oi) * 100, 2)
                if prev_oi > 0 else 0.0
            )
            yesterday_opt_vol = int(opt_hist_sorted[-1].get("volume", 0)) if opt_hist_sorted else 0
            prev_opt_close    = float(opt_hist_sorted[-1].get("close", 0)) if opt_hist_sorted else 0.0

            # ── Step 5: Option Volume Ratio ───────────────────────────────────
            opt_vol_ratio = (
                round(opt_vol_lots / avg_opt_vol, 2)
                if avg_opt_vol > 0
                else (1.0 if opt_vol_lots > 0 else 0.0)
            )
            if opt_vol_ratio < optionVolumeRatio:
                continue
            if yesterday_opt_vol > 0 and opt_vol_lots <= yesterday_opt_vol:
                continue   # today vol must beat yesterday

            # ── Step 6: OI pattern ────────────────────────────────────────────
            oi_pattern, oi_score = _oi_pattern_and_score(
                oi_change_pct, prev_opt_close, opt_ltp, opt_type,
            )

            # ── Volume history (lots) ─────────────────────────────────────────
            opt_vol_history = [int(h.get("volume") or 0) for h in opt_hist_sorted[-6:]]

            # ── Smart Score ───────────────────────────────────────────────────
            smart_score = _option_smart_score(
                stock_data["score"],
                opt_vol_ratio,
                oi_score,
                opt_close_pos,
                spread_pct,
                maxSpreadPct,
            )

            # ── Signal ────────────────────────────────────────────────────────
            signal = _option_signal(
                stock_data["score"],
                stock_data["priceDropPct"],
                opt_vol_ratio,
                oi_pattern,
                opt_close_pos,
                spread_pct,
            )
            if signal == "Ignore":
                continue

            # ── Metadata ──────────────────────────────────────────────────────
            meta2 = get_stock_metadata(sym)

            results.append(
                SmartReversalOptionContract(
                    rank=0,
                    symbol=sym,
                    company=meta2["name"],
                    sector=meta2["sector"],

                    underlyingScore=stock_data["score"],
                    recentHigh=stock_data["recentHigh"],
                    currentPrice=round(stock_data["spot"], 2),
                    priceDropPercent=stock_data["priceDropPct"],
                    stockVolumeRatio=stock_data["volRatio"],
                    stockClosePosition=stock_data["closePos"],
                    stockVolumeHistory=stock_data["volHistory"],

                    optionType=opt_type,
                    strike=meta["strike"],
                    expiry=meta["expiry"],
                    lotSize=lot_size,

                    optionLTP=round(opt_ltp, 2),
                    optionOpen=round(opt_open, 2),
                    optionHigh=round(opt_high, 2),
                    optionLow=round(opt_low, 2),
                    optionClosePosition=opt_close_pos,

                    optionVolume=opt_vol_lots,
                    avgOptionVolume=avg_opt_vol,
                    yesterdayOptionVolume=yesterday_opt_vol,
                    volumeRatio=opt_vol_ratio,
                    optionVolumeHistory=opt_vol_history,

                    oi=current_oi,
                    prevOI=prev_oi,
                    oiChange=oi_change_pct,
                    oiPattern=oi_pattern,

                    bid=round(bid, 2),
                    ask=round(ask, 2),
                    spread=round(spread, 2),
                    spreadPct=round(spread_pct, 2),

                    iv=round(iv, 2) if iv else None,
                    delta=round(delta, 4) if delta else None,
                    gamma=round(gamma, 6) if gamma else None,
                    theta=round(theta, 4) if theta else None,
                    vega=round(vega, 4) if vega else None,

                    smartScore=smart_score,
                    signal=signal,
                )
            )

        except Exception as exc:
            logger.warning("[SRO] Scoring error token=%s: %s", token, exc)

    # ─────────────────────────────────────────────────────────────────────────
    # Phase 6: Sort, rank, cache, return
    # ─────────────────────────────────────────────────────────────────────────
    results.sort(key=lambda x: x.smartScore, reverse=True)
    results = results[:limit]
    for idx, c in enumerate(results, start=1):
        c.rank = idx

    elapsed_ms = int((time.time() - t_start) * 1000)
    logger.info(
        "[SRO] Done — %d contracts from %d stocks | %d options scanned | %dms",
        len(results), len(qualified_stocks), options_scanned, elapsed_ms,
    )

    response = SmartReversalOptionsResponse(
        contracts=results,
        stocksQualified=len(qualified_stocks),
        optionsScanned=options_scanned,
        totalFnoScanned=len(all_symbols),
        elapsedMs=elapsed_ms,
    )
    _sro_cache[cache_key] = {"ts": time.time(), "data": response}
    return response
