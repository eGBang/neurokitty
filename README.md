# NEUROKITTY

A biological neural culture (Cortical Labs CL1) controls a virtual cat in a 2D world. All behavior comes from real spike patterns in ~800k @CorticalLabs neurons grown on a multielectrode array.

<img width="1416" height="815" alt="image" src="https://github.com/user-attachments/assets/ac721742-5497-4568-aab9-b23ec3313dbf" />



## What is this?

NEUROKITTY is a closed-loop biological computing experiment. A living neural culture — approximately 800,000 cortical neurons grown on a Cortical Labs CL1 multielectrode array (MEA) — directly controls a virtual cat navigating a 2D pixel-art world. The cat forages for berries, avoids enemies, and explores its environment using nothing but biological neural activity as its brain.

No neural networks. No machine learning. Real neurons, on silicon, making real decisions.

## How it works

### The Loop (10Hz, 100ms cycle)

```
 WORLD                    CULTURE                   WORLD
 ┌─────────┐   encode    ┌──────────┐   decode    ┌─────────┐
 │ 8 rays  │──────────▶  │ 64-ch    │──────────▶  │ motor   │
 │ sample  │  sensory →  │ MEA      │  spikes →   │ command  │
 │ world   │  stimulation│ ~800k    │  velocity    │ move cat │
 └─────────┘             │ neurons  │              └─────────┘
                         └──────────┘
                          ▲        │
                    reward/punishment
                    signals fed back
```

Every 100ms:

1. **Sense** — 8 raycasts sample the world around the cat (N, NE, E, SE, S, SW, W, NW), detecting walls, enemies, berries, and open space up to 120px away.

2. **Encode** — Raycast results are encoded into electrical stimulation patterns across 64 electrodes. Distance maps to voltage amplitude. Object type maps to phase encoding. The stimulation is delivered to the culture through the CL1 MEA.

3. **Respond** — The culture produces spike patterns in response. Spontaneous bursts fire across ~20 channels simultaneously, causing impulse-like movement. Slow oscillations (10–30 second periods) modulate overall activity levels. Channels adapt to repeated stimulation and go quiet — the culture learns.

4. **Decode** — Spikes are decoded into motor commands using population vector coding. Eight groups of electrodes each vote for a direction. The population vector sum determines the cat's velocity.

5. **Act** — The cat moves in the decoded direction. Collisions are resolved. Berry collection triggers a reward signal (positive voltage pulse). Enemy contact triggers punishment (negative pulse). These signals close the loop, shaping future culture behavior.

### The Culture

The neural culture exhibits emergent properties that directly affect gameplay:

- **Spontaneous bursts** — Groups of ~20 channels fire simultaneously without any input, causing the cat to make sudden, seemingly random movements. This is the culture "thinking" on its own.

- **Oscillatory modulation** — Slow waves (10–30s period) modulate overall firing rates, creating cycles of high and low activity. The cat alternates between exploratory bursts and quiet periods.

- **Adaptation / Habituation** — Channels that receive repeated identical stimulation gradually reduce their response. The culture stops reacting to unchanging stimuli — it gets bored. This forces the cat to keep moving and exploring.

- **Reward-driven plasticity** — Positive voltage pulses (berry collection) temporarily increase culture excitability. Negative pulses (enemy contact) suppress activity. Over time, the culture develops stimulus-response patterns that increase foraging success.

### The World

A pre-rendered 2800 x 1500 pixel tilemap (175 x 94 tiles at 16px):

- **Terrain** — Grass fields, dirt paths, water features, dense tree clusters, and small buildings create a varied navigable landscape.
- **Berries** — Up to 24 berries spawn near bushes. Collecting one restores cat energy and sends a reward signal to the culture. Berries respawn on a timer.
- **Enemies** — 6 hostile entities (slimes, skeletons, bats, goblins, spiders, ghosts) patrol fixed routes. When the cat enters their detection radius (~80px), they switch to chase mode. Contact damages the cat and sends a punishment signal to the culture.
- **Energy** — The cat has limited energy that depletes over time. Berries restore energy. If energy hits zero, the run ends and the culture is reset.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                 │
│                                                      │
│  ┌─────────────────┐  ┌──────────────────────────┐   │
│  │  World Canvas   │  │     Neural Dashboard     │   │
│  │                 │  │  ┌────────┐ ┌─────────┐  │   │
│  │  - Tilemap      │  │  │ Spike  │ │ Firing  │  │   │
│  │  - Cat sprite   │  │  │ Raster │ │ Rate    │  │   │
│  │  - Enemies      │  │  │        │ │ Heatmap │  │   │
│  │  - Berries      │  │  ┌────────┐ ┌─────────┐  │   │
│  │  - Camera track │  │  │Culture │ │ Motor   │  │   │
│  │  - Minimap      │  │  │Health  │ │ Decoder │  │   │
│  └─────────────────┘  └──────────────────────────┘   │
│                          ▲ WebSocket                  │
└──────────────────────────┼───────────────────────────┘
                           │
