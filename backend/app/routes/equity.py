# app/routes/equity.py

import logging
from typing import List, Optional
from fastapi import APIRouter

from pydantic import BaseModel
from app.services import cache as C
from app.services import instrument_utils as IU
from app.services.stock_metadata import get_stock_metadata
from app.database import history_db
from app.routes.instruments import _batch_quote
from app.scanner_config import ALL_FNO_STOCKS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/equity", tags=["equity"])


class EquityVolumeStock(BaseModel):
    rank: int
    symbol: str
    companyName: str
    sector: str
    currentPrice: float
    previousClose: float
    changePercent: float
    todayVolume: int
    fiveDayAvgVolume: int
    volumeRatio: float
    priceMomentum: float
    vwap: float
    deliveryPercent: Optional[float] = None
    fiftyTwoWeekHigh: float
    fiftyTwoWeekLow: float
    smartScore: float
    signal: str


class EquityVolumeSurgeResponse(BaseModel):
    stocks: List[EquityVolumeStock]


@router.get("/volume-surge", response_model=EquityVolumeSurgeResponse)
async def get_equity_volume_surge() -> EquityVolumeSurgeResponse:
    logger.info("[Equity] Volume Surge request received")

    # 1. Fetch SQLite history for all F&O stocks in ONE batch query
    history_map = history_db.get_history_map(ALL_FNO_STOCKS)

    # 2. Prepare cash instruments for batch quote
    cash_instruments = []
    for symbol in ALL_FNO_STOCKS:
        cash = IU.get_cash_token(symbol)
        if cash:
            cash_instruments.append({
                "exchange": cash["exchange"],
                "symboltoken": cash["symboltoken"]
            })

    # 3. Batch fetch live quotes
    quotes = await _batch_quote(cash_instruments, "FULL") or {}

    unsorted_stocks = []

    for symbol in ALL_FNO_STOCKS:
        tok = IU.get_cash_token(symbol)
        if not tok:
            continue

        key = str(tok["symboltoken"]).strip().lower()
        q = quotes.get(key)
        if not q:
            continue

        # Extract live values from quote response
        price = float(q.get("ltp") or q.get("lastPrice") or 0.0)
        close = float(q.get("close") or 0.0)
        volume = int(q.get("volume") or q.get("tradeVolume") or 0)
        vwap = float(q.get("avgPrice") or 0.0)
        high52 = float(q.get("fiftyTwoWeekHigh") or 0.0)
        low52 = float(q.get("fiftyTwoWeekLow") or 0.0)

        # Get historical candles
        history = history_map.get(symbol, [])
        historical_volumes = [h["volume"] for h in history]

        # Calculate average volume of the previous 5 completed sessions only
        # (excluding today's live volume)
        avg_vol = 0
        if historical_volumes:
            avg_vol = int(sum(historical_volumes) / len(historical_volumes))

        # Calculate Volume Ratio
        volume_ratio = round(volume / avg_vol, 2) if avg_vol > 0 else 0.0

        # Change percent / Price Momentum
        change_pct = round(((price - close) / close) * 100, 2) if close > 0 else 0.0

        # Signal Logic:
        # Volume Ratio >= 2 and Price > Yesterday Close -> Strong Bullish
        # Volume Ratio >= 1.5 and Price > Yesterday Close -> Bullish
        # Volume Ratio >= 2 and Price < Yesterday Close -> Strong Bearish
        # Volume Ratio >= 1.5 and Price < Yesterday Close -> Bearish
        # Otherwise -> Neutral
        if volume_ratio >= 2.0 and price > close:
            signal = "Strong Bullish"
        elif volume_ratio >= 1.5 and price > close:
            signal = "Bullish"
        elif volume_ratio >= 2.0 and price < close:
            signal = "Strong Bearish"
        elif volume_ratio >= 1.5 and price < close:
            signal = "Bearish"
        else:
            signal = "Neutral"

        # Smart Score using Volume Ratio and Price Momentum
        smart_score = round(
            min(volume_ratio, 5) * 15
            + min(abs(change_pct), 10) * 2.5,
            2
        )

        metadata = get_stock_metadata(symbol)

        unsorted_stocks.append(
            EquityVolumeStock(
                rank=0, # to be set after sorting
                symbol=symbol,
                companyName=metadata["name"],
                sector=metadata["sector"],
                currentPrice=price,
                previousClose=close,
                changePercent=change_pct,
                todayVolume=volume,
                fiveDayAvgVolume=avg_vol,
                volumeRatio=volume_ratio,
                priceMomentum=change_pct,
                vwap=vwap,
                deliveryPercent=None,
                fiftyTwoWeekHigh=high52,
                fiftyTwoWeekLow=low52,
                smartScore=smart_score,
                signal=signal
            )
        )

    # 4. Sort descending by Volume Ratio
    unsorted_stocks.sort(key=lambda x: x.volumeRatio, reverse=True)

    # 5. Take Top 50 and assign Rank
    top_50 = unsorted_stocks[:50]
    for idx, stock in enumerate(top_50, 1):
        stock.rank = idx

    logger.info("[Equity] Returning %d top volume surge stocks", len(top_50))
    return EquityVolumeSurgeResponse(stocks=top_50)
