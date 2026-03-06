"""
Physics / collision-detection utilities.

All functions are stateless and operate on simple geometric primitives
(rectangles, circles, points).  The game loop calls these to resolve
entity-tile and entity-entity interactions.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Rect:
    """Axis-aligned bounding box."""
    x: float      # left
    y: float      # top
    w: float      # width
    h: float      # height

    @property
    def right(self) -> float:
        return self.x + self.w

    @property
    def bottom(self) -> float:
        return self.y + self.h

    @property
    def cx(self) -> float:
        return self.x + self.w / 2.0

    @property
    def cy(self) -> float:
        return self.y + self.h / 2.0


# ------------------------------------------------------------------
# Overlap tests
# ------------------------------------------------------------------

def aabb_overlap(a: Rect, b: Rect) -> bool:
    """Return True if two axis-aligned rectangles overlap."""
    return (
        a.x < b.right
        and a.right > b.x
        and a.y < b.bottom
        and a.bottom > b.y
    )


def circle_rect(
    cx: float, cy: float, cr: float, rect: Rect
) -> bool:
    """Return True if a circle overlaps an axis-aligned rectangle."""
    # Find the closest point on the rect to the circle centre
    closest_x = max(rect.x, min(cx, rect.right))
    closest_y = max(rect.y, min(cy, rect.bottom))
    dist_sq = (cx - closest_x) ** 2 + (cy - closest_y) ** 2
    return dist_sq < cr * cr


def circle_circle(
    x1: float, y1: float, r1: float,
    x2: float, y2: float, r2: float,
) -> bool:
    """Return True if two circles overlap."""
    dist_sq = (x2 - x1) ** 2 + (y2 - y1) ** 2
    return dist_sq < (r1 + r2) ** 2


def point_in_rect(px: float, py: float, rect: Rect) -> bool:
    """Return True if a point lies inside a rectangle."""
    return rect.x <= px <= rect.right and rect.y <= py <= rect.bottom


# ------------------------------------------------------------------
# Resolution
# ------------------------------------------------------------------

def resolve_collision(
    ax: float, ay: float, ar: float,
    bx: float, by: float, br: float,
) -> tuple[float, float]:
    """
    Compute a displacement vector that pushes entity A out of entity B
    (both modelled as circles).

    Returns (push_x, push_y) to be added to A's position.
    If no overlap, returns (0, 0).
    """
    dx = ax - bx
    dy = ay - by
    dist = math.hypot(dx, dy)
    min_dist = ar + br

    if dist >= min_dist or dist == 0.0:
        return 0.0, 0.0

    # Normalise
    nx = dx / dist
    ny = dy / dist
    penetration = min_dist - dist
    return nx * penetration, ny * penetration


def resolve_circle_rect(
    cx: float, cy: float, cr: float, rect: Rect
) -> tuple[float, float]:
    """
    Push a circle out of a rectangle.  Returns displacement for the circle.
    """
    # Closest point on rect to circle centre
    closest_x = max(rect.x, min(cx, rect.right))
    closest_y = max(rect.y, min(cy, rect.bottom))
    dx = cx - closest_x
    dy = cy - closest_y
    dist = math.hypot(dx, dy)

    if dist >= cr or dist == 0.0:
        # Inside the rect entirely — push out toward nearest edge
        if dist == 0.0:
            # Push upward by default
            return 0.0, -(cr + 1.0)
        return 0.0, 0.0

    nx = dx / dist
    ny = dy / dist
    penetration = cr - dist
    return nx * penetration, ny * penetration
