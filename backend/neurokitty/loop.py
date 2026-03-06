"""
NeuralLoop — the 10 Hz closed-loop core of Neurokitty.

Each tick (100 ms) executes the full pipeline:

    raycast  ->  encode  ->  stimulate  ->  record  ->  decode
       ^                                                   |
       |              cat moves, world updates             |
       +---------------------------------------------------+

Reward and punishment signals are injected into the culture based on
game events (berry collected, enemy contact, wall bump).
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import numpy as np

from neurokitty import config as cfg
from neurokitty.cortical.culture import NeuralCulture
from neurokitty.cortical.decoder import MotorDecoder
from neurokitty.cortical.encoder import SensoryEncoder
from neurokitty.world.berry import BerryManager
from neurokitty.world.cat import Cat
from neurokitty.world.enemy import EnemyManager
from neurokitty.world.raycaster import Raycaster
from neurokitty.world.tilemap import TileMap

logger = logging.getLogger(__name__)


class NeuralLoop:
    """
    Orchestrates the closed-loop interaction between the biological
    neural culture and the 2D game world.

    Public API
    ----------
    start()   — begin running in an asyncio background task.
    stop()    — gracefully shut down.
    step()    — advance a single tick (useful for testing).
    pause()   — pause the loop (world freezes, culture still ticks).
    resume()  — unpause.
    """

    def __init__(self, seed: int | None = None) -> None:
        self._rng = np.random.default_rng(seed)

        # World
        self.tilemap = TileMap(seed=seed)
        self.cat = Cat(tilemap=self.tilemap)
        self.enemies = EnemyManager(rng=self._rng)
        self.berries = BerryManager(tilemap=self.tilemap, rng=self._rng)
        self.raycaster = Raycaster(tilemap=self.tilemap)

        # Neural pipeline
        self.culture = NeuralCulture(rng=self._rng)
        self.encoder = SensoryEncoder()
        self.decoder = MotorDecoder()

        # State
        self._tick: int = 0
        self._running: bool = False
        self._paused: bool = False
        self._task: asyncio.Task | None = None
        self._dt: float = cfg.TICK_MS / 1000.0

        # Per-tick telemetry (consumed by websocket broadcaster)
        self._last_game_state: dict[str, Any] = {}
        self._last_neural_state: dict[str, Any] = {}

        # Callback for broadcasting (set by websocket manager)
        self._broadcast_callback: Any = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Start the loop as an asyncio background task."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run())
        logger.info("Neural loop started at %d Hz", cfg.LOOP_HZ)

    async def stop(self) -> None:
        """Stop the loop gracefully."""
        self._running = False
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("Neural loop stopped (tick %d)", self._tick)

    def pause(self) -> None:
        self._paused = True
        logger.info("Neural loop paused")

    def resume(self) -> None:
        self._paused = False
        logger.info("Neural loop resumed")

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def is_paused(self) -> bool:
        return self._paused

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def _run(self) -> None:
        """Async loop targeting 10 Hz."""
        target_dt = self._dt
        while self._running:
            t0 = time.monotonic()

            if not self._paused:
                self.step()

            # Broadcast state
            if self._broadcast_callback is not None:
                try:
                    await self._broadcast_callback(
                        self._last_game_state,
                        self._last_neural_state,
                    )
                except Exception:
                    logger.exception("Broadcast error")

            # Sleep for remainder of tick
            elapsed = time.monotonic() - t0
            sleep_time = max(0.0, target_dt - elapsed)
            await asyncio.sleep(sleep_time)

    # ------------------------------------------------------------------
    # Single step
    # ------------------------------------------------------------------

    def step(self) -> dict[str, Any]:
        """
        Execute one complete tick of the neural-game loop.

        Returns combined state dict (mainly for testing).
        """
        dt = self._dt
        self._tick += 1

        # 1. Raycast — sample the world around the cat
        enemy_pos = self.enemies.get_positions()
        berry_pos = self.berries.active_positions()
        rays = self.raycaster.cast(
            self.cat.x, self.cat.y, enemy_pos, berry_pos,
        )

        # 2. Encode raycasts into stimulation pattern
        stim = self.encoder.encode(rays)

        # 3. Step the culture (stimulate + record + dynamics)
        spikes = self.culture.step(stim, dt)

        # 4. Decode spikes into motor command
        motor = self.decoder.decode(spikes, self.culture.firing_rates)

        # 5. Move cat
        self.cat.update(motor.dx, motor.dy, dt)

        # 6. Update enemies
        self.enemies.update(self.cat.x, self.cat.y, dt)

        # 7. Update berries (respawns)
        self.berries.update()

        # 8. Check berry collection
        reward_this_tick = 0.0
        collected, energy_val, score_val = self.berries.collect(
            self.cat.x, self.cat.y
        )
        if collected:
            self.cat.eat_berry(energy_val)
            self.cat.score += score_val
            reward_this_tick += cfg.REWARD_SIGNAL_UV
            self.culture.reward(cfg.REWARD_SIGNAL_UV)
            logger.debug("Berry collected! +%d score", score_val)

        # 9. Check enemy collision
        punishment_this_tick = 0.0
        hitting = self.enemies.check_cat_collision(
            self.cat.x, self.cat.y, cfg.CAT_HITBOX_RADIUS,
        )
        if hitting:
            self.cat.take_damage()
            punishment_this_tick += abs(cfg.PUNISHMENT_SIGNAL_UV)
            self.culture.punish(cfg.PUNISHMENT_SIGNAL_UV)
            logger.debug("Enemy hit! damage taken")

        # 10. Mild punishment for wall proximity (nearest ray < 10 px)
        min_wall_dist = min(
            (r.distance for r in rays if r.hit_type.name in ("WALL",)),
            default=cfg.RAY_LENGTH,
        )
        if min_wall_dist < 10.0:
            mild = cfg.PUNISHMENT_SIGNAL_UV * 0.2
            self.culture.punish(mild)
            punishment_this_tick += abs(mild)

        # 11. Check cat alive — auto-reset if dead
        if not self.cat.alive:
            logger.info("Cat died at tick %d (score %d). Resetting.", self._tick, self.cat.score)
            self.cat.reset()

        # 12. Build state snapshots
        self._last_game_state = {
            "tick": self._tick,
            "cat": self.cat.get_state(),
            "enemies": self.enemies.get_states(),
            "berries": self.berries.get_states(),
            "rays": [
                {"distance": round(r.distance, 1), "hit": r.hit_type.name}
                for r in rays
            ],
            "reward": round(reward_this_tick, 1),
            "punishment": round(punishment_this_tick, 1),
        }

        self._last_neural_state = {
            "tick": self._tick,
            "firing_rates": self.culture.firing_rates.round(2).tolist(),
            "spike_raster": self.culture.get_spike_raster(last_n_seconds=3.0),
            "culture_health": self.culture.get_culture_health(),
            "motor": self.decoder.get_state(),
            "spikes_this_tick": int(spikes.sum()),
        }

        return {**self._last_game_state, **self._last_neural_state}

    # ------------------------------------------------------------------
    # Accessors
    # ------------------------------------------------------------------

    @property
    def last_game_state(self) -> dict[str, Any]:
        return self._last_game_state

    @property
    def last_neural_state(self) -> dict[str, Any]:
        return self._last_neural_state

    @property
    def tick(self) -> int:
        return self._tick

    def get_status(self) -> dict[str, Any]:
        return {
            "running": self._running,
            "paused": self._paused,
            "tick": self._tick,
            "elapsed_sec": round(self._tick * self._dt, 1),
            "cat_alive": self.cat.alive,
            "score": self.cat.score,
            "culture_health": self.culture.get_culture_health(),
        }

    # ------------------------------------------------------------------
    # Reset
    # ------------------------------------------------------------------

    def reset(self) -> None:
        """Full reset of world + culture state."""
        self.cat.reset()
        self.culture.reset()
        self.decoder.reset()
        self.berries = BerryManager(tilemap=self.tilemap, rng=self._rng)
        self.enemies = EnemyManager(rng=self._rng)
        self._tick = 0
        self._last_game_state = {}
        self._last_neural_state = {}
        logger.info("Full reset complete")
