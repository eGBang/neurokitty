"""
BerryManager — spawns and tracks collectible berries in the world.

Berries appear at BERRY_BUSH tiles.  A maximum of 24 can exist at once;
collected berries respawn after a cooldown.  Different berry types give
different reward values to create foraging incentives.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import numpy as np

from neurokitty import config as cfg
from neurokitty.world.tilemap import TileMap, TileType


class BerryType(Enum):
    RED = "red"
    BLUE = "blue"
    GOLD = "gold"


_BERRY_VALUES: dict[BerryType, float] = {
    BerryType.RED: cfg.BERRY_ENERGY_RESTORE,
    BerryType.BLUE: cfg.BERRY_ENERGY_RESTORE * 0.7,
    BerryType.GOLD: cfg.BERRY_ENERGY_RESTORE * 1.8,
}

_BERRY_SCORES: dict[BerryType, int] = {
    BerryType.RED: 10,
    BerryType.BLUE: 5,
    BerryType.GOLD: 25,
}

_BERRY_WEIGHTS: list[float] = [0.50, 0.35, 0.15]  # red, blue, gold


@dataclass
class Berry:
    x: float
    y: float
    berry_type: BerryType
    active: bool = True
    respawn_at: float = 0.0  # monotonic time when this slot can respawn


class BerryManager:
    """
    Manages berry lifecycle: initial placement, collection, respawn.
    """

    def __init__(
        self,
        tilemap: TileMap,
        rng: np.random.Generator | None = None,
    ) -> None:
        self._rng = rng or np.random.default_rng()
        self._tilemap = tilemap
        self._berries: list[Berry] = []
        self._bush_positions: list[tuple[float, float]] = tilemap.find_tiles(
            TileType.BERRY_BUSH
        )
        self._spawn_initial()

    # ------------------------------------------------------------------
    # Spawning
    # ------------------------------------------------------------------

    def _spawn_initial(self) -> None:
        """Place up to MAX_BERRIES at random bush locations."""
        if not self._bush_positions:
            return
        n = min(cfg.MAX_BERRIES, len(self._bush_positions))
        indices = self._rng.choice(
            len(self._bush_positions), size=n, replace=False
        )
        for idx in indices:
            px, py = self._bush_positions[idx]
            btype = self._rng.choice(
                list(BerryType), p=_BERRY_WEIGHTS
            )
            self._berries.append(Berry(x=px, y=py, berry_type=btype))

    def _try_respawn(self) -> None:
        """Fill inactive slots whose cooldown has elapsed."""
        now = time.monotonic()
        for berry in self._berries:
            if not berry.active and now >= berry.respawn_at:
                # Pick a new bush location
                if self._bush_positions:
                    px, py = self._bush_positions[
                        self._rng.integers(0, len(self._bush_positions))
                    ]
                    berry.x = px
                    berry.y = py
                    berry.berry_type = self._rng.choice(
                        list(BerryType), p=_BERRY_WEIGHTS
                    )
                    berry.active = True

    # ------------------------------------------------------------------
    # Collection
    # ------------------------------------------------------------------

    def collect(
        self, x: float, y: float, radius: float = cfg.BERRY_COLLECT_RADIUS
    ) -> tuple[bool, float, int]:
        """
        Try to collect a berry near (x, y).

        Returns
        -------
        (collected, energy_value, score_value)
        """
        for berry in self._berries:
            if not berry.active:
                continue
            dist = math.hypot(berry.x - x, berry.y - y)
            if dist <= radius:
                berry.active = False
                berry.respawn_at = time.monotonic() + cfg.BERRY_RESPAWN_SEC
                value = _BERRY_VALUES[berry.berry_type]
                score = _BERRY_SCORES[berry.berry_type]
                return True, value, score
        return False, 0.0, 0

    # ------------------------------------------------------------------
    # Update (call each tick)
    # ------------------------------------------------------------------

    def update(self) -> None:
        """Handle respawns."""
        self._try_respawn()

    # ------------------------------------------------------------------
    # Accessors
    # ------------------------------------------------------------------

    def active_positions(self) -> list[tuple[float, float]]:
        """Quick list of (x, y) for active berries — used by raycaster."""
        return [(b.x, b.y) for b in self._berries if b.active]

    @property
    def active_count(self) -> int:
        return sum(1 for b in self._berries if b.active)

    def get_states(self) -> list[dict[str, Any]]:
        return [
            {
                "x": round(b.x, 1),
                "y": round(b.y, 1),
                "type": b.berry_type.value,
                "active": b.active,
            }
            for b in self._berries
        ]
