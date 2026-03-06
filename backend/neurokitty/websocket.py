"""
WebSocket connection manager for Neurokitty.

Streams two logical channels to connected clients at 10 Hz:
  * **game**   — cat position, enemies, berries, score, raycasts
  * **neural** — firing rates, spike raster, culture health, motor vector

Clients subscribe by connecting to ``/ws``.  All messages are JSON with a
``topic`` field so the frontend can demux.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

from neurokitty import config as cfg

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Track active WebSocket connections and broadcast state to all of them.
    """

    def __init__(self) -> None:
        self._active: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._active.append(ws)
        logger.info(
            "WebSocket client connected (%d total)", len(self._active)
        )

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self._active:
            self._active.remove(ws)
        logger.info(
            "WebSocket client disconnected (%d remaining)", len(self._active)
        )

    @property
    def client_count(self) -> int:
        return len(self._active)

    # ------------------------------------------------------------------
    # Broadcasting
    # ------------------------------------------------------------------

    async def broadcast_json(self, data: dict[str, Any]) -> None:
        """Send a JSON payload to every connected client."""
        if not self._active:
            return
        text = json.dumps(data, separators=(",", ":"))  # compact
        stale: list[WebSocket] = []
        for ws in self._active:
            try:
                await ws.send_text(text)
            except Exception:
                stale.append(ws)
        for ws in stale:
            self.disconnect(ws)

    async def broadcast_tick(
        self,
        game_state: dict[str, Any],
        neural_state: dict[str, Any],
    ) -> None:
        """
        Send both game and neural state as separate messages (different
        topics) so the frontend can route them independently.
        """
        if not self._active:
            return

        game_msg = {
            "topic": cfg.WS_GAME_STATE_TOPIC,
            "data": game_state,
        }
        neural_msg = {
            "topic": cfg.WS_NEURAL_TOPIC,
            "data": neural_state,
        }

        # Serialise once, send to all
        game_text = json.dumps(game_msg, separators=(",", ":"))
        neural_text = json.dumps(neural_msg, separators=(",", ":"))

        stale: list[WebSocket] = []
        for ws in self._active:
            try:
                await ws.send_text(game_text)
                await ws.send_text(neural_text)
            except Exception:
                stale.append(ws)
        for ws in stale:
            self.disconnect(ws)

    # ------------------------------------------------------------------
    # Receive loop (per-client)
    # ------------------------------------------------------------------

    async def receive_loop(self, ws: WebSocket) -> None:
        """
        Listen for messages from a single client.  Currently we accept:
          * ``{"action": "ping"}`` — responds with pong
          * ``{"action": "reset"}`` — handled upstream

        The loop runs until the client disconnects.
        """
        try:
            while True:
                raw = await ws.receive_text()
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                action = msg.get("action")
                if action == "ping":
                    await ws.send_text(
                        json.dumps({"topic": "pong", "data": {}})
                    )
        except WebSocketDisconnect:
            self.disconnect(ws)
