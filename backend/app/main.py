"""
main.py — FastAPI application entry point for AntiGravity backend.

Boot sequence:
  1. Uvicorn binds the port immediately (Render health check passes right away).
  2. FastAPI `lifespan` handler fires AFTER the server is up:
       a. Initialises SmartAPIClient
       b. Starts startup_init() task (scrip master + login)
       c. Starts periodic refresh tasks
  3. On shutdown, background tasks are cancelled cleanly.
"""
from __future__ import annotations

import asyncio
import logging
import sys
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.background.scheduler import start_background_tasks, startup_init
from app.config import get_settings
from app.routes import auth, debug, instruments, equity, scanner
from app.smartapi import init_client

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


# ── Lifespan (replaces @app.on_event) ────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # ── Startup ───────────────────────────────────────────────────────────────
    settings = get_settings()
    settings.log_safe_summary()

    # Initialise the SmartAPI client singleton
    init_client(settings)

    # Run scrip master load + first login in the background so the server
    # starts responding IMMEDIATELY (required for Render health checks).
    asyncio.create_task(startup_init(), name="startup-init")

    # Periodic refresh tasks
    bg_tasks = start_background_tasks()

    logger.info("🚀 AntiGravity Backend (Python/FastAPI) started on port %d", settings.port)

    yield  # ← server is live here

    # ── Shutdown ──────────────────────────────────────────────────────────────
    logger.info("[Server] Shutting down background tasks...")
    for task in bg_tasks:
        task.cancel()
    await asyncio.gather(*bg_tasks, return_exceptions=True)
    logger.info("[Server] Shutdown complete.")


# ── App factory ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="AntiGravity Options Scanner",
    description="Angel One SmartAPI proxy — Python/FastAPI backend",
    version="2.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(debug.router)          # GET /  and  GET /api/health  etc.
app.include_router(auth.router)           # GET|POST /api/auth/*
app.include_router(instruments.router)    # POST /api/instruments/*
app.include_router(equity.router)         # GET /api/equity/*
app.include_router(scanner.router)        # GET /api/scanner/*


# ── Global exception handler ──────────────────────────────────────────────────

@app.exception_handler(Exception)
async def generic_exception_handler(request, exc: Exception):
    logger.error("[UnhandledException] %s", exc, exc_info=True)
    return JSONResponse(status_code=500, content={"error": str(exc)})
