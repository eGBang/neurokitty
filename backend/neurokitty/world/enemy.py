"""
Enemy — hostile entities that patrol the world and chase the cat.

Six enemy types roam the map on pre-computed patrol routes.  When the cat
enters their detection radius (80 px) they switch to CHASE state and
pursue at a slightly lower speed.  After losing the cat they RETURN to
their nearest patrol waypoint and resume.
"""

from __future__ import annotations

import math
from enum import Enum, auto
from typing import Any

import numpy as np

from neurokitty import config as cfg


class EnemyState(Enum):
    PATROL = auto()
    CHASE = auto()
    RETURN = auto()


class SpriteType(Enum):
    SLIME = "slime"
    SKELETON = "skeleton"
    BAT = "bat"
    GOBLIN = "goblin"
    SPIDER = "spider"
    GHOST = "ghost"


_SPRITE_ORDER = list(SpriteType)


class Enemy:
    """
    A single hostile entity with a patrol-chase-return state machine.
    """

    def __init__(
        self,
        sprite: SpriteType,
        waypoints: list[tuple[float, float]],
        detection_radius: float = cfg.ENEMY_DETECTION_RADIUS,
    ) -> None:
        self.sprite = sprite
        self.waypoints = waypoints
        self.detection_radius = detection_radius

        # Start at first waypoint
        self.x: float = waypoints[0][0]
        self.y: float = waypoints[0][1]
        self._wp_index: int = 0

        self.state = EnemyState.PATROL
        self._return_target: tuple[float, float] | None = None
        self._hitbox_r: float = 7.0

    # ------------------------------------------------------------------
    # AI update
    # ------------------------------------------------------------------

    def update(self, cat_x: float, cat_y: float, dt: float) -> None:
        dist_to_cat = math.hypot(cat_x - self.x, cat_y - self.y)

        if self.state == EnemyState.PATROL:
            if dist_to_cat < self.detection_radius:
                self.state = EnemyState.CHASE
            else:
                self._patrol(dt)

        elif self.state == EnemyState.CHASE:
            if dist_to_cat > self.detection_radius * 2.0:
                # Lost the cat — return to nearest waypoint
                self.state = EnemyState.RETURN
                self._return_target = self._nearest_waypoint()
            else:
                self._chase(cat_x, cat_y, dt)

        elif self.state == EnemyState.RETURN:
            if dist_to_cat < self.detection_radius:
                self.state = EnemyState.CHASE
            elif self._return_target is not None:
                arrived = self._move_toward(
                    self._return_target[0],
                    self._return_target[1],
                    cfg.ENEMY_PATROL_SPEED,
                    dt,
                )
                if arrived:
                    self.state = EnemyState.PATROL
                    # Snap to nearest waypoint index
                    self._wp_index = self._nearest_waypoint_index()
                    self._return_target = None

    # ------------------------------------------------------------------
    # Movement helpers
    # ------------------------------------------------------------------

    def _patrol(self, dt: float) -> None:
        tx, ty = self.waypoints[self._wp_index]
        arrived = self._move_toward(tx, ty, cfg.ENEMY_PATROL_SPEED, dt)
        if arrived:
            self._wp_index = (self._wp_index + 1) % len(self.waypoints)

    def _chase(self, cat_x: float, cat_y: float, dt: float) -> None:
        self._move_toward(cat_x, cat_y, cfg.ENEMY_CHASE_SPEED, dt)

    def _move_toward(
        self, tx: float, ty: float, speed: float, dt: float
    ) -> bool:
        """Move toward target; return True if arrived."""
        dx = tx - self.x
        dy = ty - self.y
        dist = math.hypot(dx, dy)
        if dist < 2.0:
            self.x, self.y = tx, ty
            return True
        step = speed * dt
        if step >= dist:
            self.x, self.y = tx, ty
            return True
        self.x += (dx / dist) * step
        self.y += (dy / dist) * step
        return False

    def _nearest_waypoint(self) -> tuple[float, float]:
        best = self.waypoints[0]
        best_dist = math.hypot(best[0] - self.x, best[1] - self.y)
        for wp in self.waypoints[1:]:
            d = math.hypot(wp[0] - self.x, wp[1] - self.y)
            if d < best_dist:
                best, best_dist = wp, d
        return best

    def _nearest_waypoint_index(self) -> int:
        dists = [math.hypot(wp[0] - self.x, wp[1] - self.y) for wp in self.waypoints]
        return int(np.argmin(dists))

    # ------------------------------------------------------------------
    # Collision
    # ------------------------------------------------------------------

    def touches_cat(self, cat_x: float, cat_y: float, cat_r: float) -> bool:
        dist = math.hypot(cat_x - self.x, cat_y - self.y)
        return dist < (self._hitbox_r + cat_r)

    # ------------------------------------------------------------------
    # Serialisation
    # ------------------------------------------------------------------

    def get_state(self) -> dict[str, Any]:
        return {
            "x": round(self.x, 1),
            "y": round(self.y, 1),
            "sprite": self.sprite.value,
            "state": self.state.name,
        }


class EnemyManager:
    """
    Creates and manages all 6 enemies with procedural patrol routes.
    """

    def __init__(self, rng: np.random.Generator | None = None) -> None:
        self._rng = rng or np.random.default_rng()
        self.enemies: list[Enemy] = []
        self._spawn_enemies()

    def _spawn_enemies(self) -> None:
        """Place 6 enemies with random patrol loops in the world."""
        rng = self._rng
        margin = 120.0  # stay away from edges

        for i in range(cfg.NUM_ENEMIES):
            sprite = _SPRITE_ORDER[i % len(_SPRITE_ORDER)]

            # Generate a patrol loop of 3-6 waypoints
            n_wp = rng.integers(3, 7)
            # Cluster waypoints in a region
            base_x = rng.uniform(margin, cfg.WORLD_WIDTH - margin)
            base_y = rng.uniform(margin, cfg.WORLD_HEIGHT - margin)
            waypoints: list[tuple[float, float]] = []
            for _ in range(n_wp):
                wx = float(np.clip(
                    base_x + rng.normal(0, 80),
                    margin, cfg.WORLD_WIDTH - margin,
                ))
                wy = float(np.clip(
                    base_y + rng.normal(0, 60),
                    margin, cfg.WORLD_HEIGHT - margin,
                ))
                waypoints.append((wx, wy))

            self.enemies.append(Enemy(sprite=sprite, waypoints=waypoints))

    def update(self, cat_x: float, cat_y: float, dt: float) -> None:
        """Advance all enemies."""
        for enemy in self.enemies:
            enemy.update(cat_x, cat_y, dt)

    def check_cat_collision(
        self, cat_x: float, cat_y: float, cat_r: float
    ) -> list[Enemy]:
        """Return list of enemies currently touching the cat."""
        return [e for e in self.enemies if e.touches_cat(cat_x, cat_y, cat_r)]

    def get_positions(self) -> list[tuple[float, float]]:
        """Quick accessor for raycaster."""
        return [(e.x, e.y) for e in self.enemies]

    def get_states(self) -> list[dict[str, Any]]:
        return [e.get_state() for e in self.enemies]
