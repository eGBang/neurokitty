# NEUROKITTY Architecture

## System Overview

NEUROKITTY is a closed-loop biological computing system where a cortical neural culture acts as the "brain" of a virtual cat in a 2D game world. The system follows a strict sense-think-act cycle at 10Hz.

## Data Flow

### Tick Lifecycle (100ms)

```
t=0ms    Raycaster samples 8 directions from cat position
t=2ms    SensoryEncoder converts rays → 64-channel stimulation pattern
t=5ms    Stimulation delivered to MEA (or simulated)
t=5-60ms Culture responds with spike patterns
t=65ms   SpikeBuffer records all channel activity
t=70ms   MotorDecoder extracts velocity vector from population coding
t=75ms   Cat.update() applies movement + collision resolution
t=80ms   World.update() — enemies patrol/chase, berries respawn
t=85ms   Reward/punishment signals computed and delivered
t=90ms   State serialized and broadcast via WebSocket
t=95ms   Dashboard metrics computed (firing rates, health, raster)
t=100ms  Next tick begins
```

### Encoding Pipeline

```
RayResult[8]
  │
  ▼
┌──────────────────────────────────────┐
│ SensoryEncoder                       │
│                                      │
│  ray[i] → electrodes[i*8 : i*8+8]   │
│                                      │
│  e[0:2] = distance_encode(dist)      │
│  e[2:4] = type_encode(hit_type)      │
│  e[4:6] = velocity_encode(approach)  │
│  e[6:8] = context_encode(adjacent)   │
│                                      │
│  Output: float64[64] (microvolts)    │
└──────────────────────────────────────┘
  │
  ▼
MEA.stimulate(voltages[64])
```

### Decoding Pipeline

```
MEA.record() → SpikeData[64][window]
  │
  ▼
┌──────────────────────────────────────┐
│ MotorDecoder                         │
│                                      │
│  For each direction d in [0..7]:     │
│    pop = electrodes[d*8 : d*8+8]    │
│    rate = sum(spikes[pop]) / window  │
│    vec += rate * unit_vector(d)      │
│                                      │
│  velocity = smooth(vec, alpha=0.3)   │
│  velocity = clamp(velocity, max=2.0) │
│                                      │
│  Output: (dx, dy) float tuple        │
└──────────────────────────────────────┘
  │
  ▼
Cat.update(dx, dy)
```

## Neural Culture Model (Simulation Mode)

When running without CL1 hardware, the culture is simulated with these components:

### Spike Generation
- Base: Poisson process per channel, rate = `lambda_i` Hz
- Modulated by: stimulation input, oscillation phase, adaptation state, noise

### Spontaneous Bursts
- Poisson-triggered events (mean interval ~2s)
- Activates ~20 random channels simultaneously
- Burst duration: 20-50ms
- Causes impulse-like cat movement

### Slow Oscillations
- Sinusoidal modulation of all channel firing rates
- Period: uniform random in [10, 30] seconds
- Amplitude: ±30% of base rate
- Phase resets occasionally (mimicking state transitions)

### Adaptation
- Each channel has an adaptation variable `a_i ∈ [0, 1]`
- On stimulation: `a_i += 0.05 * (1 - a_i)`
- Recovery: `a_i -= 0.002` per tick when unstimulated
- Effective rate: `lambda_i * (1 - a_i * 0.8)`
- Heavily adapted channels effectively go silent

### Reward/Punishment
- Reward (berry): global excitability boost for 500ms
- Punishment (enemy): global suppression for 300ms
- Magnitude shapes the culture's response to similar future stimulation

## World Generation

The tilemap is procedurally generated with these rules:

1. Base layer: grass everywhere
2. Water: 2-3 irregular ponds using Perlin-like noise
3. Paths: random walk between 4-6 waypoints, widened to 2 tiles
4. Trees: clustered using Poisson disk sampling, avoiding paths/water
5. Buildings: 3-5 rectangular structures (4x3 to 6x4 tiles) near paths
6. Berry bushes: placed near tree edges, marking valid berry spawn points

## Enemy AI

```
         ┌──────────┐
    ┌───▶│  PATROL   │◀──────┐
    │    └─────┬────┘       │
    │          │ cat in      │ cat escaped
    │          │ range       │ or timer
    │          ▼             │
    │    ┌──────────┐       │
    │    │  CHASE    │───────┘
    │    └──────────┘
    │          │ lost target
    │          ▼
    │    ┌──────────┐
    └────│  RETURN   │
         └──────────┘
```

- PATROL: Follow waypoint list at 1.0 px/tick
- CHASE: Move toward cat at 1.5 px/tick (cat max is 2.0)
- RETURN: Navigate back to nearest patrol waypoint

## WebSocket Protocol

Messages are JSON-encoded, sent at 10Hz (every tick).

### Server → Client

| Field | Type | Description |
|---|---|---|
| `type` | string | Always "tick" |
| `tick` | int | Monotonic tick counter |
| `game` | GameState | Cat, enemies, berries, score |
| `neural` | NeuralState | Firing rates, raster, health, motor |

### Client → Server

| Field | Type | Description |
|---|---|---|
| `type` | string | Command type |
| `action` | string | "pause", "resume", "reset" |

## Performance Considerations

- Backend loop must complete within 100ms — all operations are optimized for this budget
- WebSocket payload is ~2-4 KB per tick (minimized by sending sparse spike raster)
- Frontend renders at 60fps, interpolating between 10Hz server ticks
- Canvas only renders tiles within the camera viewport (~30x20 tiles vs 175x94 total)
- Spike raster uses a rolling window, old data is discarded