┌──────────────────────────┼───────────────────────────┐
│                  BACKEND (FastAPI)                     │
│                          │                            │
│  ┌──────────────────────────────────────────────┐    │
│  │              Neural Loop (10Hz)               │    │
│  │                                               │    │
│  │  Raycaster → Encoder → MEA → Decoder → Cat   │    │
│  │                         ↕                     │    │
│  │              Reward / Punishment               │    │
│  └──────────────────────────────────────────────┘    │
│                                                       │
│  ┌─────────────┐  ┌──────────┐  ┌────────────────┐  │
│  │ World State │  │ Culture  │  │ WebSocket Mgr  │  │
│  │ (tilemap,   │  │ (MEA,    │  │ (broadcast     │  │
│  │  entities)  │  │  spikes) │  │  game+neural)  │  │
│  └─────────────┘  └──────────┘  └────────────────┘  │
└───────────────────────────────────────────────────────┘
                           │
                    ┌──────┴──────┐
                    │  CL1 MEA    │
                    │  Hardware   │
                    │  (or sim)   │
                    └─────────────┘
```

### Backend (`/backend`)

Python 3.12 / FastAPI. Runs the neural loop and serves state over WebSocket.

| Module | Description |
|---|---|
| `neurokitty.main` | FastAPI app, REST + WebSocket endpoints |
| `neurokitty.loop` | 10Hz main loop orchestrating sense-think-act |
| `neurokitty.cortical.mea` | CL1 multielectrode array interface (64-channel) |
| `neurokitty.cortical.culture` | Neural culture state: firing rates, bursts, oscillations, adaptation |
| `neurokitty.cortical.encoder` | Sensory → stimulation encoding (raycasts → voltage patterns) |
| `neurokitty.cortical.decoder` | Spike → motor decoding (population vector coding) |
| `neurokitty.cortical.spike_buffer` | Circular buffer for spike history and raster data |
| `neurokitty.world.tilemap` | Procedural tilemap generation (175 x 94 tiles) |
| `neurokitty.world.cat` | Cat entity: position, energy, movement, collision |
| `neurokitty.world.enemy` | 6 patrol enemies with chase AI |
| `neurokitty.world.berry` | Berry spawning and collection |
| `neurokitty.world.raycaster` | 8-direction raycasting for sensory input |
| `neurokitty.world.physics` | AABB and circle collision detection |
| `neurokitty.websocket` | WebSocket connection manager and state broadcasting |

### Frontend (`/frontend`)

Next.js 14 / TypeScript / Tailwind CSS. Canvas-based rendering with real-time neural dashboard.

| Component | Description |
|---|---|
| `WorldCanvas` | HTML5 Canvas game view with pixel-art rendering and smooth camera tracking |
| `SpikeRaster` | Scrolling 64-channel spike raster plot |
| `FiringRateChart` | 8x8 heatmap of electrode firing rates matching MEA layout |
| `CultureHealth` | Culture viability gauge, firing stats, adaptation level |
| `NeuralActivity` | Motor decoder compass, population direction bars, reward events |
| `StatusBar` | Culture online status, tick counter, energy bar, score |

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 20+
- (Optional) Cortical Labs CL1 hardware + API access

### Running locally

**Backend:**

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn neurokitty.main:app --reload --port 8000
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to watch NEUROKITTY explore.

### Running with Docker

```bash
docker-compose up --build
```

Frontend at `http://localhost:3000`, backend API at `http://localhost:8000`.

### Connecting to real CL1 hardware

By default, the backend runs in simulation mode — it models the neural culture computationally using Poisson spike generators and Hebbian-like adaptation rules. To connect to real Cortical Labs CL1 hardware:

1. Set environment variables:
   ```bash
   export NEUROKITTY_CULTURE_MODE=cl1
   export CL1_API_HOST=<your-cl1-ip>
   export CL1_API_PORT=5050
   ```

2. Ensure the CL1 device is running and the MEA API is accessible on your network.

3. Start the backend — it will connect to the CL1 API instead of running the simulation.

## Configuration

Key parameters in `backend/neurokitty/config.py`:

