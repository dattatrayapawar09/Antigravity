"""
routes/auth.py — Auth endpoints: status & manual login.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter

from app.auth import auto_login
from app.config import get_settings
from app.models import AuthStatusResponse, LoginResponse
from app.smartapi import get_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/status", response_model=AuthStatusResponse)
async def auth_status() -> AuthStatusResponse:
    client    = get_client()
    connected = client.is_token_valid()
    settings  = get_settings()
    return AuthStatusResponse(
        connected=connected,
        mode="LIVE" if connected else "MOCK",
        clientId=settings.angel_client_id if connected else None,
    )


@router.post("/login", response_model=LoginResponse)
async def manual_login() -> LoginResponse:
    ok        = await auto_login()
    connected = get_client().is_token_valid()
    return LoginResponse(
        success=ok,
        connected=connected,
        mode="LIVE" if connected else "MOCK",
    )
