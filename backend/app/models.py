"""
models.py — Pydantic request/response models for AntiGravity FastAPI backend.
All models are camelCase-aliased to match the existing JavaScript frontend contract.
"""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


# ── Request models ─────────────────────────────────────────────────────────────

class SymbolsRequest(BaseModel):
    symbols: list[str] = Field(default_factory=list)


class OptionsRequest(BaseModel):
    symbols: list[str] = Field(default_factory=list)
    expiry: Optional[str] = None


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
    id: str
    symbol: str
    strike: float
    type: str
    expiry: str

    # Underlying Spot Price
    spot: float

    # Option Premium
    price: float
    prevPrice: float

    # Volume Data
    volume: int
    avgVol: int

    # Historical Volume Support
    historicalVolumes: list[int] = Field(default_factory=list)
    previousSessionVolume: int = 0

    # OI Data
    oi: int
    prevOi: int
    previousSessionOi: int = 0

    # IV
    iv: float

    # Timestamp
    lastUpdated: Optional[str] = None

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
