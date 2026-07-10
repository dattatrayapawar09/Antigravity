"""
models.py — Pydantic request/response models for AntiGravity FastAPI backend.
All models are camelCase-aliased to match the existing JavaScript frontend contract.
"""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


# ── Request models ─────────────────────────────────────────────────────────────

class SymbolsRequest(BaseModel):
    from pydantic import Field

    symbols: list[str] = Field(default_factory=list)


from enum import Enum
class ContractCategory(str, Enum):
    STOCK = "Stock"
    INDEX = "Index"
class ScannerMode(str, Enum):
    INDEX = "index"
    STOCKS = "stocks"
    ALL = "all"
    
class OptionsRequest(BaseModel):
    symbols: list[str]
    expiry: str | None = None
    mode: ScannerMode = ScannerMode.STOCKS
    
# ── Response models ────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "ok"
    timestamp: str
    mode: str  # "LIVE" | "MOCK"
    uptime: float


class AuthStatusResponse(BaseModel):
    connected: bool
    mode: str
    clientId: Optional[str] = None


class LoginResponse(BaseModel):
    success: bool
    connected: bool
    mode: str


class SpotPricesResponse(BaseModel):
    spotPrices: dict[str, float]
    mode: str

class OptionContract(BaseModel):

    # ---------------------------------------
    # Basic Contract Information
    # ---------------------------------------

    id: str

    symbol: str

    strike: float

    type: str          # CE / PE

    expiry: str

    category: str = "Stock"   # Stock / Index

    # ---------------------------------------
    # Spot & Price
    # ---------------------------------------

    spot: float

    price: float

    prevPrice: float = 0

    # ---------------------------------------
    # Volume
    # ---------------------------------------

    volume: int

    avgVol: int

    volumeRatio: float = 0

    historicalVolumes: list[int] = []

    previousSessionVolume: int = 0

    # ---------------------------------------
    # Open Interest
    # ---------------------------------------

    oi: int

    prevOi: int = 0

    previousSessionOi: int = 0

    oiChange: int = 0

    oiChangePercent: float = 0

    # ---------------------------------------
    # Implied Volatility
    # ---------------------------------------

    iv: float = 0

    ivChange: float = 0

    # ---------------------------------------
    # Bid Ask
    # ---------------------------------------

    bid: float = 0

    ask: float = 0

    spread: float = 0

    # ---------------------------------------
    # Scanner
    # ---------------------------------------

    smartScore: float = 0

    signal: str = "Neutral"

    rank: int = 0

    # ---------------------------------------
    # UI
    # ---------------------------------------

    starred: bool = False

    alert: bool = False
    
class OptionsResponse(BaseModel):
    options: list[OptionContract]
    expiries: list[str]
    mode: str


class AvgVolResponse(BaseModel):
    avgVols: dict[str, Any]
    mode: str
    count: int


class ErrorResponse(BaseModel):
    error: str
