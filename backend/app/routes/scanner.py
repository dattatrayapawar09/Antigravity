"""
routes/scanner.py — Smart Reversal Scanner endpoint.

GET /api/scanner/smart-reversal
    ?lookbackDays=20      – sessions to find the swing high
    ?minPriceDrop=10      – minimum % drop from recent high  (positive number)
    ?minVolumeRatio=2     – minimum today/5-day-avg volume ratio
    ?closePosition=70     – minimum close-position % (close near high of day)
    ?useVwap=false        – require close > VWAP (live mode only)
    ?limit=100            – maximum results returned

    ?scanMode=auto        – "live" | "history" | "auto" | "backtest"
    ?scanDate=YYYY-MM-DD  – (backtest only) treat this date's candle as today

Scan Modes
──────────────────────────────────────────────────────────────────
live      – always use live Angel One quote (only works during market hours)
history   – always use the last stored SQLite candle as "today"
            (works 24/7 after the daily history sync completes)
auto      – try live quote; if today's volume == 0 (market closed)
            automatically fall back to the last SQLite candle
backtest  – scan a specific past date using SQLite candles
            (requires scanDate=YYYY-MM-DD)
"""
from __future__ import annotations

import logging
import time
from typing import Any, List, Optional

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

_reversal_cache: dict[str, Any] = {}
_CACHE_TTL = 60   # seconds


# ── Pydantic models ───────────────────────────────────────────────────────────

class SmartReversalStock(BaseModel):
    rank: int
    symbol: str
    company: str
    sector: str

    recentHigh: float
    recentHighDate: str

    currentPrice: float
    priceDropPercent: float

    todayOpen: float
    todayHigh: float
    todayLow: float
    todayClose: float

    closePosition: float

    todayVolume: int
    avgVolume: int
    yesterdayVolume: int
    volumeRatio: float
    volumeHistory: List[int]

    yesterdayLow: float
    lowerLow: bool
    bullishCandle: bool

    vwap: float
    vwapConfirmed: Optional[bool]

    score: float
    signal: str

    # Backtest metadata
    scanDate: Optional[str] = None
    scanMode: str = "live"


class SmartReversalResponse(BaseModel):
    stocks: List[SmartReversalStock]
    scanned: int
    totalFno: int
    elapsedMs: int
    scanMode: str
    scanDate: Optional[str] = None


# ── Score helpers ─────────────────────────────────────────────────────────────

def _compute_score(
    volume_ratio: float,
    price_drop_pct: float,
    close_pos: float,
    high: float,
    low: float,
    close: float,
    bullish: bool,
) -> float:
    vol_score      = min(volume_ratio / 5.0, 1.0) * 30
    drop_score     = min(abs(price_drop_pct) / 25.0, 1.0) * 25
    cp_score       = (close_pos / 100.0) * 20
    candle_range   = high - low
    recovery_score = ((close - low) / candle_range * 15) if candle_range > 0 else 0
    bull_score     = 10.0 if bullish else 0.0
    return round(vol_score + drop_score + cp_score + recovery_score + bull_score, 2)


def _compute_signal(
    price_drop_pct: float,
    volume_ratio: float,
    close_pos: float,
    bullish: bool,
    lower_low: bool,
) -> str:
    drop = abs(price_drop_pct)
    if drop >= 10 and volume_ratio >= 3 and close_pos >= 80 and bullish:
        return "Strong Reversal"
    if drop >= 10 and volume_ratio >= 2 and close_pos >= 70:
        return "Reversal"
    if drop >= 7 and volume_ratio >= 1.5 and bullish:
        return "Watch"
    return "Weak"


# ── History helpers ───────────────────────────────────────────────────────────

def _find_candle_idx(hist_sorted: list, scan_date: str) -> int:
    """Return the index of the candle matching scan_date (YYYY-MM-DD). Falls back to last."""
    for i in range(len(hist_sorted) - 1, -1, -1):
        td = hist_sorted[i].get("trading_date", "")
        if td.startswith(scan_date):
            return i
    logger.warning("[SmartReversal] No candle found for date %s — using last", scan_date)
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

