// ============================================================================
// NEUROKITTY - Core Type Definitions
// ============================================================================

/** Cardinal/ordinal directions for movement */
export type Direction = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

/** Enemy behavior states */
export type EnemyState = "patrol" | "chase" | "idle" | "returning";

/** Enemy type identifiers */
export type EnemyType =
  | "slime"
  | "bat"
  | "spider"
  | "ghost"
  | "snake"
  | "beetle";

/** Berry varieties */
export type BerryType = "red" | "blue" | "golden";

/** Tile types in the world tilemap */
export enum TileType {
  GRASS_LIGHT = 0,
  GRASS_DARK = 1,
  GRASS_FLOWER = 2,
  PATH_DIRT = 3,
  PATH_STONE = 4,
  WATER = 5,
  WATER_EDGE = 6,
  TREE_TRUNK = 7,
  TREE_CANOPY = 8,
  BUILDING_WALL = 9,
  BUILDING_ROOF = 10,
  BUILDING_DOOR = 11,
  BUSH = 12,
  ROCK = 13,
  FENCE = 14,
  BRIDGE = 15,
}

/** Position in 2D space */
export interface Vec2 {
  x: number;
  y: number;
}

/** Cat (player) state */
export interface CatState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  energy: number;
  facing: Direction;
  health: number;
  is_eating: boolean;
  is_damaged: boolean;
  animation_frame: number;
}

/** Enemy entity */
export interface Enemy {
  id: number;
  x: number;
  y: number;
  type: EnemyType;
  state: EnemyState;
  facing: Direction;
  patrol_radius: number;
  animation_frame: number;
}

/** Collectible berry */
export interface Berry {
  id: number;
  x: number;
  y: number;
  type: BerryType;
  collected: boolean;
  respawn_tick: number;
}

/** Result of a single raycast from the cat */
export interface RaycastResult {
  angle: number;
  distance: number;
  hit_type: TileType | "enemy" | "berry" | "none";
}

/** Complete game simulation state (received from backend each tick) */
export interface GameState {
  tick: number;
  cat: CatState;
  enemies: Enemy[];
  berries: Berry[];
  score: number;
  berries_collected: number;
  raycasts: RaycastResult[];
  world_width: number;
  world_height: number;
  reward_event: "reward" | "punishment" | null;
}

/** Culture health metrics */
export interface CultureHealth {
  viability: number; // 0-1, percentage of alive neurons
  mean_firing_rate: number; // Hz, average across all channels
  burst_index: number; // 0-1, how bursty the activity is
  adaptation_level: number; // 0-1, how adapted the culture is
}

/** Decoded motor command from neural activity */
export interface MotorVector {
  dx: number; // -1 to 1
  dy: number; // -1 to 1
  magnitude: number; // 0 to 1
  direction_degrees: number; // 0-360
}

/** Neural state received from backend */
export interface NeuralState {
  tick: number;
  firing_rates: number[]; // 64 floats (8x8 MEA grid)
  spike_raster: boolean[][]; // 64 channels x N time bins
  culture_health: CultureHealth;
  motor_vector: MotorVector;
  active_channels: number[]; // indices of currently active channels
  population_activity: number[]; // 8 direction bins
  stimulation_channels: number[]; // channels currently being stimulated
  reward_signal: number; // -1 to 1
}

/** Tilemap definition */
export interface TileMap {
  width: number; // in tiles
  height: number; // in tiles
  tile_size: number; // pixels per tile (16)
  tiles: number[][]; // 2D array of TileType values
}

/** WebSocket connection status */
export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

/** Combined state update from server */
export interface ServerMessage {
  type: "state_update" | "init" | "error";
  game_state?: GameState;
  neural_state?: NeuralState;
  tilemap?: TileMap;
  timestamp: number;
}

/** Score history entry */
export interface ScoreEntry {
  tick: number;
  score: number;
}

/** Health history entry for sparklines */
export interface HealthHistoryEntry {
  tick: number;
  viability: number;
  mean_firing_rate: number;
  burst_index: number;
  adaptation_level: number;
}
