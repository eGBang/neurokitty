"""
FastAPI application — HTTP + WebSocket entry-point for Neurokitty.

Endpoints
---------
GET  /api/world          Tilemap data (JSON, ~200 kB).
GET  /api/config         Public configuration constants.
GET  /api/status         Current loop / culture status.
POST /api/culture/reset  Hard-reset culture + world.
POST /api/culture/pause  Pause the neural loop.
POST /api/culture/resume Resume the neural loop.
WS   /ws                 Real-time game + neural telemetry stream.

Run with:
    uvicorn neurokitty.main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from neurokitty import __version__
from neurokitty import config as cfg
from neurokitty.loop import NeuralLoop
from neurokitty.websocket import ConnectionManager

logger = logging.getLogger("neurokitty")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)-20s  %(levelname)-7s  %(message)s",
)

# ---------------------------------------------------------------------------
# Singletons
# ---------------------------------------------------------------------------
loop = NeuralLoop(seed=42)
ws_manager = ConnectionManager()


# ---------------------------------------------------------------------------
# Lifespan (startup / shutdown)
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Start the neural loop on boot; stop it on shutdown."""
    # Wire the broadcast callback
    loop._broadcast_callback = ws_manager.broadcast_tick
    await loop.start()
    logger.info("Neurokitty v%s ready on port %d", __version__, cfg.WS_PORT)
    yield
    await loop.stop()
    logger.info("Neurokitty shut down cleanly")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Neurokitty",
    version=__version__,
    description="Biological neural culture controlling a virtual cat",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cfg.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------

@app.get("/api/world")
async def get_world() -> JSONResponse:
    """Return the full tilemap for frontend rendering."""
    return JSONResponse(content=loop.tilemap.to_dict())


@app.get("/api/config")
async def get_config() -> dict[str, Any]:
    """Return public configuration constants."""
    return {
        "loop_hz": cfg.LOOP_HZ,
        "tick_ms": cfg.TICK_MS,
        "mea_channels": cfg.MEA_CHANNELS,
        "mea_rows": cfg.MEA_ROWS,
        "mea_cols": cfg.MEA_COLS,
        "world_width": cfg.WORLD_WIDTH,
        "world_height": cfg.WORLD_HEIGHT,
        "tile_size": cfg.TILE_SIZE,
        "num_raycasts": cfg.NUM_RAYCASTS,
        "ray_length": cfg.RAY_LENGTH,
        "num_enemies": cfg.NUM_ENEMIES,
        "max_berries": cfg.MAX_BERRIES,
        "cat_base_speed": cfg.CAT_BASE_SPEED,
        "version": __version__,
    }


@app.get("/api/status")
async def get_status() -> dict[str, Any]:
    """Return loop + culture status."""
    status = loop.get_status()
    status["ws_clients"] = ws_manager.client_count
    return status


@app.post("/api/culture/reset")
async def culture_reset() -> dict[str, str]:
    """Hard-reset the culture and world state."""
    loop.reset()
    return {"status": "ok", "message": "Culture and world reset"}


@app.post("/api/culture/pause")
async def culture_pause() -> dict[str, str]:
    """Pause the neural loop (world freezes)."""
    loop.pause()
    return {"status": "ok", "message": "Loop paused"}


@app.post("/api/culture/resume")
async def culture_resume() -> dict[str, str]:
    """Resume the neural loop."""
    loop.resume()
    return {"status": "ok", "message": "Loop resumed"}


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    """
    Accept a WebSocket connection and stream game + neural telemetry.

    The client can also send JSON commands (see ConnectionManager.receive_loop).
    """
    await ws_manager.connect(ws)
    try:
        await ws_manager.receive_loop(ws)
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)
    except Exception:
        logger.exception("WebSocket error")
        ws_manager.disconnect(ws)


# ---------------------------------------------------------------------------
# CLI entry-point
# ---------------------------------------------------------------------------

def run() -> None:
    """Convenience entry-point for ``python -m neurokitty.main``."""
    import uvicorn

    uvicorn.run(
        "neurokitty.main:app",
        host="0.0.0.0",
        port=cfg.WS_PORT,
        log_level="info",
    )


if __name__ == "__main__":
    run()