@router.get("/smart-reversal", response_model=SmartReversalResponse)
async def smart_reversal_scanner(
    lookbackDays:     int   = Query(default=20,  ge=5,  le=60),
    minPriceDrop:     float = Query(default=10,  ge=1,  le=50),
    minVolumeRatio:   float = Query(default=2,   ge=0.5, le=20),
    closePosition:    float = Query(default=70,  ge=0,  le=100),
    useVwap:          bool  = Query(default=False),
    limit:            int   = Query(default=100, ge=1,  le=500),
    scanMode:         str   = Query(default="auto"),   # live|history|auto|backtest
    scanDate:         Optional[str] = Query(default=None),
) -> SmartReversalResponse:

    t_start = time.time()

    # Normalise mode
    effective_mode = scanMode.lower()
    if scanDate and effective_mode == "auto":
        effective_mode = "backtest"

    # Use history when explicitly requested or when backtesting
    use_history = effective_mode in ("history", "backtest")

    cache_key = f"{lookbackDays}|{minPriceDrop}|{minVolumeRatio}|{closePosition}|{useVwap}|{effective_mode}|{scanDate}"
    cached = _reversal_cache.get(cache_key)
    if cached and (time.time() - cached["ts"]) < _CACHE_TTL:
        return cached["data"]

    logger.info(
        "[SmartReversal] mode=%s date=%s lookback=%d drop=%.1f%% VR=%.1f closePct=%.1f",
        effective_mode, scanDate, lookbackDays, minPriceDrop, minVolumeRatio, closePosition,
    )

    client = get_client()

    # ── Phase A: SQLite history (always needed) ───────────────────────────────
    all_symbols  = list(ALL_FNO_STOCKS)
    history_map  = history_db.get_history_map(all_symbols)

    # ── Phase B: Live quotes (skip in pure history/backtest mode) ─────────────
    stock_quotes: dict[str, Any] = {}
    sym_to_token: dict[str, str] = {}

    if not use_history:
        if not client.is_token_valid():
            if effective_mode == "live":
                logger.warning("[SmartReversal] Not authenticated")
                return SmartReversalResponse(
                    stocks=[], scanned=0, totalFno=len(all_symbols),
                    elapsedMs=0, scanMode=effective_mode, scanDate=scanDate,
                )
            # auto mode: proceed without live quotes (will fall back to history)
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

    # ── Phase C: Per-stock analysis ───────────────────────────────────────────
    results: list[SmartReversalStock] = []

    for sym in all_symbols:
        try:
            history = history_map.get(sym, [])
            if not history:
                continue

            hist_sorted = sorted(history, key=lambda h: h.get("trading_date", ""))

            # ── Determine today and yesterday data source ──────────────────────
            today_open = today_high = today_low = today_close = 0.0
            today_vol  = 0
            vwap       = 0.0
            mode_used  = effective_mode

            if use_history:
                # Pure history / backtest — read entirely from SQLite
                if len(hist_sorted) < 2:
                    continue

                today_idx = _find_candle_idx(hist_sorted, scanDate) if scanDate else len(hist_sorted) - 1
                if today_idx < 1:
                    continue   # no previous candle to act as "yesterday"

                today_c    = hist_sorted[today_idx]
                yesterday  = hist_sorted[today_idx - 1]
                lookback   = hist_sorted[max(0, today_idx - lookbackDays): today_idx]

                today_open, today_high, today_low, today_close, today_vol = _extract_from_candle(today_c)
                scan_date_label = today_c.get("trading_date", scanDate or "")

            else:
                # Live or auto — try live quote first
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
                    # Live data valid
                    today_close = float(q.get("ltp")   or q.get("close") or 0)
                    today_open  = float(q.get("open")  or 0)
                    today_high  = float(q.get("high")  or 0)
                    today_low   = float(q.get("low")   or 0)
                    today_vol   = live_vol
                    vwap        = float(q.get("avgPrice") or 0)
                    yesterday   = hist_sorted[-1]
                    lookback    = hist_sorted[-lookbackDays:]
                    mode_used   = "live"
                    scan_date_label = None

                else:
                    # Auto fallback — market is closed or quote is stale, use last stored candle as today
                    if len(hist_sorted) < 2:
                        continue
                    today_idx  = len(hist_sorted) - 1
                    today_c    = hist_sorted[today_idx]
                    yesterday  = hist_sorted[today_idx - 1]
                    lookback   = hist_sorted[max(0, today_idx - lookbackDays): today_idx]
                    today_open, today_high, today_low, today_close, today_vol = _extract_from_candle(today_c)
                    mode_used  = "history"
                    scan_date_label = today_c.get("trading_date")
                    logger.debug("[SmartReversal] %s auto→history fallback (live_vol=%s, stale=%s)", sym, live_vol, is_stale)

            if today_close <= 0 or today_high <= today_low:
                continue

            yesterday_low = float(yesterday.get("low")    or 0)
            yesterday_vol = int(yesterday.get("volume")   or 0)

            # ── Step 1: Recent High ───────────────────────────────────────────
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

            # ── Step 2: Price Drop ────────────────────────────────────────────
            price_drop_pct = ((today_close - recent_high) / recent_high) * 100
            if price_drop_pct > -minPriceDrop:
                continue

            # ── Step 3: Volume Ratio ──────────────────────────────────────────
            recent_5 = hist_sorted[-5:] if not use_history else (
                hist_sorted[max(0, today_idx - 5): today_idx]
            )
            avg_vol = (
                int(sum(int(h.get("volume") or 0) for h in recent_5) / len(recent_5))
                if recent_5 else 0
            )
            volume_ratio = round(today_vol / avg_vol, 2) if avg_vol > 0 else 0.0
            if volume_ratio < minVolumeRatio:
                continue

            # ── Step 4: Lower Low ─────────────────────────────────────────────
            lower_low = (today_low < yesterday_low) if yesterday_low > 0 else False

            # ── Step 5: Bullish Candle ────────────────────────────────────────
            bullish_candle = today_close > today_open

            # ── Step 6: Close Position ────────────────────────────────────────
            candle_range = today_high - today_low
            close_pos = round(
                ((today_close - today_low) / candle_range) * 100, 2
            ) if candle_range > 0 else 0.0
            if close_pos < closePosition:
                continue

            # ── Step 7: Volume > Yesterday (Removed strict check) ──────────────

            # ── Step 8 (optional): VWAP ───────────────────────────────────────
            vwap_confirmed: Optional[bool] = None
            if useVwap and vwap > 0:
                vwap_confirmed = today_close > vwap
                if not vwap_confirmed:
                    continue

            # ── Score & Signal ────────────────────────────────────────────────
            score  = _compute_score(
                volume_ratio, price_drop_pct, close_pos,
                today_high, today_low, today_close, bullish_candle,
            )
            signal = _compute_signal(
                price_drop_pct, volume_ratio, close_pos, bullish_candle, lower_low,
            )

            meta        = get_stock_metadata(sym)
            slice_start = today_idx - 5 if use_history else len(hist_sorted) - 6
            vol_history = [int(h.get("volume") or 0) for h in hist_sorted[max(0, slice_start):today_idx + 1]]

            results.append(
                SmartReversalStock(
                    rank=0,
                    symbol=sym,
                    company=meta["name"],
                    sector=meta["sector"],

                    recentHigh=round(recent_high, 2),
                    recentHighDate=recent_high_date,

                    currentPrice=round(today_close, 2),
                    priceDropPercent=round(price_drop_pct, 2),

                    todayOpen=round(today_open, 2),
                    todayHigh=round(today_high, 2),
                    todayLow=round(today_low, 2),
                    todayClose=round(today_close, 2),

                    closePosition=close_pos,

                    todayVolume=today_vol,
                    avgVolume=avg_vol,
                    yesterdayVolume=yesterday_vol,
                    volumeRatio=volume_ratio,
                    volumeHistory=vol_history,

                    yesterdayLow=round(yesterday_low, 2),
                    lowerLow=lower_low,
                    bullishCandle=bullish_candle,

                    vwap=round(vwap, 2),
                    vwapConfirmed=vwap_confirmed,

                    score=score,
                    signal=signal,

                    scanDate=scan_date_label,
                    scanMode=mode_used,
                )
            )

        except Exception as exc:
            logger.warning("[SmartReversal] Error processing %s: %s", sym, exc)

    # ── Sort, rank, cache ─────────────────────────────────────────────────────
    results.sort(key=lambda x: x.score, reverse=True)
    results = results[:limit]
    for idx, stock in enumerate(results, start=1):
        stock.rank = idx

    elapsed_ms = int((time.time() - t_start) * 1000)
    logger.info(
        "[SmartReversal] Done: %d results | mode=%s | %dms",
        len(results), effective_mode, elapsed_ms,
    )

    response = SmartReversalResponse(
        stocks=results,
        scanned=len(all_symbols),
        totalFno=len(all_symbols),
        elapsedMs=elapsed_ms,
        scanMode=effective_mode,
        scanDate=scanDate,
    )
    _reversal_cache[cache_key] = {"ts": time.time(), "data": response}
    return response
