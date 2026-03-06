"""
SensoryEncoder — converts world observations into MEA stimulation patterns.

Eight raycasts sample the environment around the cat.  Each raycast returns
a distance (0-120 px) and an object type.  The encoder maps these into a
64-channel voltage vector that is delivered to the culture as electrical
stimulation.

Encoding scheme
---------------
* Channels are divided into 8 **populations** of 8 channels each, one
  population per ray direction (N, NE, E, SE, S, SW, W, NW).
* Within each population the *amplitude* encodes proximity (closer objects
  produce stronger stimulation) and the *phase pattern* encodes object type:
    - WALL  : all 8 channels in phase (synchronous volley)
    - ENEMY : alternating high/low (checkerboard)
    - BERRY : ramp pattern (channels 0-7 increasing)
    - WATER : sinusoidal profile
    - NONE  : baseline noise only
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum

import numpy as np
from numpy.typing import NDArray

from neurokitty import config as cfg


class HitType(IntEnum):
    NONE = 0
    WALL = 1
    ENEMY = 2
    BERRY = 3
    WATER = 4


@dataclass(frozen=True, slots=True)
class RayResult:
    """Result of a single raycast."""
    distance: float       # 0.0 (touching) to RAY_LENGTH (nothing hit)
    hit_type: HitType


# Pre-computed phase templates (8 channels each), normalised to [0, 1].
_PHASE_TEMPLATES: dict[HitType, NDArray[np.float64]] = {
    HitType.NONE: np.zeros(8, dtype=np.float64),
    HitType.WALL: np.ones(8, dtype=np.float64),
    HitType.ENEMY: np.array([1, 0, 1, 0, 1, 0, 1, 0], dtype=np.float64),
    HitType.BERRY: np.linspace(0.2, 1.0, 8).astype(np.float64),
    HitType.WATER: (0.5 + 0.5 * np.sin(np.linspace(0, 2 * np.pi, 8))).astype(np.float64),
}


class SensoryEncoder:
    """
    Encode 8 ray results into a 64-channel stimulation vector (micro-volts).
    """

    def __init__(self) -> None:
        # Precompute index slices: population i -> channels [i*8 : (i+1)*8]
        self._pop_slices = [
            slice(i * 8, (i + 1) * 8) for i in range(cfg.NUM_RAYCASTS)
        ]

    def encode(self, rays: list[RayResult]) -> NDArray[np.float64]:
        """
        Parameters
        ----------
        rays : list of 8 RayResult, ordered N NE E SE S SW W NW.

        Returns
        -------
        stim : (64,) float64 array of stimulation voltages in micro-volts.
        """
        assert len(rays) == cfg.NUM_RAYCASTS, (
            f"Expected {cfg.NUM_RAYCASTS} rays, got {len(rays)}"
        )

        stim = np.zeros(cfg.MEA_CHANNELS, dtype=np.float64)

        for i, ray in enumerate(rays):
            # Proximity factor: 1.0 when distance=0, 0.0 at RAY_LENGTH
            proximity = max(0.0, 1.0 - ray.distance / cfg.RAY_LENGTH)

            # Base amplitude scales with proximity.
            # Peak stimulation at ~200 uV (sub-maximal, leaving headroom for
            # reward/punishment signals).
            amplitude = proximity * 200.0

            # Phase template for object type
            template = _PHASE_TEMPLATES[ray.hit_type]

            stim[self._pop_slices[i]] = amplitude * template

        return stim

    def encode_reward_overlay(
        self,
        base_stim: NDArray[np.float64],
        reward_uv: float,
    ) -> NDArray[np.float64]:
        """
        Layer a global reward/punishment signal on top of the sensory
        stimulation.  This mimics neuromodulatory tone rather than
        specific sensory input.
        """
        overlay = np.full(cfg.MEA_CHANNELS, reward_uv, dtype=np.float64)
        return np.clip(
            base_stim + overlay,
            -cfg.MAX_STIM_UV,
            cfg.MAX_STIM_UV,
        )