| Parameter | Default | Description |
|---|---|---|
| `LOOP_HZ` | 10 | Main loop frequency |
| `MEA_CHANNELS` | 64 | Electrode count (8x8 grid) |
| `NUM_RAYCASTS` | 8 | Directional samples per tick |
| `RAY_LENGTH` | 120 | Max raycast distance (px) |
| `NUM_ENEMIES` | 6 | Patrolling enemy count |
| `MAX_BERRIES` | 24 | Maximum concurrent berries |
| `REWARD_SIGNAL_UV` | 200 | Reward stimulation amplitude (uV) |
| `PUNISHMENT_SIGNAL_UV` | -150 | Punishment stimulation amplitude (uV) |
| `SPIKE_THRESHOLD_UV` | -45.0 | Spike detection threshold (uV) |
| `BURST_CHANNEL_COUNT` | 20 | Channels in a spontaneous burst |
| `OSCILLATION_PERIOD_RANGE` | (10, 30) | Slow oscillation period bounds (s) |

## API Endpoints

### REST

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/status` | Backend status and culture mode |
| `GET` | `/api/config` | Current configuration |
| `GET` | `/api/world` | Full tilemap data for frontend rendering |
| `POST` | `/api/culture/reset` | Reset culture state |
| `POST` | `/api/culture/pause` | Pause the neural loop |
| `POST` | `/api/culture/resume` | Resume the neural loop |

### WebSocket

Connect to `ws://localhost:8000/ws` to receive real-time data frames:

```json
{
  "type": "tick",
  "tick": 1042,
  "game": {
    "cat": { "x": 1280, "y": 720, "vx": 1.2, "vy": -0.5, "energy": 78.5, "facing": "ne" },
    "enemies": [
      { "x": 400, "y": 300, "type": "slime", "state": "patrol" }
    ],
    "berries": [
      { "x": 900, "y": 600, "type": "red", "collected": false }
    ],
    "score": 23
  },
  "neural": {
    "firing_rates": [12.5, 0.0, 8.3, ...],
    "spike_raster": [[true, false, ...], ...],
    "culture_health": {
      "viability": 94.2,
      "mean_firing_rate": 7.8,
      "burst_index": 0.34,
      "adaptation_level": 0.12
    },
    "motor_vector": { "dx": 1.2, "dy": -0.5 },
    "active_channels": [3, 7, 12, 15, 22, 31, 45, 58]
  }
}
```

## How the Neural Encoding Works

### Sensory Encoding (World → Culture)

Each of the 8 raycasts maps to a group of 8 electrodes (64 total). For each ray:

| Electrode offset | Encodes |
|---|---|
| 0–1 | Distance (near = high amplitude, far = low) |
| 2–3 | Object type: wall (high freq), enemy (burst), berry (low freq), empty (silence) |
| 4–5 | Approach velocity (is the object getting closer?) |
| 6–7 | Lateral context (what's on adjacent rays?) |

Stimulation uses biphasic pulses: 200us per phase, charge-balanced to prevent electrode damage.

### Motor Decoding (Culture → World)

The 64 electrodes are divided into 8 directional populations matching the raycast directions. For each population:

1. Count spikes in the 100ms window
2. Compute a direction vector weighted by spike count
3. Sum all 8 population vectors
4. Apply velocity smoothing (EMA, alpha=0.3)
5. Clamp to max speed (2.0 px/tick)

This is classic population vector coding, the same principle used in brain-machine interfaces for prosthetic limb control.

## Neuroscience Background

NEUROKITTY builds on research from [Cortical Labs](https://corticallabs.com/), who demonstrated in their 2022 *Neuron* paper ("In vitro neurons learn and exhibit sentience when embodied in a simulated game-world") that biological neural cultures can learn to play Pong through closed-loop stimulation.

Key biological phenomena observed in the culture:

- **Spontaneous activity** — Even without stimulation, the culture generates coordinated bursts of activity. In NEUROKITTY, these manifest as the cat making "voluntary" movements.

- **Stimulus-evoked responses** — The culture responds to electrical stimulation within 10–50ms. Response patterns depend on stimulation history and current culture state.

- **Habituation** — Repeated identical stimulation leads to diminishing responses. This is a fundamental form of learning that forces the cat to keep exploring rather than sitting still.

- **Free energy minimization** — Following Cortical Labs' theoretical framework, the culture acts to minimize prediction error. Reward signals reduce free energy; punishment signals increase it. Over time, the culture develops behaviors that maximize reward.

## Contributing

This is an experimental research project. Contributions welcome — especially around:

- Improved encoding/decoding schemes
- More sophisticated world environments
- Better reward shaping strategies
- Integration with other MEA platforms (Maxwell, 3Brain)
- Long-term culture behavior analysis tools

## License

MIT License. See [LICENSE](LICENSE).

## Acknowledgments

- [Cortical Labs](https://corticallabs.com/) for the CL1 platform and foundational DishBrain research
- The in vitro electrophysiology community
- Everyone exploring what it means to give neurons a body
