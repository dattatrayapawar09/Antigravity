"""
routes/scanner.py — Smart Reversal Scanner endpoint.

GET /api/scanner/smart-reversal
    ?lookbackDays=20      – number of recent sessions to find the swing high
    ?minPriceDrop=10      – minimum % drop from recent high  (positive number)
    ?minVolumeRatio=2     – minimum today/5-day-avg volume ratio
    ?closePosition=70     – minimum close-position % (close near high of day)
    ?useVwap=false        – require close > VWAP (optional Step 8)
    ?limit=100            – maximum results returned

Scanner steps (applied per F&O stock):
  1. Recent High  – max(high) over the last N SQLite candles
  2. Price Drop   – (close - recentHigh) / recentHigh × 100 ≤ -minPriceDrop
  3. Volume Ratio – todayVol / 5dayAvg ≥ minVolumeRatio
  4. Lower Low    – todayLow < yesterdayLow
  5. Bullish      – todayClose > todayOpen
  6. Close Pos    – (close-low)/(high-low)*100 ≥ closePosition
  7. Vol > Prev   – todayVolume > yesterdayVolume
  8. (Optional)   – close > VWAP
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, List, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.services import instrument_utils as IU
from app.services.stock_metadata import get_stock_metadata
from app.database import history_db
from app.routes.instruments import _batch_quote
from app.scanner_config import ALL_FNO_STOCKS
from app.smartapi import get_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/scanner", tags=["scanner"])

# ── In-memory response cache ──────────────────────────────────────────────────
_reversal_cache: dict[str, Any] = {}
_CACHE_TTL = 60  # seconds


# ── Pydantic response models ──────────────────────────────────────────────────

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


class SmartReversalResponse(BaseModel):
    stocks: List[SmartReversalStock]
    scanned: int
    totalFno: int
    elapsedMs: int


# ── Score calculator ──────────────────────────────────────────────────────────

def _compute_score(
    volume_ratio: float,
    price_drop_pct: float,   # negative value e.g. -12.5
    close_pos: float,        # 0-100
    high: float,
    low: float,
    close: float,
    bullish: bool,
) -> float:
    """
    Weighted score 0-100.

    Weight  Parameter
    30      Volume Ratio       (capped at 5x → 30 pts)
    25      Price Drop         (deeper = better, capped at -25% → 25 pts)
    20      Close Position     (scaled linearly 0-100 → 0-20 pts)
    15      Recovery from Low  ((close-low)/(high-low) → 0-15 pts)
    10      Bullish Candle     (boolean)
    """
    vol_score   = min(volume_ratio / 5.0, 1.0) * 30
    drop_score  = min(abs(price_drop_pct) / 25.0, 1.0) * 25
    cp_score    = (close_pos / 100.0) * 20
    candle_range = high - low
    recovery_score = ((close - low) / candle_range * 15) if candle_range > 0 else 0
    bull_score  = 10.0 if bullish else 0.0

    return round(vol_score + drop_score + cp_score + recovery_score + bull_score, 2)


def _compute_signal(
    price_drop_pct: float,
    volume_ratio: float,
    close_pos: float,
    bullish: bool,
    lower_low: bool,
) -> str:
    drop = abs(price_drop_pct)

    if (
        drop >= 10
        and volume_ratio >= 3
        and close_pos >= 80
        and bullish
    ):
        return "Strong Reversal"

    if (
        drop >= 10
        and volume_ratio >= 2
        and close_pos >= 70
    ):
        return "Reversal"

    if (
        drop >= 7
        and volume_ratio >= 1.5
        and bullish
    ):
        return "Watch"

    return "Weak"


# ── Main endpoint ─────────────────────────────────────────────────────────────

@router.get("/smart-reversal", response_model=SmartReversalResponse)
async def smart_reversal_scanner(
    lookbackDays: int   = Query(default=20,  ge=5,  le=60),
    minPriceDrop: float = Query(default=10,  ge=1,  le=50),
    minVolumeRatio: float = Query(default=2, ge=0.5, le=20),
    closePosition: float  = Query(default=70, ge=0, le=100),
    useVwap: bool         = Query(default=False),
    limit: int            = Query(default=100, ge=1, le=500),
) -> SmartReversalResponse:

    t_start = time.time()

    # ── Cache key ─────────────────────────────────────────────────────────────
    cache_key = f"{lookbackDays}|{minPriceDrop}|{minVolumeRatio}|{closePosition}|{useVwap}"
    cached = _reversal_cache.get(cache_key)
    if cached and (time.time() - cached["ts"]) < _CACHE_TTL:
        age = int(time.time() - cached["ts"])
        logger.info("[SmartReversal] Cache HIT (key=%s age=%ds)", cache_key, age)
        return cached["data"]

    logger.info(
        "[SmartReversal] Scanning %d F&O stocks "
        "(lookback=%d, minDrop=%.1f%%, minVRatio=%.1f, closePct=%.1f)",
        len(ALL_FNO_STOCKS), lookbackDays, minPriceDrop, minVolumeRatio, closePosition,
    )

    client = get_client()
    if not client.is_token_valid():
        logger.warning("[SmartReversal] Not authenticated — returning empty")
        return SmartReversalResponse(stocks=[], scanned=0, totalFno=len(ALL_FNO_STOCKS), elapsedMs=0)

    # ── Step A: Batch history from SQLite ──────────────────────────────────────
    # Stock history is stored with contract_id = symbol (populated by download_stock_history)
    all_symbols = list(ALL_FNO_STOCKS)
    history_map = history_db.get_history_map(all_symbols)

    # ── Step B: Batch live quotes ─────────────────────────────────────────────
    cash_instruments: list[dict[str, str]] = []
    sym_to_token: dict[str, str] = {}

    for symbol in all_symbols:
        cash = IU.get_cash_token(symbol)
        if cash:
            token = cash["symboltoken"]
            cash_instruments.append({
                "exchange": cash["exchange"],
                "symboltoken": token,
            })
            sym_to_token[symbol] = str(token).strip().lower()

    quotes: dict[str, Any] = {}
    if cash_instruments:
        quotes = await _batch_quote(cash_instruments, "FULL") or {}

    # ── Step C: Apply scanner logic per stock ─────────────────────────────────
    results: list[SmartReversalStock] = []
    total_fno = len(all_symbols)

    for symbol in all_symbols:
        try:
            token_key = sym_to_token.get(symbol)
            if not token_key:
                continue

            q = quotes.get(token_key)
            if not q:
                continue

            # ── Live quote values ─────────────────────────────────────────────
            today_close = float(q.get("ltp") or q.get("close") or 0)
            today_open  = float(q.get("open") or 0)
            today_high  = float(q.get("high") or 0)
            today_low   = float(q.get("low") or 0)
            today_vol   = int(q.get("volume") or q.get("tradeVolume") or 0)
            vwap        = float(q.get("avgPrice") or 0)

            if today_close <= 0 or today_high <= today_low:
                continue

            # ── Historical candles from SQLite ────────────────────────────────
            history = history_map.get(symbol, [])
            if not history:
                # No stored history yet — skip (will be available after first daily sync)
                logger.debug("[SmartReversal] No history for %s", symbol)
                continue

            # Sort ascending by date for consistency
            history_sorted = sorted(history, key=lambda h: h.get("trading_date", ""))

            # Use last N candles for lookback window (SQLite stores ≤ 6 most recent)
            lookback_candles = history_sorted[-lookbackDays:]

            # ── Step 1: Recent High ───────────────────────────────────────────
            recent_high      = 0.0
            recent_high_date = ""
            for candle in lookback_candles:
                h = float(candle.get("high") or 0)
                if h > recent_high:
                    recent_high      = h
                    recent_high_date = candle.get("trading_date", "")

            # Also consider today's high if it is higher (market open)
            if today_high > recent_high:
                recent_high = today_high

            if recent_high <= 0:
                continue

            # ── Step 2: Price Drop ────────────────────────────────────────────
            price_drop_pct = ((today_close - recent_high) / recent_high) * 100
            if price_drop_pct > -minPriceDrop:
                # Not dropped enough
                continue

            # ── Yesterday's candle (last stored closed session) ───────────────
            # The last row in history is the most recent closed session
            yesterday = history_sorted[-1]
            yesterday_low  = float(yesterday.get("low") or 0)
            yesterday_vol  = int(yesterday.get("volume") or 0)

            # ── Step 3: Volume Ratio ──────────────────────────────────────────
            recent_closed = history_sorted[-5:]
            avg_vol = (
                int(sum(int(h.get("volume") or 0) for h in recent_closed) / len(recent_closed))
                if recent_closed
                else 0
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

            # ── Step 7: Volume > Yesterday ────────────────────────────────────
            if today_vol <= yesterday_vol:
                continue

            # ── Step 8 (optional): VWAP Confirmation ─────────────────────────
            vwap_confirmed: Optional[bool] = None
            if useVwap:
                vwap_confirmed = (today_close > vwap) if vwap > 0 else None
                if vwap_confirmed is False:
                    continue

            # ── Score & Signal ────────────────────────────────────────────────
            score  = _compute_score(
                volume_ratio, price_drop_pct, close_pos,
                today_high, today_low, today_close, bullish_candle,
            )
            signal = _compute_signal(
                price_drop_pct, volume_ratio, close_pos, bullish_candle, lower_low,
            )

            # ── Metadata ──────────────────────────────────────────────────────
            meta    = get_stock_metadata(symbol)
            vol_history = [int(h.get("volume") or 0) for h in history_sorted[-6:]]

            results.append(
                SmartReversalStock(
                    rank=0,  # set after sort
                    symbol=symbol,
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
                )
            )

        except Exception as exc:
            logger.warning("[SmartReversal] Error processing %s: %s", symbol, exc)
            continue

    # ── Sort by score descending and rank ─────────────────────────────────────
    results.sort(key=lambda x: x.score, reverse=True)
    results = results[:limit]
    for idx, stock in enumerate(results, start=1):
        stock.rank = idx

    elapsed_ms = int((time.time() - t_start) * 1000)

    logger.info(
        "[SmartReversal] Done: %d results from %d F&O stocks in %dms",
        len(results), total_fno, elapsed_ms,
    )

    response = SmartReversalResponse(
        stocks=results,
        scanned=len(all_symbols),
        totalFno=total_fno,
        elapsedMs=elapsed_ms,
    )

    # Cache result
    _reversal_cache[cache_key] = {"ts": time.time(), "data": response}

    return response
