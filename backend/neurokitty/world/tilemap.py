"""
TileMap — procedurally generated 2D world for the cat to explore.

The world is 2800 x 1500 pixels, divided into 16 x 16 px tiles
(175 columns x 93 rows, last partial row is padded).

Generation uses noise-based clustering to create a naturalistic layout:
paths winding between clusters of trees, buildings scattered in clearings,
water features, and berry bushes near the edges of tree clusters.
"""

from __future__ import annotations

import math
from enum import IntEnum
from typing import Any

import numpy as np
from numpy.typing import NDArray

from neurokitty import config as cfg


class TileType(IntEnum):
    GRASS = 0
    WATER = 1
    TREE = 2
    ROCK = 3
    BUILDING = 4
    PATH = 5
    BERRY_BUSH = 6


# Which tiles block movement
_SOLID: frozenset[TileType] = frozenset({
    TileType.WATER,
    TileType.TREE,
    TileType.ROCK,
    TileType.BUILDING,
})


class TileMap:
    """
    175 x 94 tile grid backing the 2800 x 1500 px world.

    Attributes
    ----------
    tiles : 2-D uint8 array  (rows, cols) — TileType ordinals.
    """

    def __init__(self, seed: int | None = None) -> None:
        self._rng = np.random.default_rng(seed)
        self.cols = cfg.WORLD_WIDTH // cfg.TILE_SIZE   # 175
        self.rows = math.ceil(cfg.WORLD_HEIGHT / cfg.TILE_SIZE)  # 94
        self.tiles: NDArray[np.uint8] = np.full(
            (self.rows, self.cols), TileType.GRASS, dtype=np.uint8,
        )
        self._generate()

    # ------------------------------------------------------------------
    # Procedural generation
    # ------------------------------------------------------------------

    def _generate(self) -> None:
        rng = self._rng

        # ----- Water bodies (2-3 ponds) -----
        for _ in range(rng.integers(2, 4)):
            cx = rng.integers(10, self.cols - 10)
            cy = rng.integers(10, self.rows - 10)
            rx = rng.integers(4, 9)
            ry = rng.integers(3, 7)
            self._fill_ellipse(cy, cx, ry, rx, TileType.WATER)

        # ----- Paths (3-5 winding trails) -----
        for _ in range(rng.integers(3, 6)):
            self._random_path()

        # ----- Tree clusters (8-14) -----
        for _ in range(rng.integers(8, 15)):
            cx = rng.integers(5, self.cols - 5)
            cy = rng.integers(5, self.rows - 5)
            r = rng.integers(3, 8)
            self._fill_cluster(cy, cx, r, TileType.TREE, density=0.55)

        # ----- Rock outcrops (4-7) -----
        for _ in range(rng.integers(4, 8)):
            cx = rng.integers(3, self.cols - 3)
            cy = rng.integers(3, self.rows - 3)
            r = rng.integers(1, 4)
            self._fill_cluster(cy, cx, r, TileType.ROCK, density=0.6)

        # ----- Buildings (3-6) -----
        for _ in range(rng.integers(3, 7)):
            bx = rng.integers(8, self.cols - 12)
            by = rng.integers(8, self.rows - 10)
            bw = rng.integers(3, 6)
            bh = rng.integers(3, 5)
            self.tiles[by: by + bh, bx: bx + bw] = TileType.BUILDING

        # ----- Berry bushes — placed on grass near trees -----
        tree_mask = self.tiles == TileType.TREE
        # Dilate tree mask by 2 tiles to find "near tree" positions
        from scipy.ndimage import binary_dilation
        near_tree = binary_dilation(tree_mask, iterations=2)
        grass_near_tree = near_tree & (self.tiles == TileType.GRASS)
        candidates = np.argwhere(grass_near_tree)
        if len(candidates) > 0:
            n_bushes = min(len(candidates), rng.integers(18, 40))
            chosen = rng.choice(len(candidates), size=n_bushes, replace=False)
            for idx in chosen:
                r, c = candidates[idx]
                self.tiles[r, c] = TileType.BERRY_BUSH

        # ----- Ensure spawn area is clear (centre-ish) -----
        spawn_r = self.rows // 2
        spawn_c = self.cols // 2
        for dr in range(-3, 4):
            for dc in range(-3, 4):
                r, c = spawn_r + dr, spawn_c + dc
                if 0 <= r < self.rows and 0 <= c < self.cols:
                    self.tiles[r, c] = TileType.GRASS

    def _fill_ellipse(
        self, cy: int, cx: int, ry: int, rx: int, tile: TileType
    ) -> None:
        for r in range(max(0, cy - ry), min(self.rows, cy + ry + 1)):
            for c in range(max(0, cx - rx), min(self.cols, cx + rx + 1)):
                if ((r - cy) / ry) ** 2 + ((c - cx) / rx) ** 2 <= 1.0:
                    self.tiles[r, c] = tile

    def _fill_cluster(
        self, cy: int, cx: int, radius: int, tile: TileType, density: float
    ) -> None:
        for r in range(max(0, cy - radius), min(self.rows, cy + radius + 1)):
            for c in range(max(0, cx - radius), min(self.cols, cx + radius + 1)):
                dist = math.hypot(r - cy, c - cx)
                if dist <= radius and self._rng.random() < density:
                    if self.tiles[r, c] == TileType.GRASS:
                        self.tiles[r, c] = tile

    def _random_path(self) -> None:
        """Drunkard's walk between two random edge points."""
        rng = self._rng
        # Start from a random edge
        if rng.random() < 0.5:
            r, c = rng.integers(0, self.rows), 0 if rng.random() < 0.5 else self.cols - 1
        else:
            r, c = 0 if rng.random() < 0.5 else self.rows - 1, rng.integers(0, self.cols)

        target_r = rng.integers(self.rows // 4, 3 * self.rows // 4)
        target_c = rng.integers(self.cols // 4, 3 * self.cols // 4)

        for _ in range(300):
            if 0 <= r < self.rows and 0 <= c < self.cols:
                self.tiles[r, c] = TileType.PATH
            # Biased random walk toward target
            dr = np.sign(target_r - r) if rng.random() < 0.6 else rng.choice([-1, 0, 1])
            dc = np.sign(target_c - c) if rng.random() < 0.6 else rng.choice([-1, 0, 1])
            r = int(np.clip(r + dr, 0, self.rows - 1))
            c = int(np.clip(c + dc, 0, self.cols - 1))
            if r == target_r and c == target_c:
                break

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def tile_at(self, x: float, y: float) -> TileType:
        """Return the tile type at world pixel coordinates (x, y)."""
        c = int(x) // cfg.TILE_SIZE
        r = int(y) // cfg.TILE_SIZE
        if 0 <= r < self.rows and 0 <= c < self.cols:
            return TileType(self.tiles[r, c])
        return TileType.ROCK  # out-of-bounds = solid

    def collision_at(self, x: float, y: float) -> bool:
        """Return True if the tile at (x, y) is solid / impassable."""
        return self.tile_at(x, y) in _SOLID

    def is_walkable(self, x: float, y: float) -> bool:
        """Inverse of collision_at for readability."""
        return not self.collision_at(x, y)

    def find_tiles(self, tile_type: TileType) -> list[tuple[int, int]]:
        """Return list of (pixel_x, pixel_y) centres for all tiles of a given type."""
        positions = np.argwhere(self.tiles == tile_type)
        half = cfg.TILE_SIZE // 2
        return [
            (int(c) * cfg.TILE_SIZE + half, int(r) * cfg.TILE_SIZE + half)
            for r, c in positions
        ]

    # ------------------------------------------------------------------
    # Serialisation
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        """Serialise for the frontend.  Tiles as a flat list (row-major)."""
        return {
            "cols": self.cols,
            "rows": self.rows,
            "tile_size": cfg.TILE_SIZE,
            "world_width": cfg.WORLD_WIDTH,
            "world_height": cfg.WORLD_HEIGHT,
            "tiles": self.tiles.flatten().tolist(),
            "tile_names": {t.value: t.name for t in TileType},
        }
