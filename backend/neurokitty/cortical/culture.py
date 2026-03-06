"""
NeuralCulture — high-level model of the living cortical culture.

Wraps the MEA and adds the emergent dynamics that define behaviour:
  * Spontaneous population bursts (~20 channels co-fire)
  * Slow oscillation envelope (10-30 s period)
  * Per-channel adaptation / habituation
  * Reward / punishment signalling
  * Firing-rate tracking with exponential moving average
"""

from __future__ import annotations

import math
import time
from typing import Any

import numpy as np
from numpy.typing import NDArray

from neurokitty import config as cfg
from neurokitty.cortical.mea import MultielectrodeArray
from neurokitty.cortical.spike_buffer import SpikeBuffer


class NeuralCulture:
    """
    Top-level interface to the simulated biological neural culture.

    Lifecycle
    ---------
    1. Instantiate once at server start.
    2. Each tick call ``step(stim_voltages, dt)`` which stimulates, records,
       and applies culture dynamics.
    3. Read out results via ``last_spikes``, ``firing_rates``, etc.
    """

    def __init__(self, rng: np.random.Generator | None = None) -> None:
        self._rng = rng or np.random.default_rng()
        self.mea = MultielectrodeArray(rng=self._rng)
        self.spike_buffer = SpikeBuffer(
            n_channels=cfg.MEA_CHANNELS,
            window_sec=cfg.SPIKE_BUFFER_SECONDS,
            tick_dt=cfg.TICK_MS / 1000.0,
        )

        # Firing-rate EMA per channel
        self._firing_rates = np.full(cfg.MEA_CHANNELS, 5.0, dtype=np.float64)

        # Slow oscillation state
        self._oscillation_phase: float = self._rng.uniform(0.0, 2.0 * math.pi)
        self._oscillation_period: float = self._rng.uniform(
            *cfg.OSCILLATION_PERIOD_RANGE
        )

        # Burst state
        self._burst_cooldown: float = 0.0  # seconds until next burst eligible
        self._last_burst_channels: NDArray[np.bool_] | None = None

        # Book-keeping
        self._tick: int = 0
        self._last_spikes: NDArray[np.bool_] = np.zeros(
            cfg.MEA_CHANNELS, dtype=np.bool_
        )
        self._start_time: float = time.monotonic()
        self._total_spikes: int = 0

    # ------------------------------------------------------------------
    # Main step
    # ------------------------------------------------------------------

    def step(
        self,
        stim_voltages: NDArray[np.float64],
        dt: float = cfg.TICK_MS / 1000.0,
    ) -> NDArray[np.bool_]:
        """
        Advance the culture by one tick.

        Parameters
        ----------
        stim_voltages : (64,) micro-volt stimulation vector.
        dt : time-step in seconds (default 0.1 s).

        Returns
        -------
        spikes : (64,) boolean array of spike detections.
        """
        # 1. Apply slow oscillation modulation to the stimulation
        osc_gain = self._oscillation_gain()
        modulated_stim = stim_voltages * osc_gain

        # 2. Stimulate the MEA
        self.mea.stimulate(modulated_stim)

        # 3. Record spikes
        spikes = self.mea.record(dt)

        # 4. Inject spontaneous burst if due
        burst_spikes = self._maybe_burst(dt)
        spikes = spikes | burst_spikes

        # 5. Update adaptation
        self.mea.update_adaptation(dt)

        # 6. Update firing-rate EMA
        instantaneous = spikes.astype(np.float64) / dt  # Hz approximation
        alpha = cfg.FIRING_RATE_EMA_ALPHA
        self._firing_rates = (
            alpha * instantaneous + (1.0 - alpha) * self._firing_rates
        )

        # 7. Advance oscillation phase
        self._oscillation_phase += (2.0 * math.pi * dt) / self._oscillation_period
        if self._oscillation_phase > 2.0 * math.pi:
            self._oscillation_phase -= 2.0 * math.pi
            # Pick a new period each cycle for biological variability
            self._oscillation_period = self._rng.uniform(
                *cfg.OSCILLATION_PERIOD_RANGE
            )

        # 8. Store results
        self._last_spikes = spikes
        self._tick += 1
        self._total_spikes += int(spikes.sum())
        self.spike_buffer.push(self._tick, spikes)

        return spikes

    # ------------------------------------------------------------------
    # Reward / punishment
    # ------------------------------------------------------------------

    def reward(self, magnitude: float = cfg.REWARD_SIGNAL_UV) -> None:
        """
        Inject a reward signal — broad, low-amplitude excitatory pulse
        across all channels, mimicking dopaminergic modulation.
        """
        signal = np.full(cfg.MEA_CHANNELS, abs(magnitude), dtype=np.float64)
        # Slight spatial gradient to keep it non-uniform
        gradient = np.linspace(0.7, 1.0, cfg.MEA_CHANNELS)
        self._rng.shuffle(gradient)
        self.mea.stimulate(signal * gradient)

    def punish(self, magnitude: float = cfg.PUNISHMENT_SIGNAL_UV) -> None:
        """
        Inject a punishment signal — sharp negative pulse to a subset of
        channels, analogous to aversive thalamic input.
        """
        signal = np.zeros(cfg.MEA_CHANNELS, dtype=np.float64)
        # Punish ~half the channels with negative voltage
        punished = self._rng.choice(
            cfg.MEA_CHANNELS,
            size=cfg.MEA_CHANNELS // 2,
            replace=False,
        )
        signal[punished] = -abs(magnitude)
        self.mea.stimulate(signal)

    # ------------------------------------------------------------------
    # Spontaneous bursts
    # ------------------------------------------------------------------

    def _maybe_burst(self, dt: float) -> NDArray[np.bool_]:
        """
        Generate a population burst with probability governed by a
        Poisson process at ``BURST_RATE_HZ``.

        A burst co-activates ~20 channels simultaneously — a hallmark
        of cortical cultures in vitro.
        """
        burst_spikes = np.zeros(cfg.MEA_CHANNELS, dtype=np.bool_)
        self._burst_cooldown -= dt

        if self._burst_cooldown <= 0.0:
            # Decide whether a burst happens this tick
            p_burst = 1.0 - math.exp(-cfg.BURST_RATE_HZ * dt)
            if self._rng.random() < p_burst:
                # Select burst channels (favour spatially contiguous clusters)
                centre = self._rng.integers(0, cfg.MEA_CHANNELS)
                candidates = np.arange(cfg.MEA_CHANNELS)
                # Distance from centre on the 8x8 grid (Manhattan)
                cr, cc = divmod(centre, cfg.MEA_COLS)
                rows = candidates // cfg.MEA_COLS
                cols = candidates % cfg.MEA_COLS
                dists = np.abs(rows - cr) + np.abs(cols - cc)
                # Probability of inclusion decays with distance
                probs = np.exp(-dists / 2.5)
                probs /= probs.sum()
                n_active = min(
                    cfg.BURST_CHANNEL_COUNT,
                    cfg.MEA_CHANNELS,
                )
                chosen = self._rng.choice(
                    candidates,
                    size=n_active,
                    replace=False,
                    p=probs,
                )
                burst_spikes[chosen] = True
                self._last_burst_channels = burst_spikes.copy()
                # Refractory period after burst
                self._burst_cooldown = self._rng.exponential(1.0 / cfg.BURST_RATE_HZ)

        return burst_spikes

    # ------------------------------------------------------------------
    # Slow oscillation
    # ------------------------------------------------------------------

    def _oscillation_gain(self) -> float:
        """
        Multiplicative gain factor derived from the slow oscillation.
        Ranges roughly [0.4, 1.2] — mimics UP/DOWN state modulation
        seen in cortical cultures.
        """
        return 0.8 + 0.4 * math.sin(self._oscillation_phase)

    # ------------------------------------------------------------------
    # Accessors
    # ------------------------------------------------------------------

    @property
    def last_spikes(self) -> NDArray[np.bool_]:
        return self._last_spikes

    @property
    def firing_rates(self) -> NDArray[np.float64]:
        return self._firing_rates.copy()

    @property
    def tick(self) -> int:
        return self._tick

    def get_spike_raster(self, last_n_seconds: float = 5.0) -> list[list[bool]]:
        """
        Return recent spike raster as a list of ticks, each a list of
        bools per channel.  Suitable for JSON serialisation.
        """
        return self.spike_buffer.get_raster(last_n_seconds)

    def get_culture_health(self) -> dict[str, Any]:
        """Dashboard-friendly culture health summary."""
        rates = self._firing_rates
        mean_rate = float(np.mean(rates))
        # Burst index: fraction of spikes that occur in bursts
        recent = self.spike_buffer.get_raster(2.0)
        if recent:
            spikes_per_tick = [sum(row) for row in recent]
            burst_ticks = sum(
                1 for s in spikes_per_tick if s >= cfg.BURST_CHANNEL_COUNT * 0.6
            )
            burst_index = burst_ticks / len(recent)
        else:
            burst_index = 0.0

        # Mean adaptation across electrodes
        states = self.mea.get_electrode_states()
        adaptation_level = float(np.mean([s["adaptation"] for s in states]))

        return {
            "viability": self.mea.culture_health,
            "mean_firing_rate": round(mean_rate, 2),
            "burst_index": round(burst_index, 3),
            "adaptation_level": round(adaptation_level, 3),
            "oscillation_phase": round(self._oscillation_phase, 3),
            "oscillation_period": round(self._oscillation_period, 2),
            "total_spikes": self._total_spikes,
            "ticks_elapsed": self._tick,
        }

    # ------------------------------------------------------------------
    # Reset
    # ------------------------------------------------------------------

    def reset(self) -> None:
        """Reset culture to fresh state."""
        self.mea.reset()
        self._firing_rates = np.full(cfg.MEA_CHANNELS, 5.0, dtype=np.float64)
        self._oscillation_phase = self._rng.uniform(0.0, 2.0 * math.pi)
        self._oscillation_period = self._rng.uniform(
            *cfg.OSCILLATION_PERIOD_RANGE
        )
        self._burst_cooldown = 0.0
        self._last_burst_channels = None
        self._tick = 0
        self._total_spikes = 0
        self._last_spikes = np.zeros(cfg.MEA_CHANNELS, dtype=np.bool_)
        self.spike_buffer.clear()
