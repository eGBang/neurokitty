"""
Global configuration constants for the Neurokitty system.

All biophysical parameters are grounded in typical values for rodent cortical
cultures on Cortical Labs CL1 / MaxWell MaxOne-style MEAs.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Timing
# ---------------------------------------------------------------------------
LOOP_HZ: int = 10
TICK_MS: int = 100  # 1000 / LOOP_HZ

# ---------------------------------------------------------------------------
# MEA / electrode geometry
# ---------------------------------------------------------------------------
MEA_CHANNELS: int = 64
MEA_ROWS: int = 8
MEA_COLS: int = 8
ELECTRODE_PITCH_UM: float = 200.0  # centre-to-centre spacing in micrometres

# ---------------------------------------------------------------------------
# World dimensions (pixels)
# ---------------------------------------------------------------------------
WORLD_WIDTH: int = 2800
WORLD_HEIGHT: int = 1500
TILE_SIZE: int = 16
TILES_X: int = WORLD_WIDTH // TILE_SIZE   # 175
TILES_Y: int = WORLD_HEIGHT // TILE_SIZE  # 93  (last row partial — we round)

# ---------------------------------------------------------------------------
# Raycasting
# ---------------------------------------------------------------------------
NUM_RAYCASTS: int = 8
RAY_LENGTH: float = 120.0  # pixels
RAY_STEP: float = 2.0      # step size along each ray

# ---------------------------------------------------------------------------
# Entities
# ---------------------------------------------------------------------------
NUM_ENEMIES: int = 6
MAX_BERRIES: int = 24
BERRY_RESPAWN_SEC: float = 8.0
ENEMY_DETECTION_RADIUS: float = 80.0
ENEMY_PATROL_SPEED: float = 28.0   # px/s
ENEMY_CHASE_SPEED: float = 42.0    # px/s
CAT_BASE_SPEED: float = 50.0       # px/s
CAT_MAX_ENERGY: float = 100.0
CAT_ENERGY_DRAIN: float = 1.5      # per second
CAT_HITBOX_RADIUS: float = 8.0
BERRY_COLLECT_RADIUS: float = 12.0
BERRY_ENERGY_RESTORE: float = 12.0

# ---------------------------------------------------------------------------
# Neural stimulation / recording
# ---------------------------------------------------------------------------
REWARD_SIGNAL_UV: float = 200.0       # micro-volts — positive reinforcement pulse
PUNISHMENT_SIGNAL_UV: float = -150.0   # micro-volts — aversive stimulation
SPIKE_THRESHOLD_UV: float = -45.0      # detection threshold
NOISE_FLOOR_UV: float = 8.0           # RMS noise on a healthy electrode
MAX_STIM_UV: float = 400.0            # hardware safety clamp
MIN_FIRING_RATE_HZ: float = 0.5       # below this a channel is considered silent
MAX_FIRING_RATE_HZ: float = 80.0      # physiological ceiling

# ---------------------------------------------------------------------------
# Culture dynamics
# ---------------------------------------------------------------------------
BURST_CHANNEL_COUNT: int = 20          # channels co-activated in a burst
BURST_RATE_HZ: float = 0.3            # expected bursts per second
OSCILLATION_PERIOD_RANGE: tuple[float, float] = (10.0, 30.0)  # seconds
ADAPTATION_TAU_SEC: float = 4.0        # time-constant of adaptation
ADAPTATION_MAX: float = 0.85           # maximum suppression factor
FIRING_RATE_EMA_ALPHA: float = 0.15    # exponential moving average smoothing

# ---------------------------------------------------------------------------
# Spike buffer / raster
# ---------------------------------------------------------------------------
SPIKE_BUFFER_SECONDS: float = 10.0

# ---------------------------------------------------------------------------
# WebSocket / networking
# ---------------------------------------------------------------------------
WS_PORT: int = 8000
WS_GAME_STATE_TOPIC: str = "game"
WS_NEURAL_TOPIC: str = "neural"
CORS_ORIGINS: list[str] = ["*"]
