"""
config.py — Pydantic-settings configuration for AntiGravity backend.
Validates required environment variables on startup; fails fast if missing.
"""
from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Required Angel One credentials ──────────────────────────────────────────
    angel_api_key: str
    angel_client_id: str
    angel_password: str
    angel_totp_secret: str

    # ── Optional settings ────────────────────────────────────────────────────────
    port: int = 10000
    debug_log: bool = False
    environment: Literal["development", "production"] = "production"

    # ── Internal ─────────────────────────────────────────────────────────────────
    scrip_master_url: str = (
        "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json"
    )
    angel_base_url: str = "https://apiconnect.angelone.in"

    @field_validator("angel_api_key", "angel_client_id", "angel_password", "angel_totp_secret")
    @classmethod
    def must_not_be_empty(cls, v: str, info) -> str:
        v = v.strip()
        if not v:
            raise ValueError(f"{info.field_name} must not be empty")
        if v.upper().startswith("DUMMY"):
            raise ValueError(
                f"{info.field_name} looks like a placeholder — set a real value"
            )
        return v

    def log_safe_summary(self) -> None:
        logger.info("[Env] ANGEL_API_KEY     : %s****", self.angel_api_key[:4])
        logger.info("[Env] ANGEL_CLIENT_ID   : %s", self.angel_client_id)
        logger.info("[Env] ANGEL_PASSWORD    : ****")
        logger.info("[Env] ANGEL_TOTP_SECRET : %s****", self.angel_totp_secret[:4])
        logger.info("[Env] PORT              : %d", self.port)
        logger.info("[Env] DEBUG_LOG         : %s", self.debug_log)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the global Settings singleton (cached after first call)."""
    return Settings()
