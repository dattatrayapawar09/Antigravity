"""
routes/smart_reversal_options.py — Smart Reversal Options Scanner.

GET /api/scanner/smart-reversal-options
    ... (all previous params) ...
    ?scanMode=auto        – "live" | "history" | "auto" | "backtest"
    ?scanDate=YYYY-MM-DD  – (backtest only) treat this date's candle as today
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

class RecommendedOption(BaseModel):
    strike: float
    type: str             # CE / PE
    expiry: str
    ltp: float
    volume: int           # today – converted to lots
    avgVolume: int        # 5-day avg – in lots
    volumeRatio: float
    oi: int
    oiChange: float       # % change vs previous session
    spread: float
    score: float          # Trade Quality Score (0-100)


class SmartReversalStockWithOption(BaseModel):
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

    recommendedOption: RecommendedOption

    finalScore: float
    signal: str                # Strong Bullish / Bullish / Watch / Ignore
    
    # Backtest metadata
    scanDate: Optional[str] = None
    scanMode: str = "live"


class SmartReversalOptionsResponse(BaseModel):
    stocks: List[SmartReversalStockWithOption]
    stocksQualified: int
    optionsScanned: int
    totalFnoScanned: int
    elapsedMs: int
    scanMode: str
    scanDate: Optional[str] = None


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
    oi_score: float,         # already 0-20
    spread_pct: float,
    max_spread_pct: float,
    atm_dist_pct: float,
) -> float:
    u_s   = (underlying_score / 100.0) * 40
    vr_s  = min(opt_vol_ratio / 5.0, 1.0) * 25
    oi_s  = oi_score                       
    liq_s = max(0.0, (max_spread_pct - spread_pct) / max(max_spread_pct, 0.1)) * 10
    atm_s = max(0.0, 5.0 - atm_dist_pct) # 0 distance = 5 score, 5% distance = 0 score
    return round(u_s + vr_s + oi_s + liq_s + atm_s, 2)


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

# ── History helpers ───────────────────────────────────────────────────────────

def _find_candle_idx(hist_sorted: list, scan_date: str) -> int:
    """Return the index of the candle matching scan_date (YYYY-MM-DD). Falls back to last."""
    for i in range(len(hist_sorted) - 1, -1, -1):
        td = hist_sorted[i].get("trading_date", "")
        if td.startswith(scan_date):
            return i
    logger.warning("[SRO] No candle found for date %s — using last", scan_date)
    return len(hist_sorted) - 1


def _extract_from_candle(c: dict) -> tuple:
    """Return (open, high, low, close, volume) from a history candle dict."""
    return (
        float(c.get("open")   or 0),
        float(c.get("high")   or 0),
        float(c.get("low")    or 0),
        float(c.get("close")  or 0),
        int(c.get("volume")   or 0),
    )


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
    scanMode: str            = Query(default="auto"),      # live|history|auto|backtest
    scanDate: Optional[str]  = Query(default=None),
) -> SmartReversalOptionsResponse:

    t_start = time.time()
    
    # Normalise mode
    effective_mode = scanMode.lower()
    if scanDate and effective_mode == "auto":
        effective_mode = "backtest"

    use_history = effective_mode in ("history", "backtest")

    cache_key = (
        f"{lookbackDays}|{minPriceDrop}|{minVolumeRatio}|{closePosition}|"
        f"{optionVolumeRatio}|{strikeRange}|{expiry}|{optionType}|"
        f"{minOI}|{maxSpreadPct}|{effective_mode}|{scanDate}"
    )
    cached = _sro_cache.get(cache_key)
    if cached and (time.time() - cached["ts"]) < _CACHE_TTL:
        age = int(time.time() - cached["ts"])
        logger.info("[SRO] Cache HIT key=%s age=%ds", cache_key, age)
        return cached["data"]

    client = get_client()

    all_symbols = list(ALL_FNO_STOCKS)
    logger.info("[SRO] Phase 1 — scanning %d F&O stocks for underlying reversal (mode=%s)", len(all_symbols), effective_mode)

    # ─────────────────────────────────────────────────────────────────────────
    # Phase 1A: Batch SQLite history for all stock symbols
    # ─────────────────────────────────────────────────────────────────────────
    stock_history_map = history_db.get_history_map(all_symbols)

    # ─────────────────────────────────────────────────────────────────────────
    # Phase 1B: Batch live FULL quotes for all F&O cash instruments
    # ─────────────────────────────────────────────────────────────────────────
    stock_quotes: dict[str, Any] = {}
    sym_to_token: dict[str, str] = {}
    
    if not use_history:
        if not client.is_token_valid():
            if effective_mode == "live":
                logger.warning("[SRO] Not authenticated — returning empty")
                return SmartReversalOptionsResponse(
                    stocks=[], stocksQualified=0, optionsScanned=0,
                    totalFnoScanned=len(all_symbols), elapsedMs=0,
                    scanMode=effective_mode, scanDate=scanDate,
                )
        else:
            cash_instruments: list[dict] = []
            for sym in all_symbols:
                cash = IU.get_cash_token(sym)
                if cash:
                    token = cash["symboltoken"]
                    cash_instruments.append({"exchange": cash["exchange"], "symboltoken": token})
                    sym_to_token[sym] = _token_key(token)
            if cash_instruments:
                stock_quotes = await _batch_quote(cash_instruments, "FULL") or {}

    # ─────────────────────────────────────────────────────────────────────────
    # Phase 1C: Apply underlying stock reversal filter
    # ─────────────────────────────────────────────────────────────────────────
    qualified_stocks: dict[str, dict] = {}
    overall_mode_used = effective_mode
    overall_scan_date = None

    for sym in all_symbols:
        try:
            history = stock_history_map.get(sym, [])
            if not history:
                continue

            hist_sorted = sorted(history, key=lambda h: h.get("trading_date", ""))
            
            today_open = today_high = today_low = today_close = 0.0
            today_vol  = 0
            mode_used  = effective_mode
            
            if use_history:
                if len(hist_sorted) < 2:
                    continue
                today_idx = _find_candle_idx(hist_sorted, scanDate) if scanDate else len(hist_sorted) - 1
                if today_idx < 1:
                    continue
                    
                today_c    = hist_sorted[today_idx]
                yesterday  = hist_sorted[today_idx - 1]
                lookback   = hist_sorted[max(0, today_idx - lookbackDays): today_idx]
                
                today_open, today_high, today_low, today_close, today_vol = _extract_from_candle(today_c)
                scan_date_label = today_c.get("trading_date", scanDate or "")
            else:
                tk = sym_to_token.get(sym)
                q  = stock_quotes.get(tk) if tk else None
                live_vol = int(q.get("volume") or q.get("tradeVolume") or 0) if q else 0
                
                is_stale = False
                if live_vol > 0 and q and len(hist_sorted) > 0:
                    hc = float(hist_sorted[-1].get("close") or 0)
                    hv = int(hist_sorted[-1].get("volume") or 0)
                    qc = float(q.get("ltp") or q.get("close") or 0)
                    if hc == qc and hv == live_vol:
                        is_stale = True
                        
                if live_vol > 0 and q and not is_stale:
                    today_close = float(q.get("ltp")    or q.get("close")  or 0)
                    today_open  = float(q.get("open")   or 0)
                    today_high  = float(q.get("high")   or 0)
                    today_low   = float(q.get("low")    or 0)
                    today_vol   = live_vol
                    yesterday   = hist_sorted[-1]
                    lookback    = hist_sorted[-lookbackDays:]
                    mode_used   = "live"
                    scan_date_label = None
                else:
                    if len(hist_sorted) < 2:
                        continue
                    today_idx = len(hist_sorted) - 1
                    today_c = hist_sorted[today_idx]
                    yesterday = hist_sorted[today_idx - 1]
                    lookback = hist_sorted[max(0, today_idx - lookbackDays): today_idx]
                    today_open, today_high, today_low, today_close, today_vol = _extract_from_candle(today_c)
                    mode_used = "history"
                    scan_date_label = today_c.get("trading_date")

            if today_close <= 0 or today_high <= today_low:
                continue

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

            # Yesterday's session values
            yesterday_low = float(yesterday.get("low")    or 0)
            yesterday_vol = int(yesterday.get("volume")   or 0)

            # Step 3a: Volume Ratio
            recent_5 = hist_sorted[-5:] if not use_history else hist_sorted[max(0, today_idx - 5): today_idx]
            avg_vol   = (
                int(sum(int(h.get("volume") or 0) for h in recent_5) / len(recent_5))
                if recent_5 else 0
            )
            vol_ratio = round(today_vol / avg_vol, 2) if avg_vol > 0 else 0.0

            # Step 3b: Stock price recovery (bullish candle + close position)
            candle_rng = today_high - today_low
            close_pos  = (
                round(((today_close - today_low) / candle_rng) * 100, 2)
                if candle_rng > 0 else 0.0
            )
            bullish_candle = today_close > today_open
            lower_low      = (today_low < yesterday_low) if yesterday_low > 0 else False

            score       = _underlying_score(
                vol_ratio, price_drop_pct, close_pos,
                today_high, today_low, today_close, bullish_candle,
            )
            slice_start = today_idx - 5 if mode_used in ("history", "backtest") else len(hist_sorted) - 6
            vol_history = [int(h.get("volume") or 0) for h in hist_sorted[max(0, slice_start):today_idx + 1 if mode_used in ("history", "backtest") else None]]

            overall_mode_used = mode_used
            overall_scan_date = scan_date_label
            
            qualified_stocks[sym] = {
                "score":         score,
                "spot":          today_close,
                "recentHigh":    round(recent_high, 2),
                "recentHighDate": recent_high_date,
                "priceDropPct":  round(price_drop_pct, 2),
                "volRatio":      vol_ratio,
                "closePos":      close_pos,
                "volHistory":    vol_history,
                "todayIdx":      today_idx if mode_used in ("history", "backtest") else None,
            }

        except Exception as exc:
            logger.warning("[SRO] Underlying error %s: %s", sym, exc)

    logger.info("[SRO] Phase 1 done — %d stocks qualified of %d", len(qualified_stocks), len(all_symbols))

    if not qualified_stocks:
        elapsed = int((time.time() - t_start) * 1000)
        resp = SmartReversalOptionsResponse(
            stocks=[], stocksQualified=0, optionsScanned=0,
            totalFnoScanned=len(all_symbols), elapsedMs=elapsed,
            scanMode=overall_mode_used, scanDate=overall_scan_date
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
    # Phase 3 & 4: Batch option FULL quotes AND Option SQLite history
    # ─────────────────────────────────────────────────────────────────────────
    option_quotes: dict[str, Any] = {}
    
    if overall_mode_used == "live":
        if option_instruments:
            logger.info("[SRO] Phase 3 — fetching quotes for %d option contracts", len(option_instruments))
            option_quotes = await _batch_quote(option_instruments, "FULL") or {}
            logger.info("[SRO] Phase 3 done — %d quotes received", len(option_quotes))
    else:
        logger.info("[SRO] Phase 3 skipped for mode=%s", overall_mode_used)

    option_history_map = history_db.get_history_map(option_contract_ids)
    logger.info("[SRO] Phase 4 done — %d contract histories found", len(option_history_map))

    # ─────────────────────────────────────────────────────────────────────────
    # Phase 5: Per-contract scoring and signal
    # ─────────────────────────────────────────────────────────────────────────
    best_options: Dict[str, dict] = {}
    options_scanned = 0

    for token, meta in option_meta.items():
        try:
            sym        = meta["symbol"]
            stock_data = qualified_stocks.get(sym)
            if not stock_data:
                continue

            opt_type    = meta["optionType"]
            lot_size    = max(int(meta["lotSize"]), 1)
            contract_id = meta["contractId"]
            
            # Fetch option history for the contract
            opt_hist = option_history_map.get(contract_id, [])
            opt_hist_sorted = sorted(opt_hist, key=lambda h: h.get("trading_date", ""))

            # Handle OHLCV depending on mode
            bid = ask = spread = spread_pct = 0.0
            iv = delta = gamma = theta = vega = None
            
            if overall_mode_used in ("history", "backtest"):
                today_idx = _find_candle_idx(opt_hist_sorted, overall_scan_date) if overall_scan_date else len(opt_hist_sorted) - 1
                if today_idx < 1:
                    continue
                    
                today_c = opt_hist_sorted[today_idx]
                opt_open, opt_high, opt_low, opt_ltp, opt_vol_qty = _extract_from_candle(today_c)
                current_oi = int(today_c.get("oi") or 0)
                
                if today_idx < 1:
                    continue
                yesterday_c = opt_hist_sorted[today_idx - 1]
                prev_oi = int(yesterday_c.get("oi") or 0)
                yesterday_opt_vol_qty = int(yesterday_c.get("volume") or 0)
                prev_opt_close = float(yesterday_c.get("close") or 0)
                
                recent_5_opt = opt_hist_sorted[max(0, today_idx - 5): today_idx]
                opt_vol_history_list = opt_hist_sorted[max(0, today_idx - 5): today_idx + 1]
                options_scanned += 1
                
                if overall_mode_used == "history":
                    # For current history mode where spread is needed but unavailable, we set 0
                    pass
            else:
                q = option_quotes.get(token)
                if not q:
                    continue
                options_scanned += 1
                
                opt_ltp  = float(q.get("ltp")  or q.get("lastPrice") or 0)
                opt_open = float(q.get("open") or 0)
                opt_high = float(q.get("high") or 0)
                opt_low  = float(q.get("low")  or 0)
                opt_vol_qty = int(
                    q.get("volume") or q.get("tradeVolume") or
                    q.get("volumeTradedToday") or q.get("totalTradedVolume") or 0
                )
                current_oi = int(q.get("opnInterest") or q.get("openInterest") or q.get("open_interest") or 0)
                
                bid      = float(q.get("bestBidPrice") or q.get("bidPrice") or 0)
                ask      = float(q.get("bestAskPrice") or q.get("askPrice") or 0)
                spread   = round(max(0.0, ask - bid), 2)
                mid      = (ask + bid) / 2.0 if (ask + bid) > 0 else max(opt_ltp, 0.01)
                spread_pct = round((spread / mid) * 100, 2) if mid > 0 else 99.0
                
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
                
                recent_5_opt = opt_hist_sorted[-5:]
                prev_oi = int(opt_hist_sorted[-1].get("oi", 0)) if opt_hist_sorted else 0
                yesterday_opt_vol_qty = int(opt_hist_sorted[-1].get("volume", 0)) if opt_hist_sorted else 0
                prev_opt_close = float(opt_hist_sorted[-1].get("close", 0)) if opt_hist_sorted else 0.0
                opt_vol_history_list = opt_hist_sorted[-6:]
                
                if spread_pct > maxSpreadPct:
                    pass   # allow scoring but will be penalized for illiquidity

            if opt_ltp <= 0:
                continue

            # Step 8: Option price recovery
            opt_close_pos = _close_position(opt_ltp, opt_low, opt_high)

            # ── Live Volume (convert qty → lots) ──────────────────────────────
            opt_vol_lots = round(opt_vol_qty / lot_size)
            yesterday_opt_vol = round(yesterday_opt_vol_qty / lot_size)
            
            if current_oi < minOI:
                pass # let score handle it

            # ── Option history: avg vol + prev OI ─────────────────────────────
            avg_opt_vol_qty  = (
                int(sum(int(h.get("volume") or 0) for h in recent_5_opt) / len(recent_5_opt))
                if recent_5_opt else 0
            )
            avg_opt_vol = round(avg_opt_vol_qty / lot_size)
            
            oi_change_pct = (
                round(((current_oi - prev_oi) / prev_oi) * 100, 2)
                if prev_oi > 0 else 0.0
            )

            # ── Step 5: Option Volume Ratio ───────────────────────────────────
            opt_vol_ratio = (
                round(opt_vol_lots / avg_opt_vol, 2)
                if avg_opt_vol > 0
                else (1.0 if opt_vol_lots > 0 else 0.0)
            )
            # opt_vol_ratio is used in score; no hard filter

            # ── Step 6: OI pattern ────────────────────────────────────────────
            oi_pattern, oi_score = _oi_pattern_and_score(
                oi_change_pct, prev_opt_close, opt_ltp, opt_type,
            )

            # ── Volume history (lots) ─────────────────────────────────────────
            opt_vol_history = [int(h.get("volume") or 0) // lot_size for h in opt_vol_history_list]

            # ── Smart Score ───────────────────────────────────────────────────
            atm_dist_pct = min(abs(meta["strike"] - stock_data["spot"]) / stock_data["spot"] * 100, 5.0)

            smart_score = _option_smart_score(
                stock_data["score"],
                opt_vol_ratio,
                oi_score,
                spread_pct,
                maxSpreadPct,
                atm_dist_pct,
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

            rec_opt = RecommendedOption(
                strike=meta["strike"],
                type=opt_type,
                expiry=meta["expiry"],
                ltp=round(opt_ltp, 2),
                volume=opt_vol_lots,
                avgVolume=avg_opt_vol,
                volumeRatio=opt_vol_ratio,
                oi=current_oi,
                oiChange=oi_change_pct,
                spread=round(spread, 2),
                score=smart_score,
            )

            if sym not in best_options or smart_score > best_options[sym]["rec_opt"].score:
                meta2 = get_stock_metadata(sym)
                final_score = round(stock_data["score"] * 0.6 + smart_score * 0.4, 2)
                best_options[sym] = {
                    "rec_opt": rec_opt,
                    "meta2": meta2,
                    "final_score": final_score,
                    "signal": signal,
                    "overall_scan_date": overall_scan_date,
                    "overall_mode_used": overall_mode_used,
                    "stock_data": stock_data
                }

        except Exception as exc:
            logger.warning("[SRO] Scoring error token=%s: %s", token, exc)

    # ─────────────────────────────────────────────────────────────────────────
    # Phase 6: Sort, rank, cache, return
    # ─────────────────────────────────────────────────────────────────────────
    results: List[SmartReversalStockWithOption] = []
    for sym, data in best_options.items():
        results.append(
            SmartReversalStockWithOption(
                rank=0,
                symbol=sym,
                company=data["meta2"]["name"],
                sector=data["meta2"]["sector"],
                underlyingScore=data["stock_data"]["score"],
                recentHigh=data["stock_data"]["recentHigh"],
                currentPrice=round(data["stock_data"]["spot"], 2),
                priceDropPercent=data["stock_data"]["priceDropPct"],
                stockVolumeRatio=data["stock_data"]["volRatio"],
                stockClosePosition=data["stock_data"]["closePos"],
                stockVolumeHistory=data["stock_data"]["volHistory"],
                recommendedOption=data["rec_opt"],
                finalScore=data["final_score"],
                signal=data["signal"],
                scanDate=data["overall_scan_date"],
                scanMode=data["overall_mode_used"],
            )
        )

    results.sort(key=lambda x: x.finalScore, reverse=True)
    results = results[:limit]
    for idx, c in enumerate(results, start=1):
        c.rank = idx

    elapsed_ms = int((time.time() - t_start) * 1000)
    logger.info(
        "[SRO] Done — %d stocks qualified | %d options scanned | mode=%s | %dms",
        len(results), options_scanned, effective_mode, elapsed_ms,
    )

    response = SmartReversalOptionsResponse(
        stocks=results,
        stocksQualified=len(qualified_stocks),
        optionsScanned=options_scanned,
        totalFnoScanned=len(all_symbols),
        elapsedMs=elapsed_ms,
        scanMode=effective_mode,
        scanDate=scanDate,
    )
    _sro_cache[cache_key] = {"ts": time.time(), "data": response}
    return response
