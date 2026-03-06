"""
MultielectrodeArray — simulates the Cortical Labs CL1 DishBrain MEA.

The physical device is an 8x8 grid of platinum-black micro-electrodes
(200 um pitch) sitting beneath a layer of ~800 k rodent cortical neurons.
Each electrode can both *stimulate* (inject current) and *record*
(measure extracellular field potentials / spikes).

This module provides a software-faithful stand-in so the rest of the
pipeline can run without hardware.  Spike generation uses inhomogeneous
Poisson processes whose rates are modulated by stimulation history and
culture state.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

import numpy as np
from numpy.typing import NDArray

from neurokitty import config as cfg

if TYPE_CHECKING:
    pass


@dataclass
class ElectrodeState:
    """Per-electrode biophysical bookkeeping."""

    impedance_kohm: float = 150.0       # typical Pt-black impedance at 1 kHz
    noise_rms_uv: float = cfg.NOISE_FLOOR_UV
    baseline_rate_hz: float = 5.0       # spontaneous firing rate
    current_rate_hz: float = 5.0        # rate after stimulation modulation
    last_stim_uv: float = 0.0
    adaptation: float = 0.0             # 0 = none, 1 = fully adapted
    is_healthy: bool = True


class MultielectrodeArray:
    """
    64-channel MEA simulator (8 x 8 grid).

    Public API
    ----------
    stimulate(voltages)   – apply a 64-element stimulation vector (uV).
    record(dt)            – return a (64,) bool array of spike detections
                            for the current time-step.
    culture_health        – aggregate viability metric [0, 1].
    reset()               – re-initialise electrode states.
    """

    def __init__(self, rng: np.random.Generator | None = None) -> None:
        self._rng = rng or np.random.default_rng()
        self._electrodes: list[ElectrodeState] = [
            ElectrodeState(
                impedance_kohm=self._rng.normal(150.0, 20.0),
                baseline_rate_hz=self._rng.uniform(2.0, 12.0),
                noise_rms_uv=self._rng.uniform(5.0, 12.0),
            )
            for _ in range(cfg.MEA_CHANNELS)
        ]
        # Set current rates to baselines initially
        for e in self._electrodes:
            e.current_rate_hz = e.baseline_rate_hz

        self._tick_count: int = 0
        self._creation_time: float = time.monotonic()

    # ------------------------------------------------------------------
    # Stimulation
    # ------------------------------------------------------------------

    def stimulate(self, channel_voltages: NDArray[np.float64]) -> None:
        """
        Apply a stimulation vector to the culture.

        Parameters
        ----------
        channel_voltages : (64,) array of voltages in micro-volts.
            Positive values are excitatory; negative are inhibitory.
        """
        assert channel_voltages.shape == (cfg.MEA_CHANNELS,), (
            f"Expected ({cfg.MEA_CHANNELS},), got {channel_voltages.shape}"
        )
        clamped = np.clip(channel_voltages, -cfg.MAX_STIM_UV, cfg.MAX_STIM_UV)

        for i, elec in enumerate(self._electrodes):
            if not elec.is_healthy:
                continue
            stim = float(clamped[i])
            elec.last_stim_uv = stim

            # Stimulation modulates the instantaneous firing rate.
            # Excitatory stimulation raises rate; inhibitory lowers it.
            gain = 1.0 + (stim / cfg.MAX_STIM_UV) * 3.0  # up to 4x at max stim
            adapted = 1.0 - elec.adaptation * cfg.ADAPTATION_MAX
            elec.current_rate_hz = np.clip(
                elec.baseline_rate_hz * gain * adapted,
                cfg.MIN_FIRING_RATE_HZ,
                cfg.MAX_FIRING_RATE_HZ,
            )

    # ------------------------------------------------------------------
    # Recording
    # ------------------------------------------------------------------

    def record(self, dt: float = cfg.TICK_MS / 1000.0) -> NDArray[np.bool_]:
        """
        Sample spike occurrences over a time-step *dt* seconds.

        Returns a (64,) boolean array — True where at least one spike
        was detected on that channel during the interval.
        """
        self._tick_count += 1
        spikes = np.zeros(cfg.MEA_CHANNELS, dtype=np.bool_)

        for i, elec in enumerate(self._electrodes):
            if not elec.is_healthy:
                continue
            # Number of spikes in this bin ~ Poisson(rate * dt)
            expected = elec.current_rate_hz * dt
            n_spikes = self._rng.poisson(expected)
            if n_spikes > 0:
                # Check that at least one spike exceeds detection threshold
                # Model spike amplitudes as Gaussian with mean ~ 3x noise
                amplitudes = self._rng.normal(
                    -3.0 * elec.noise_rms_uv,
                    elec.noise_rms_uv,
                    size=n_spikes,
                )
                if np.any(amplitudes < cfg.SPIKE_THRESHOLD_UV):
                    spikes[i] = True

        return spikes

    def record_amplitudes(self, dt: float = cfg.TICK_MS / 1000.0) -> NDArray[np.float64]:
        """
        Record raw voltage trace snippets (peak amplitude per channel).

        Returns (64,) float array of peak negative amplitudes in uV.
        Used for raster-plot intensity.
        """
        amplitudes = np.zeros(cfg.MEA_CHANNELS, dtype=np.float64)
        for i, elec in enumerate(self._electrodes):
            if not elec.is_healthy:
                continue
            expected = elec.current_rate_hz * dt
            n_spikes = self._rng.poisson(expected)
            if n_spikes > 0:
                peaks = self._rng.normal(
                    -3.0 * elec.noise_rms_uv,
                    elec.noise_rms_uv,
                    size=n_spikes,
                )
                amplitudes[i] = float(np.min(peaks))  # most negative peak
            else:
                # Just noise
                amplitudes[i] = self._rng.normal(0.0, elec.noise_rms_uv)
        return amplitudes

    # ------------------------------------------------------------------
    # Adaptation update (call once per tick)
    # ------------------------------------------------------------------

    def update_adaptation(self, dt: float = cfg.TICK_MS / 1000.0) -> None:
        """
        Advance adaptation dynamics.  Channels that were recently
        stimulated adapt (rate suppression); channels at rest recover.
        """
        decay = np.exp(-dt / cfg.ADAPTATION_TAU_SEC)
        for elec in self._electrodes:
            if abs(elec.last_stim_uv) > 20.0:
                # Drive adaptation up
                drive = min(abs(elec.last_stim_uv) / cfg.MAX_STIM_UV, 1.0) * 0.12
                elec.adaptation = min(elec.adaptation + drive, 1.0)
            else:
                # Recover toward zero
                elec.adaptation *= decay

    # ------------------------------------------------------------------
    # Health / diagnostics
    # ------------------------------------------------------------------

    @property
    def culture_health(self) -> float:
        """
        Aggregate viability in [0, 1].  1.0 = all electrodes healthy and
        firing within normal range; 0.0 = culture is dead.
        """
        if not self._electrodes:
            return 0.0
        healthy_count = sum(1 for e in self._electrodes if e.is_healthy)
        frac_healthy = healthy_count / len(self._electrodes)

        # Penalise channels that have gone fully silent or are saturating
        rate_scores: list[float] = []
        for e in self._electrodes:
            if not e.is_healthy:
                rate_scores.append(0.0)
                continue
            if e.current_rate_hz < cfg.MIN_FIRING_RATE_HZ:
                rate_scores.append(0.2)
            elif e.current_rate_hz > cfg.MAX_FIRING_RATE_HZ * 0.9:
                rate_scores.append(0.5)
            else:
                rate_scores.append(1.0)
        mean_rate_score = float(np.mean(rate_scores)) if rate_scores else 0.0
        return float(np.clip(frac_healthy * 0.5 + mean_rate_score * 0.5, 0.0, 1.0))

    def get_electrode_states(self) -> list[dict]:
        """Serialise electrode states for the dashboard."""
        return [
            {
                "channel": i,
                "row": i // cfg.MEA_COLS,
                "col": i % cfg.MEA_COLS,
                "impedance_kohm": e.impedance_kohm,
                "noise_rms_uv": e.noise_rms_uv,
                "baseline_rate_hz": e.baseline_rate_hz,
                "current_rate_hz": e.current_rate_hz,
                "adaptation": e.adaptation,
                "is_healthy": e.is_healthy,
            }
            for i, e in enumerate(self._electrodes)
        ]

    # ------------------------------------------------------------------
    # Reset
    # ------------------------------------------------------------------

    def reset(self) -> None:
        """Reinitialise the MEA to fresh-culture defaults."""
        for e in self._electrodes:
            e.current_rate_hz = e.baseline_rate_hz
            e.adaptation = 0.0
            e.last_stim_uv = 0.0
            e.is_healthy = True
        self._tick_count = 0
