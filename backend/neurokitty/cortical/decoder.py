"""
MotorDecoder — converts spike data into motor commands using population
vector coding.

The 64 channels are split into 8 direction-tuned populations of 8 channels
each (matching the raycast directions).  Each population "votes" for
movement in its preferred direction proportional to its firing activity.
The final motor command is the vector sum of all population votes.

This mirrors how motor cortex population vectors are decoded in
brain-machine interface research (Georgopoulos et al., 1986).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from neurokitty import config as cfg


@dataclass(frozen=True, slots=True)
class MotorCommand:
    """Decoded velocity vector for the cat."""
    dx: float   # pixels per second
    dy: float   # pixels per second

    @property
    def speed(self) -> float:
        return math.hypot(self.dx, self.dy)

    @property
    def angle_rad(self) -> float:
        return math.atan2(self.dy, self.dx)


# Preferred direction unit vectors for 8 populations.
# Order: N, NE, E, SE, S, SW, W, NW
_DIRECTION_ANGLES = [
    -math.pi / 2,       # N  (up in screen coords, negative y)
    -math.pi / 4,       # NE
    0.0,                 # E
    math.pi / 4,         # SE
    math.pi / 2,         # S
    3 * math.pi / 4,     # SW
    math.pi,             # W
    -3 * math.pi / 4,    # NW
]

_PREFERRED_DIRS: NDArray[np.float64] = np.array(
    [[math.cos(a), math.sin(a)] for a in _DIRECTION_ANGLES],
    dtype=np.float64,
)  # shape (8, 2)


class MotorDecoder:
    """
    Decode spike patterns into a 2D velocity vector.

    The decoder maintains a short-term velocity buffer for temporal
    smoothing (exponential moving average) to give the cat inertia
    and prevent jittery frame-to-frame motion.
    """

    def __init__(
        self,
        max_speed: float = cfg.CAT_BASE_SPEED,
        smoothing: float = 0.35,
    ) -> None:
        self._max_speed = max_speed
        self._smoothing = smoothing  # EMA alpha

        # Population index slices (same layout as encoder)
        self._pop_slices = [
            slice(i * 8, (i + 1) * 8) for i in range(cfg.NUM_RAYCASTS)
        ]

        # Smoothed velocity state
        self._vx: float = 0.0
        self._vy: float = 0.0

    def decode(
        self,
        spikes: NDArray[np.bool_],
        firing_rates: NDArray[np.float64] | None = None,
    ) -> MotorCommand:
        """
        Parameters
        ----------
        spikes : (64,) bool array from the current tick.
        firing_rates : (64,) optional smoothed rates (Hz).  If provided,
            population vote weights use rates rather than binary spikes
            for a more graded response.

        Returns
        -------
        MotorCommand with dx, dy in pixels/second.
        """
        # Compute population activation (scalar per direction)
        activations = np.zeros(cfg.NUM_RAYCASTS, dtype=np.float64)

        for i, slc in enumerate(self._pop_slices):
            if firing_rates is not None:
                # Weighted by smoothed firing rates
                pop_rates = firing_rates[slc]
                activations[i] = float(np.mean(pop_rates))
            else:
                # Binary: fraction of channels active
                activations[i] = float(np.mean(spikes[slc].astype(np.float64)))

        # Subtract baseline so only *differential* activity produces motion.
        # This prevents tonic firing from causing constant drift.
        baseline = float(np.median(activations))
        activations = np.maximum(activations - baseline, 0.0)

        # Population vector: weighted sum of preferred directions
        raw_vec = _PREFERRED_DIRS.T @ activations  # shape (2,)
        raw_dx, raw_dy = float(raw_vec[0]), float(raw_vec[1])

        # Scale so that maximum possible activation maps to max_speed
        scale = self._max_speed / (cfg.NUM_RAYCASTS * 0.5 + 1e-9)
        raw_dx *= scale
        raw_dy *= scale

        # Temporal smoothing (EMA)
        a = self._smoothing
        self._vx = a * raw_dx + (1.0 - a) * self._vx
        self._vy = a * raw_dy + (1.0 - a) * self._vy

        # Speed cap
        dx, dy = self._normalize_output(self._vx, self._vy)

        return MotorCommand(dx=dx, dy=dy)

    def _normalize_output(self, dx: float, dy: float) -> tuple[float, float]:
        """Clamp to max speed while preserving direction."""
        speed = math.hypot(dx, dy)
        if speed > self._max_speed:
            factor = self._max_speed / speed
            dx *= factor
            dy *= factor
        return dx, dy

    def reset(self) -> None:
        """Clear velocity memory."""
        self._vx = 0.0
        self._vy = 0.0

    def get_state(self) -> dict:
        """Serialisable decoder state for the dashboard."""
        return {
            "smoothed_vx": round(self._vx, 2),
            "smoothed_vy": round(self._vy, 2),
            "speed": round(math.hypot(self._vx, self._vy), 2),
            "angle_deg": round(math.degrees(math.atan2(self._vy, self._vx)), 1),
        }
