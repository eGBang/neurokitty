"""
Raycaster — samples the world around the cat with 8 directional rays.

Each ray steps from the cat's position outward up to 120 px, checking
the tilemap and entity positions to find the nearest obstacle.  The
results feed into the SensoryEncoder for MEA stimulation.
"""

from __future__ import annotations

import math

from neurokitty import config as cfg
from neurokitty.cortical.encoder import HitType, RayResult
from neurokitty.world.tilemap import TileMap, TileType

# The 8 cardinal + intercardinal directions (unit vectors).
# Order: N, NE, E, SE, S, SW, W, NW
_RAY_DIRS: list[tuple[float, float]] = [
    (0.0, -1.0),                                      # N
    (math.sqrt(2) / 2, -math.sqrt(2) / 2),            # NE
    (1.0, 0.0),                                        # E
    (math.sqrt(2) / 2, math.sqrt(2) / 2),             # SE
    (0.0, 1.0),                                        # S
    (-math.sqrt(2) / 2, math.sqrt(2) / 2),            # SW
    (-1.0, 0.0),                                       # W
    (-math.sqrt(2) / 2, -math.sqrt(2) / 2),           # NW
]

# Map tile types to HitType for the encoder
_TILE_HIT_MAP: dict[TileType, HitType] = {
    TileType.TREE: HitType.WALL,
    TileType.ROCK: HitType.WALL,
    TileType.BUILDING: HitType.WALL,
    TileType.WATER: HitType.WATER,
    TileType.BERRY_BUSH: HitType.BERRY,
}


class Raycaster:
    """
    Cast 8 rays from the cat into the world.

    Each ray marches in ``RAY_STEP``-pixel increments up to ``RAY_LENGTH``.
    It checks:
      1. Tilemap solids (walls, water)
      2. Enemy proximity (point-in-radius)
      3. Berry proximity

    The first hit along each ray is reported.
    """

    def __init__(
        self,
        tilemap: TileMap,
        ray_length: float = cfg.RAY_LENGTH,
        ray_step: float = cfg.RAY_STEP,
    ) -> None:
        self._tilemap = tilemap
        self._ray_length = ray_length
        self._ray_step = ray_step

    def cast(
        self,
        origin_x: float,
        origin_y: float,
        enemy_positions: list[tuple[float, float]],
        berry_positions: list[tuple[float, float]],
    ) -> list[RayResult]:
        """
        Cast all 8 rays and return a list of ``RayResult`` in standard
        direction order.
        """
        results: list[RayResult] = []
        for dx, dy in _RAY_DIRS:
            result = self._cast_single(
                origin_x, origin_y, dx, dy,
                enemy_positions, berry_positions,
            )
            results.append(result)
        return results

    def _cast_single(
        self,
        ox: float,
        oy: float,
        dx: float,
        dy: float,
        enemies: list[tuple[float, float]],
        berries: list[tuple[float, float]],
    ) -> RayResult:
        """March a single ray and return the first hit."""
        entity_radius = 10.0  # detection radius for point entities
        t = 0.0
        while t <= self._ray_length:
            px = ox + dx * t
            py = oy + dy * t

            # Check tilemap
            tile = self._tilemap.tile_at(px, py)
            if tile in _TILE_HIT_MAP:
                return RayResult(distance=t, hit_type=_TILE_HIT_MAP[tile])

            # Check enemies
            for ex, ey in enemies:
                if math.hypot(px - ex, py - ey) < entity_radius:
                    return RayResult(distance=t, hit_type=HitType.ENEMY)

            # Check berries
            for bx, by in berries:
                if math.hypot(px - bx, py - by) < entity_radius:
                    return RayResult(distance=t, hit_type=HitType.BERRY)

            t += self._ray_step

        # Nothing hit within range
        return RayResult(distance=self._ray_length, hit_type=HitType.NONE)

    def cast_debug(
        self,
        origin_x: float,
        origin_y: float,
        enemy_positions: list[tuple[float, float]],
        berry_positions: list[tuple[float, float]],
    ) -> list[dict]:
        """
        Cast rays and return detailed data for debug rendering
        (ray endpoints, hit points, etc.).
        """
        results = self.cast(origin_x, origin_y, enemy_positions, berry_positions)
        debug: list[dict] = []
        for i, (result, (dx, dy)) in enumerate(zip(results, _RAY_DIRS)):
            end_x = origin_x + dx * result.distance
            end_y = origin_y + dy * result.distance
            debug.append({
                "index": i,
                "distance": round(result.distance, 1),
                "hit_type": result.hit_type.name,
                "end_x": round(end_x, 1),
                "end_y": round(end_y, 1),
            })
        return debug
