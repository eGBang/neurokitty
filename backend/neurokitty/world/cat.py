"""
Cat — the player entity controlled by the neural culture.

The cat has position, velocity, a facing direction, and an energy bar
that depletes over time (foraging pressure).  Eating berries restores
energy; enemy contact drains health.
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING, Any

from neurokitty import config as cfg

if TYPE_CHECKING:
    from neurokitty.world.tilemap import TileMap


class Cat:
    """
    The virtual cat driven by CL1 spike output.

    All spatial units are pixels; all temporal units are seconds.
    """

    def __init__(
        self,
        x: float | None = None,
        y: float | None = None,
        tilemap: TileMap | None = None,
    ) -> None:
        # Spawn at world centre by default
        self.x: float = x if x is not None else cfg.WORLD_WIDTH / 2.0
        self.y: float = y if y is not None else cfg.WORLD_HEIGHT / 2.0
        self.vx: float = 0.0
        self.vy: float = 0.0
        self.facing: float = 0.0  # radians, 0 = east

        self.energy: float = cfg.CAT_MAX_ENERGY
        self.alive: bool = True
        self.score: int = 0
        self.berries_eaten: int = 0

        self._tilemap = tilemap
        self._hitbox_r = cfg.CAT_HITBOX_RADIUS
        self._invuln_timer: float = 0.0  # seconds of remaining i-frames

    # ------------------------------------------------------------------
    # Movement
    # ------------------------------------------------------------------

    def update(self, dx: float, dy: float, dt: float) -> None:
        """
        Apply a motor command (dx, dy in px/s) over time-step *dt*.

        Collision checking is done against the tilemap; the cat slides
        along walls rather than stopping dead.
        """
        if not self.alive:
            return

        self.vx = dx
        self.vy = dy

        # Update facing direction if moving
        speed = math.hypot(dx, dy)
        if speed > 1.0:
            self.facing = math.atan2(dy, dx)

        # Attempt X then Y independently (slide along walls)
        new_x = self.x + dx * dt
        new_y = self.y + dy * dt

        if self._tilemap is not None:
            # Check x movement
            if not self._would_collide(new_x, self.y):
                self.x = new_x
            # Check y movement
            if not self._would_collide(self.x, new_y):
                self.y = new_y
        else:
            self.x = new_x
            self.y = new_y

        # Clamp to world bounds
        margin = self._hitbox_r
        self.x = max(margin, min(cfg.WORLD_WIDTH - margin, self.x))
        self.y = max(margin, min(cfg.WORLD_HEIGHT - margin, self.y))

        # Energy drain
        self.energy -= cfg.CAT_ENERGY_DRAIN * dt
        if self.energy <= 0.0:
            self.energy = 0.0
            self.alive = False

        # Tick invulnerability
        if self._invuln_timer > 0.0:
            self._invuln_timer = max(0.0, self._invuln_timer - dt)

    def _would_collide(self, x: float, y: float) -> bool:
        """Check hitbox corners against the tilemap."""
        if self._tilemap is None:
            return False
        r = self._hitbox_r
        corners = [
            (x - r, y - r),
            (x + r, y - r),
            (x - r, y + r),
            (x + r, y + r),
        ]
        return any(self._tilemap.collision_at(cx, cy) for cx, cy in corners)

    def is_colliding_with_wall(self) -> bool:
        """Check if current position overlaps a solid tile (for punishment)."""
        return self._would_collide(self.x, self.y)

    # ------------------------------------------------------------------
    # Interactions
    # ------------------------------------------------------------------

    def eat_berry(self, value: float = cfg.BERRY_ENERGY_RESTORE) -> None:
        """Consume a berry, restoring energy and adding score."""
        self.energy = min(cfg.CAT_MAX_ENERGY, self.energy + value)
        self.score += 10
        self.berries_eaten += 1

    def take_damage(self, amount: float = 15.0) -> None:
        """Take damage from an enemy if not invulnerable."""
        if self._invuln_timer > 0.0:
            return
        self.energy -= amount
        self._invuln_timer = 1.0  # 1 second of i-frames
        if self.energy <= 0.0:
            self.energy = 0.0
            self.alive = False

    @property
    def is_invulnerable(self) -> bool:
        return self._invuln_timer > 0.0

    # ------------------------------------------------------------------
    # Serialisation
    # ------------------------------------------------------------------

    def get_state(self) -> dict[str, Any]:
        return {
            "x": round(self.x, 1),
            "y": round(self.y, 1),
            "vx": round(self.vx, 1),
            "vy": round(self.vy, 1),
            "facing": round(self.facing, 3),
            "energy": round(self.energy, 1),
            "alive": self.alive,
            "score": self.score,
            "berries_eaten": self.berries_eaten,
            "invulnerable": self.is_invulnerable,
        }

    def reset(self) -> None:
        """Respawn at world centre with full stats."""
        self.x = cfg.WORLD_WIDTH / 2.0
        self.y = cfg.WORLD_HEIGHT / 2.0
        self.vx = 0.0
        self.vy = 0.0
        self.facing = 0.0
        self.energy = cfg.CAT_MAX_ENERGY
        self.alive = True
        self.score = 0
        self.berries_eaten = 0
        self._invuln_timer = 0.0
