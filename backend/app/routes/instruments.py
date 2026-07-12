"""
routes/instruments.py — Spot prices, options chain, and avgvol endpoints.

Exact port of the Node /api/instruments/* routes.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter

from app.models import AvgVolResponse, OptionContract, OptionsRequest, OptionsResponse, SpotPricesResponse, SymbolsRequest
from app.services import instrument_utils as IU
from app.smartapi import get_client
from app.database import history_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/instruments", tags=["instruments"])

_BATCH_SIZE = 50


# ── Helpers ───────────────────────────────────────────────────────────────────

def _token_key(t: Any) -> str:
    return str(t or "").strip().lower()


async def _batch_quote(
    instruments: list[dict[str, str]], mode: str = "LTP"
) -> dict[str, Any]:
    """
    Fetch quotes in batches of 50.
    Returns {token_key: quote_dict}.
    """
    client  = get_client()
    results: dict[str, Any] = {}

    for i in range(0, len(instruments), _BATCH_SIZE):
        batch = instruments[i : i + _BATCH_SIZE]
        try:
            data = await client.get_quote(batch, mode)
            if not data:
                logger.warning("[Quote] Null response for batch %d", i // _BATCH_SIZE + 1)
                continue

            fetched: list[dict] = data.get("fetched", [])
            for q in fetched:
                tok = _token_key(
                    q.get("symbolToken") or q.get("symboltoken") or q.get("token", "")
                )
                if tok:
                    results[tok] = q

            logger.info(
                "Fetched=%d",
                len(fetched)
            )

            if fetched:
                logger.info(
                    "First Quote=%s",
                    fetched[0]
                )
        except Exception as exc:
            logger.error("[Quote] Batch fetch error: %s", exc)

    return results


# ── POST /api/instruments/spot ─────────────────────────────────────────────────

@router.post("/spot", response_model=SpotPricesResponse)
async def spot_prices(body: SymbolsRequest) -> SpotPricesResponse:
    client  = get_client()
    symbols = body.symbols

    if not client.is_token_valid():
        return SpotPricesResponse(spotPrices={}, mode="MOCK")

    instruments = [t for t in (IU.get_cash_token(s) for s in symbols) if t]
    if not instruments:
        return SpotPricesResponse(spotPrices={}, mode="LIVE")

    quotes = await _batch_quote(instruments, "LTP")
    spot_prices_: dict[str, float] = {}

    for sym in symbols:
        tok = IU.get_cash_token(sym)
        if not tok:
            continue
        key = _token_key(tok["symboltoken"])
        q   = quotes.get(key)
        if q:
            ltp = float(q.get("ltp") or q.get("close") or 0)
            if ltp > 0:
                spot_prices_[sym] = ltp

    return SpotPricesResponse(spotPrices=spot_prices_, mode="LIVE")


# ── POST /api/instruments/options ──────────────────────────────────────────────

@router.post("/options", response_model=OptionsResponse)
async def options_chain(body: OptionsRequest) -> OptionsResponse:
    client  = get_client()
    symbols = body.symbols or []
    from app.scanner_config import INDEX_SYMBOLS, TOP_50_STOCKS

    if not symbols:

        if body.mode.value == "index":
            symbols = INDEX_SYMBOLS

        elif body.mode.value == "stocks":
            symbols = TOP_50_STOCKS

        else:
            symbols = INDEX_SYMBOLS + TOP_50_STOCKS
    expiry  = body.expiry

    if not client.is_token_valid():
        logger.warning("[Options] Not authenticated — returning MOCK")
        return OptionsResponse(options=[], expiries=[], mode="MOCK")

    cache_status = IU.get_cache_status()
    if not cache_status["loaded"]:
        logger.warning("[Options] Scrip master not yet loaded — returning LOADING")
        return OptionsResponse(options=[], expiries=[], mode="LOADING")

    logger.info(
        "[Options] Request: symbols=%s expiry=%s",
        ",".join(symbols), expiry or "auto",
    )

    # ── Step 1: Fetch spot prices ──────────────────────────────────────────────
    spot_instruments = [t for t in (IU.get_cash_token(s) for s in symbols) if t]
    spot_quotes: dict[str, Any] = {}
    if spot_instruments:
        spot_quotes = await _batch_quote(spot_instruments, "LTP") or {}

    spot_prices_map: dict[str, float] = {}
    for sym in symbols:
        tok = IU.get_cash_token(sym)
        if not tok:
            logger.warning("[Options] No cash token for %r — cannot fetch spot", sym)
            continue

        key = _token_key(tok["symboltoken"])
        q   = spot_quotes.get(key)
        ltp = float(q.get("ltp") or q.get("close") or 0) if q else 0.0

        # Fallback: dedicated getLtpData for indices
        if ltp == 0:
            ltp_data = await client.get_ltp_data(
                tok["exchange"], tok["tradingsymbol"], tok["symboltoken"]
            )
            if ltp_data and float(ltp_data.get("ltp", 0)) > 0:
                ltp = float(ltp_data["ltp"])

        if ltp > 0:
            spot_prices_map[sym] = ltp
            logger.info(
                "[Options][SPOT] %s → token=%s exchange=%s LTP=%.2f",
                sym, tok["symboltoken"], tok["exchange"], ltp,
            )
        else:
            logger.warning(
                "[Options][SPOT] %s → token=%s — no quote returned",
                sym, tok["symboltoken"],
            )
       
    # ── Step 2: Build option chains from scrip master ──────────────────────────
    option_tokens_to_fetch: list[dict[str, str]] = []
    token_to_contract_map: dict[str, dict[str, Any]] = {}
    available_expiries_set: set[str] = set()

    for sym in symbols:
        spot = spot_prices_map.get(sym, 0.0)
        if spot == 0:
            logger.warning("[Options] %s: spot=0, skipping option chain", sym)
            continue

        from app.scanner_config import (
            INDEX_STRIKE_RANGE,
            STOCK_STRIKE_RANGE,
            INDEX_SYMBOLS,
        )

        num_strikes = (
            INDEX_STRIKE_RANGE
            if sym in INDEX_SYMBOLS
            else STOCK_STRIKE_RANGE
        )
        
        
        mapping = IU.generate_option_chain_mapping(
            sym,
            expiry,
            spot,
            num_strikes,
        )
        if "error" in mapping:
            logger.warning("[Options] mapping error for %s: %s", sym, mapping["error"])
            continue

        for e in mapping.get("allExpiries", []):
            available_expiries_set.add(e)
        
        logger.info(
            "[Options] %s | spot=%.2f | ATM=%.2f | expiry=%s | contracts=%d",
            sym, spot, mapping["atmStrike"], mapping["expiry"], len(mapping["chain"]),
        )
        
        for contract in mapping["chain"]:
            instr_obj = {
                "exchange":    contract["exch_seg"],
                "symboltoken": contract["token"],
            }
            option_tokens_to_fetch.append(instr_obj)
            token_to_contract_map[_token_key(contract["token"])] = {
                **contract,
                "spotPrice": spot,
            }

    # ── Step 3: Fetch real-time LTP/OI/Volume for options ─────────────────────
    option_quotes: dict[str, Any] = {}
    if option_tokens_to_fetch:
        logger.info(
            "[Options] Fetching quotes for %d contracts...",
            len(option_tokens_to_fetch),
        )
        option_quotes = await _batch_quote(option_tokens_to_fetch, "FULL") or {}
        logger.info(
            "OPTION QUOTES RECEIVED = %d",
            len(option_quotes)
        )
       
        logger.info(
            "OPTION QUOTES RECEIVED = %d",
            len(option_quotes)
        )
        

    # ── Step 4: Assemble final option records ──────────────────────────────────
    # ----------------------------------------------------
    # Load historical data in ONE SQLite query
    # ----------------------------------------------------

    contract_ids = []

    for contract in token_to_contract_map.values():

        contract_ids.append(
            f"{contract['underlying']}_"
            f"{contract['strike']}_"
            f"{contract['type']}"
        )

    history_map = history_db.get_history_map(contract_ids)

    all_options: list[OptionContract] = []

    for instr in option_tokens_to_fetch:
        key      = _token_key(instr["symboltoken"])
        q        = option_quotes.get(key)
        
        contract = token_to_contract_map.get(key)
        if q is None:
            logger.warning(
                "TOKEN %s NOT FOUND IN OPTION QUOTES",
                key
            )
        if not contract:
            continue
        if not q:
            logger.warning(
                "No quote for %s",
                contract["token"]
            )
            continue

        import json

        logger.info(
            "[RAW OPTION QUOTE]\n%s",
            json.dumps(q, indent=2, default=str)
        )
        
        if q:
            ltp = float(q.get("ltp") or 0)
            logger.debug(
                "[Options][CONTRACT] %s | expiry=%s | strike=%s | type=%s"
                " | token=%s | LTP=%.2f | OI=%s | Vol=%s",
                contract.get("underlying"), contract.get("expiry"),
                contract.get("strike"), contract.get("type"),
                contract.get("token"), ltp,
                q.get("opnInterest", 0), q.get("volume", 0),
            )
        else:
            logger.warning(
                "[Options][MISS] %s %s %s token=%s — no quote",
                contract.get("underlying"), contract.get("strike"),
                contract.get("type"), contract.get("token"),
            )
                           
        # ============================================================
        # Live Quote Values (Robust Mapping)
        # ============================================================
        logger.info(
            "[QUOTE KEYS] %s",
            list(q.keys()) if q else []
        )
        # LTP
        price = float(
            q.get("ltp")
            or q.get("lastPrice")
            or q.get("lastTradedPrice")
            or 0
        )

        # Open Interest
        oi = int(
            q.get("opnInterest")
            or q.get("openInterest")
            or q.get("open_interest")
            or 0
        )

        # Today's Traded Volume
        volume = int(
            q.get("volume")
            or q.get("tradeVolume")
            or q.get("volumeTradedToday")
            or q.get("totalTradedVolume")
            or q.get("tradedVolume")
            or q.get("totalVolume")
            or 0
        )

        # Implied Volatility
        iv = float(
            q.get("impliedVol")
            or q.get("impliedVolatility")
            or q.get("iv")
            or 0
        )

        # Best Bid
        bid = float(
            q.get("bestBidPrice")
            or q.get("bidPrice")
            or q.get("bestBid")
            or 0
        )

        # Best Ask
        ask = float(
            q.get("bestAskPrice")
            or q.get("askPrice")
            or q.get("bestAsk")
            or 0
        )
        logger.info(
            "[OPTION VALUES] "
            "LTP=%s "
            "OI=%s "
            "VOL=%s "
            "IV=%s "
            "BID=%s "
            "ASK=%s",
            price,
            oi,
            volume,
            iv,
            bid,
            ask,
        )
        contract_id = (
            f"{contract['underlying']}_"
            f"{contract['strike']}_"
            f"{contract['type']}"
        )
        logger.debug("[QUOTE] %s", q)
        history = history_map.get(contract_id, [])
        
        historicalVolumes = [
            h["volume"]
            for h in history
        ]
        
        # ---------------------------------------
        # Average Volume (Last 5 Trading Sessions)
        # ---------------------------------------

        history_for_avg = history[-5:] if history else []

        avgVol = (
            int(
                sum(int(h.get("volume", 0)) for h in history_for_avg)
                / len(history_for_avg)
            )
            if history_for_avg
            else 0
        )

        volumeRatio = (
            round(volume / avgVol, 2)
            if avgVol > 0
            else 0
        )
        
        logger.info(
            "[VOLUME CHECK] Current=%s Avg=%s Ratio=%s HistoryDays=%s",
            volume,
            avgVol,
            volumeRatio,
            len(history_for_avg),
        )
        # ---------------------------------------
        # OI Change
        # ---------------------------------------
        
        previousSessionOi = (
            int(history[-2].get("oi", 0))
            if len(history) >= 2
            else 0
        )

        oiChange = oi - previousSessionOi
        
        prevPrice = (
            float(history[-2].get("close", price))
            if len(history) >= 2
            else price
        )
                
        priceMomentum = (
            ((price - prevPrice) / prevPrice) * 100
            if prevPrice > 0
            else 0
        )
        
        oiPercent = (
            abs(oiChange) / previousSessionOi * 100
            if previousSessionOi > 0
            else 0
        )

        smartScore = round(
            min(volumeRatio, 5) * 40
            + min(oiPercent, 100) * 0.30
            + min(abs(priceMomentum), 10) * 1.5
            + min(iv, 100) * 0.10,
            2,
        )
        previousSessionVolume = (
            int(history[-2].get("volume", 0))
            if len(history) >= 2
            else 0
        )
                     
        prevPrice = (
            float(history[-2].get("close", price))
            if len(history) >= 2
            else price
        )
        # ---------------------------------------
        # Trading Signal
        # ---------------------------------------

        if smartScore >= 80:
            signal = "Strong Bullish"

        elif smartScore >= 60:
            signal = "Bullish"

        elif smartScore <= 20:
            signal = "Strong Bearish"

        elif smartScore <= 40:
            signal = "Bearish"

        else:
            signal = "Neutral"
            
        all_options.append(
            OptionContract(
                id=contract_id,
                symbol=contract["underlying"],
                category=contract.get("category", "Stock"),
                strike=float(contract["strike"]),
                type=contract["type"],
                expiry=contract["expiry"],
        
                spot=float(contract["spotPrice"]),
        
                price=price,
                prevPrice=prevPrice,
        
                volume=volume,
                avgVol=avgVol,
                volumeRatio=volumeRatio,
                smartScore=smartScore,
                signal=signal,
                historicalVolumes=historicalVolumes,
                previousSessionVolume=previousSessionVolume,
        
                oi=oi,
                oiChange=oiChange,
                prevOi=previousSessionOi,
                previousSessionOi=previousSessionOi,
        
                iv=iv,
        
                bid=bid,
                ask=ask,
                spread=max(0, ask - bid),               
            )
        )
    
    logger.info(
        "[Options] Returning %d contracts",
        len(all_options)
    )

    sorted_expiries = IU.sort_expiries(
        list(available_expiries_set)
    )
    # ----------------------------------------------------
    # Pick BEST option for every stock
    # ----------------------------------------------------
    
    best_option_per_stock = {}
    
    for option in all_options:
    
        existing = best_option_per_stock.get(option.symbol)
    
        if existing is None:
    
            best_option_per_stock[option.symbol] = option
    
            continue
    
        #
        # Higher Volume Ratio wins
        #
    
        if option.volumeRatio > existing.volumeRatio:
    
            best_option_per_stock[option.symbol] = option
    
    #
    # Convert dictionary back to list
    #
    
    top_stock_options = list(
        best_option_per_stock.values()
    )
    
    #
    # Rank stocks by Volume Ratio
    #
    
    top_stock_options.sort(

        key=lambda x: x.smartScore,
    
        reverse=True,
    
    )
     
    #
    # Return Top 50 Stocks
    #
    
    top_stock_options = top_stock_options[:50]
    for idx, option in enumerate(top_stock_options, start=1):
        option.rank = idx  
        # ----------------------------------------------------
        # Scanner Mode Selection
        # ----------------------------------------------------
        
    if body.mode.value == "index":
        
            final_options = [
                o
                for o in all_options
                if o.category == "Index"
            ]
        
            final_options.sort(
                key=lambda x: x.smartScore,
                reverse=True,
            )
        
            final_options = final_options[:50]
        
    elif body.mode.value == "all":
        
            final_options = sorted(
                all_options,
                key=lambda x: x.smartScore,
                reverse=True,
            )[:50]
        
    else:
        
            final_options = top_stock_options
        
        
        # ----------------------------------------------------
        # Ranking
        # ----------------------------------------------------
        
    for idx, option in enumerate(final_options, start=1):
        
            option.rank = idx
        
        
    return OptionsResponse(
        
            options=final_options,
        
            expiries=sorted_expiries,
        
            mode="LIVE",
        
        )   

# ── POST /api/instruments/avgvol ───────────────────────────────────────────────

@router.post("/avgvol", response_model=AvgVolResponse)
async def avg_vol(body: SymbolsRequest) -> AvgVolResponse:
    client = get_client()
    if not client.is_token_valid():
        return AvgVolResponse(avgVols={}, mode="MOCK", count=0)

    # Inline 5-session historical fetch is too slow;
    # frontend handles avgVol estimation itself.
    return AvgVolResponse(avgVols={}, mode="LIVE", count=0)
