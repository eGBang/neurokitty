"""
SpikeBuffer — fixed-window circular buffer for spike history.

Stores per-tick, per-channel spike booleans for the most recent N seconds.
Used to generate raster plots and compute windowed firing rates for the
dashboard.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field

import numpy as np
from numpy.typing import NDArray


@dataclass
class _SpikeRecord:
    """One tick's worth of spike data."""
    tick: int
    spikes: NDArray[np.bool_]  # (n_channels,)


class SpikeBuffer:
    """
    Circular buffer that retains the last ``window_sec`` seconds of spike
    data, assuming ticks arrive every ``tick_dt`` seconds.
    """

    def __init__(
        self,
        n_channels: int = 64,
        window_sec: float = 10.0,
        tick_dt: float = 0.1,
    ) -> None:
        self._n_channels = n_channels
        self._window_sec = window_sec
        self._tick_dt = tick_dt
        self._max_ticks = int(window_sec / tick_dt) + 1
        self._buffer: deque[_SpikeRecord] = deque(maxlen=self._max_ticks)

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    def push(self, tick: int, channel_spikes: NDArray[np.bool_]) -> None:
        """Append one tick of spike data."""
        assert channel_spikes.shape == (self._n_channels,)
        self._buffer.append(
            _SpikeRecord(tick=tick, spikes=channel_spikes.copy())
        )

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    def get_raster(self, last_n_seconds: float | None = None) -> list[list[bool]]:
        """
        Return a list-of-lists suitable for JSON serialisation.

        Each inner list is one tick (oldest first), with one bool per
        channel.  If ``last_n_seconds`` is given, only return that many
        seconds of data; otherwise return the full buffer.
        """
        if last_n_seconds is None:
            records = list(self._buffer)
        else:
            n_ticks = int(last_n_seconds / self._tick_dt)
            records = list(self._buffer)[-n_ticks:]
        return [rec.spikes.tolist() for rec in records]

    def get_firing_rates(self, window_sec: float | None = None) -> NDArray[np.float64]:
        """
        Compute mean firing rate (Hz) per channel over the requested
        window (defaults to the full buffer).
        """
        if not self._buffer:
            return np.zeros(self._n_channels, dtype=np.float64)

        if window_sec is None:
            records = list(self._buffer)
        else:
            n_ticks = int(window_sec / self._tick_dt)
            records = list(self._buffer)[-n_ticks:]

        if not records:
            return np.zeros(self._n_channels, dtype=np.float64)

        spike_mat = np.array([r.spikes for r in records], dtype=np.float64)
        total_time = len(records) * self._tick_dt
        return spike_mat.sum(axis=0) / total_time

    def get_spike_counts(self, window_sec: float | None = None) -> NDArray[np.int64]:
        """Total spike count per channel over the window."""
        if not self._buffer:
            return np.zeros(self._n_channels, dtype=np.int64)

        if window_sec is None:
            records = list(self._buffer)
        else:
            n_ticks = int(window_sec / self._tick_dt)
            records = list(self._buffer)[-n_ticks:]

        spike_mat = np.array([r.spikes for r in records], dtype=np.int64)
        return spike_mat.sum(axis=0)

    @property
    def length(self) -> int:
        """Number of ticks currently stored."""
        return len(self._buffer)

    def clear(self) -> None:
        """Drop all stored data."""
        self._buffer.clear()
