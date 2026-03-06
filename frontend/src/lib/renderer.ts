// ============================================================================
// NEUROKITTY - Canvas Renderer
// Pixel-art tile rendering, entity drawing, and minimap
// ============================================================================

import { Camera } from "./camera";
import {
  TileType,
  TileMap,
  GameState,
  CatState,
  Enemy,
  Berry,
  RaycastResult,
  Direction,
} from "./types";

// ---------------------------------------------------------------------------
// Color palettes
// ---------------------------------------------------------------------------

const TILE_COLORS: Record<number, string | string[]> = {
  [TileType.GRASS_LIGHT]: ["#4a8c3f", "#4d9142", "#479038"],
  [TileType.GRASS_DARK]: ["#3a7a30", "#3d7f33", "#377e2a"],
  [TileType.GRASS_FLOWER]: ["#4a8c3f"], // base; flowers drawn separately
  [TileType.PATH_DIRT]: ["#c4a46c", "#bfa065", "#c9a870"],
  [TileType.PATH_STONE]: ["#8a8a8a", "#929292", "#828282"],
  [TileType.WATER]: ["#2a6fdb", "#2565c9", "#3078e0"],
  [TileType.WATER_EDGE]: ["#3a8aeb", "#4590e8"],
  [TileType.TREE_TRUNK]: ["#6b4226", "#704828"],
  [TileType.TREE_CANOPY]: ["#2d6b1e", "#337722", "#28601a"],
  [TileType.BUILDING_WALL]: ["#8b7355", "#7f6a50"],
  [TileType.BUILDING_ROOF]: ["#a0522d", "#944b28"],
  [TileType.BUILDING_DOOR]: ["#5a3a1a"],
  [TileType.BUSH]: ["#3a8a2e", "#3f8f33"],
  [TileType.ROCK]: ["#6e6e6e", "#787878"],
  [TileType.FENCE]: ["#8b6b3a"],
  [TileType.BRIDGE]: ["#a08050", "#9a7a4a"],
};

const ENEMY_COLORS: Record<string, string> = {
  slime: "#44cc44",
  bat: "#9944cc",
  spider: "#333333",
  ghost: "#ccccff",
  snake: "#cc4444",
  beetle: "#886622",
};

const BERRY_COLORS: Record<string, string> = {
  red: "#ff3344",
  blue: "#3388ff",
  golden: "#ffcc00",
};

const MINIMAP_TILE_COLORS: Record<number, string> = {
  [TileType.GRASS_LIGHT]: "#3a7030",
  [TileType.GRASS_DARK]: "#2d5a24",
  [TileType.GRASS_FLOWER]: "#3a7030",
  [TileType.PATH_DIRT]: "#a08050",
  [TileType.PATH_STONE]: "#707070",
  [TileType.WATER]: "#2060c0",
  [TileType.WATER_EDGE]: "#3080d0",
  [TileType.TREE_TRUNK]: "#503020",
  [TileType.TREE_CANOPY]: "#1a5010",
  [TileType.BUILDING_WALL]: "#706050",
  [TileType.BUILDING_ROOF]: "#804020",
  [TileType.BUILDING_DOOR]: "#503010",
  [TileType.BUSH]: "#2a6020",
  [TileType.ROCK]: "#585858",
  [TileType.FENCE]: "#706030",
  [TileType.BRIDGE]: "#907040",
};

// ---------------------------------------------------------------------------
// Procedural tilemap generation (used when server hasn't sent one yet)
// ---------------------------------------------------------------------------

function generateDefaultTilemap(): TileMap {
  const width = 175; // 2800 / 16
  const height = 94; // ~1500 / 16
  const tiles: number[][] = [];

  // Seed a pseudo-random generator
  const seed = 42;
  let rng = seed;
  const rand = () => {
    rng = (rng * 16807 + 0) % 2147483647;
    return (rng & 0x7fffffff) / 0x7fffffff;
  };

  // Fill with grass
  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) {
      const r = rand();
      if (r < 0.6) tiles[y][x] = TileType.GRASS_LIGHT;
      else if (r < 0.95) tiles[y][x] = TileType.GRASS_DARK;
      else tiles[y][x] = TileType.GRASS_FLOWER;
    }
  }

  // Add paths (horizontal and vertical roads)
  const pathYs = [20, 47, 70];
  const pathXs = [30, 80, 130];

  for (const py of pathYs) {
    for (let x = 0; x < width; x++) {
      for (let dy = -1; dy <= 1; dy++) {
        const ty = py + dy;
        if (ty >= 0 && ty < height) {
          tiles[ty][x] = rand() < 0.7 ? TileType.PATH_DIRT : TileType.PATH_STONE;
        }
      }
    }
  }

  for (const px of pathXs) {
    for (let y = 0; y < height; y++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = px + dx;
        if (tx >= 0 && tx < width) {
          tiles[y][tx] = rand() < 0.7 ? TileType.PATH_DIRT : TileType.PATH_STONE;
        }
      }
    }
  }

  // Water features
  const waterBodies = [
    { cx: 50, cy: 35, rx: 8, ry: 5 },
    { cx: 140, cy: 60, rx: 10, ry: 6 },
    { cx: 20, cy: 80, rx: 6, ry: 4 },
  ];

  for (const wb of waterBodies) {
    for (let y = wb.cy - wb.ry - 1; y <= wb.cy + wb.ry + 1; y++) {
      for (let x = wb.cx - wb.rx - 1; x <= wb.cx + wb.rx + 1; x++) {
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        const dx = (x - wb.cx) / wb.rx;
        const dy = (y - wb.cy) / wb.ry;
        const dist = dx * dx + dy * dy;
        if (dist < 0.85) {
          tiles[y][x] = TileType.WATER;
        } else if (dist < 1.15) {
          tiles[y][x] = TileType.WATER_EDGE;
        }
      }
    }
  }

  // Trees (clusters)
  const treeClusters = [
    { cx: 15, cy: 15, count: 12 },
    { cx: 100, cy: 10, count: 10 },
    { cx: 60, cy: 55, count: 15 },
    { cx: 155, cy: 30, count: 8 },
    { cx: 90, cy: 80, count: 11 },
    { cx: 40, cy: 75, count: 9 },
    { cx: 120, cy: 45, count: 7 },
    { cx: 10, cy: 55, count: 6 },
    { cx: 165, cy: 75, count: 10 },
  ];

  for (const tc of treeClusters) {
    for (let i = 0; i < tc.count; i++) {
      const tx = Math.floor(tc.cx + (rand() - 0.5) * 14);
      const ty = Math.floor(tc.cy + (rand() - 0.5) * 10);
      if (tx < 1 || tx >= width - 1 || ty < 1 || ty >= height - 1) continue;
      // Don't place on water or paths
      if (
        tiles[ty][tx] === TileType.WATER ||
        tiles[ty][tx] === TileType.PATH_DIRT ||
        tiles[ty][tx] === TileType.PATH_STONE
      )
        continue;
      tiles[ty][tx] = TileType.TREE_TRUNK;
      tiles[ty - 1][tx] = TileType.TREE_CANOPY;
      if (tx > 0) tiles[ty - 1][tx - 1] = TileType.TREE_CANOPY;
      if (tx < width - 1) tiles[ty - 1][tx + 1] = TileType.TREE_CANOPY;
    }
  }

  // Buildings
  const buildings = [
    { x: 35, y: 18, w: 5, h: 4 },
    { x: 85, y: 45, w: 6, h: 5 },
    { x: 115, y: 18, w: 4, h: 3 },
    { x: 60, y: 68, w: 5, h: 4 },
    { x: 150, y: 55, w: 4, h: 3 },
  ];

  for (const b of buildings) {
    for (let y = b.y; y < b.y + b.h && y < height; y++) {
      for (let x = b.x; x < b.x + b.w && x < width; x++) {
        if (y === b.y) {
          tiles[y][x] = TileType.BUILDING_ROOF;
        } else if (
          y === b.y + b.h - 1 &&
          x === b.x + Math.floor(b.w / 2)
        ) {
          tiles[y][x] = TileType.BUILDING_DOOR;
        } else {
          tiles[y][x] = TileType.BUILDING_WALL;
        }
      }
    }
  }

  // Bushes
  for (let i = 0; i < 40; i++) {
    const bx = Math.floor(rand() * width);
    const by = Math.floor(rand() * height);
    if (
      tiles[by][bx] === TileType.GRASS_LIGHT ||
      tiles[by][bx] === TileType.GRASS_DARK
    ) {
      tiles[by][bx] = TileType.BUSH;
    }
  }

  // Rocks
  for (let i = 0; i < 25; i++) {
    const rx = Math.floor(rand() * width);
    const ry = Math.floor(rand() * height);
    if (
      tiles[ry][rx] === TileType.GRASS_LIGHT ||
      tiles[ry][rx] === TileType.GRASS_DARK
    ) {
      tiles[ry][rx] = TileType.ROCK;
    }
  }

  // Fences near buildings
  for (const b of buildings) {
    // bottom fence
    const fenceY = b.y + b.h;
    if (fenceY < height) {
      for (let x = b.x - 1; x <= b.x + b.w; x++) {
        if (x >= 0 && x < width && tiles[fenceY][x] !== TileType.PATH_DIRT) {
          tiles[fenceY][x] = TileType.FENCE;
        }
      }
    }
  }

  // Bridges over water on path intersections
  for (const wb of waterBodies) {
    for (const py of pathYs) {
      if (Math.abs(py - wb.cy) < wb.ry + 2) {
        for (let x = wb.cx - wb.rx; x <= wb.cx + wb.rx; x++) {
          if (x >= 0 && x < width) {
            for (let dy = -1; dy <= 1; dy++) {
              const ty = py + dy;
              if (ty >= 0 && ty < height && tiles[ty][x] === TileType.WATER) {
                tiles[ty][x] = TileType.BRIDGE;
              }
            }
          }
        }
      }
    }
  }

  return {
    width,
    height,
    tile_size: 16,
    tiles,
  };
}

// ---------------------------------------------------------------------------
// Water animation state
// ---------------------------------------------------------------------------

let waterAnimFrame = 0;
let waterAnimTimer = 0;

// ---------------------------------------------------------------------------
// CanvasRenderer
// ---------------------------------------------------------------------------

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private tilemap: TileMap;
  private minimapCanvas: OffscreenCanvas | null = null;
  private minimapDirty: boolean = true;
  private tileCache: Map<string, ImageData> = new Map();

  /** Debug: show raycasts */
  showRaycasts: boolean = false;

  constructor(ctx: CanvasRenderingContext2D, tilemap?: TileMap) {
    this.ctx = ctx;
    this.tilemap = tilemap || generateDefaultTilemap();
    ctx.imageSmoothingEnabled = false;
  }

  /** Update the tilemap (e.g., when received from server) */
  setTilemap(tilemap: TileMap): void {
    this.tilemap = tilemap;
    this.minimapDirty = true;
    this.tileCache.clear();
  }

  /** Get a deterministic pseudo-random color from an array */
  private pickColor(colors: string | string[], x: number, y: number): string {
    if (typeof colors === "string") return colors;
    const idx = ((x * 7 + y * 13) & 0x7fffffff) % colors.length;
    return colors[idx];
  }

  /** Main render call */
  render(
    camera: Camera,
    gameState: GameState | null,
    deltaTime: number
  ): void {
    const ctx = this.ctx;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    ctx.imageSmoothingEnabled = false;

    // Clear
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, w, h);

    // Water animation
    waterAnimTimer += deltaTime;
    if (waterAnimTimer > 0.5) {
      waterAnimTimer -= 0.5;
      waterAnimFrame = (waterAnimFrame + 1) % 3;
    }

    // Render tilemap (only visible tiles)
    this.renderTilemap(camera);

    if (gameState) {
      // Render berries
      this.renderBerries(camera, gameState.berries);

      // Render raycasts (debug)
      if (this.showRaycasts && gameState.raycasts) {
        this.renderRaycasts(camera, gameState.cat, gameState.raycasts);
      }

      // Render enemies
      this.renderEnemies(camera, gameState.enemies);

      // Render cat
      this.renderCat(camera, gameState.cat);
    }

    // Render minimap
    if (gameState) {
      this.renderMinimap(camera, gameState);
    }
  }

  // -------------------------------------------------------------------------
  // Tilemap rendering
  // -------------------------------------------------------------------------

  private renderTilemap(camera: Camera): void {
    const ctx = this.ctx;
    const tm = this.tilemap;
    const bounds = camera.getVisibleBounds();

    const startTileX = Math.max(0, Math.floor(bounds.left / tm.tile_size));
    const startTileY = Math.max(0, Math.floor(bounds.top / tm.tile_size));
    const endTileX = Math.min(
      tm.width - 1,
      Math.ceil(bounds.right / tm.tile_size)
    );
    const endTileY = Math.min(
      tm.height - 1,
      Math.ceil(bounds.bottom / tm.tile_size)
    );

    for (let ty = startTileY; ty <= endTileY; ty++) {
      for (let tx = startTileX; tx <= endTileX; tx++) {
        const tileType = tm.tiles[ty]?.[tx];
        if (tileType === undefined) continue;

        const worldX = tx * tm.tile_size;
        const worldY = ty * tm.tile_size;
        const screen = camera.worldToScreen(worldX, worldY);

        // Skip tiles fully outside viewport
        if (
          screen.x + tm.tile_size < 0 ||
          screen.y + tm.tile_size < 0 ||
          screen.x > ctx.canvas.width ||
          screen.y > ctx.canvas.height
        )
          continue;

        this.drawTile(ctx, tileType, screen.x, screen.y, tm.tile_size, tx, ty);
      }
    }
  }

  private drawTile(
    ctx: CanvasRenderingContext2D,
    tileType: number,
    sx: number,
    sy: number,
    size: number,
    tileX: number,
    tileY: number
  ): void {
    const colors = TILE_COLORS[tileType];
    if (!colors) return;

    const baseColor = this.pickColor(colors, tileX, tileY);
    ctx.fillStyle = baseColor;
    ctx.fillRect(Math.floor(sx), Math.floor(sy), size, size);

    // Extra detail per tile type
    switch (tileType) {
      case TileType.GRASS_FLOWER: {
        // Small flower dots
        const flowerColors = ["#ff6b8a", "#ffdd44", "#ff88aa", "#ffffff"];
        const fc =
          flowerColors[((tileX * 3 + tileY * 7) & 0x7fff) % flowerColors.length];
        ctx.fillStyle = fc;
        const fx = Math.floor(sx) + ((tileX * 5 + 3) % 12) + 2;
        const fy = Math.floor(sy) + ((tileY * 7 + 5) % 12) + 2;
        ctx.fillRect(fx, fy, 2, 2);
        break;
      }

      case TileType.WATER:
      case TileType.WATER_EDGE: {
        // Animated water highlights
        const waveOffset =
          ((tileX + waterAnimFrame) * 5 + tileY * 3) % 16;
        ctx.fillStyle =
          tileType === TileType.WATER
            ? "rgba(80, 160, 255, 0.25)"
            : "rgba(100, 180, 255, 0.2)";
        ctx.fillRect(
          Math.floor(sx) + waveOffset,
          Math.floor(sy) + 4,
          4,
          2
        );
        ctx.fillRect(
          Math.floor(sx) + ((waveOffset + 8) % 16),
          Math.floor(sy) + 10,
          3,
          2
        );
        break;
      }

      case TileType.TREE_TRUNK: {
        // Draw trunk detail
        ctx.fillStyle = "#5a3520";
        ctx.fillRect(Math.floor(sx) + 6, Math.floor(sy), 4, size);
        ctx.fillStyle = "#7a5530";
        ctx.fillRect(Math.floor(sx) + 7, Math.floor(sy) + 2, 2, size - 4);
        break;
      }

      case TileType.TREE_CANOPY: {
        // Round canopy shape
        ctx.fillStyle = "#2d6b1e";
        const cx = Math.floor(sx) + size / 2;
        const cy = Math.floor(sy) + size / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, size / 2 + 1, 0, Math.PI * 2);
        ctx.fill();
        // Highlight
        ctx.fillStyle = "#3a8a2e";
        ctx.beginPath();
        ctx.arc(cx - 2, cy - 2, size / 3, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case TileType.BUILDING_WALL: {
        // Brick lines
        ctx.strokeStyle = "rgba(0,0,0,0.15)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.floor(sx), Math.floor(sy) + 4);
        ctx.lineTo(Math.floor(sx) + size, Math.floor(sy) + 4);
        ctx.moveTo(Math.floor(sx), Math.floor(sy) + 8);
        ctx.lineTo(Math.floor(sx) + size, Math.floor(sy) + 8);
        ctx.moveTo(Math.floor(sx), Math.floor(sy) + 12);
        ctx.lineTo(Math.floor(sx) + size, Math.floor(sy) + 12);
        // Vertical offsets
        ctx.moveTo(Math.floor(sx) + 8, Math.floor(sy));
        ctx.lineTo(Math.floor(sx) + 8, Math.floor(sy) + 4);
        ctx.moveTo(Math.floor(sx) + 4, Math.floor(sy) + 4);
        ctx.lineTo(Math.floor(sx) + 4, Math.floor(sy) + 8);
        ctx.moveTo(Math.floor(sx) + 12, Math.floor(sy) + 8);
        ctx.lineTo(Math.floor(sx) + 12, Math.floor(sy) + 12);
        ctx.stroke();
        break;
      }

      case TileType.BUILDING_ROOF: {
        // Slight gradient look
        ctx.fillStyle = "rgba(0,0,0,0.1)";
        ctx.fillRect(Math.floor(sx), Math.floor(sy) + size - 3, size, 3);
        break;
      }

      case TileType.BUILDING_DOOR: {
        // Door details
        ctx.fillStyle = "#3a2510";
        ctx.fillRect(Math.floor(sx) + 4, Math.floor(sy) + 2, 8, 14);
        // Handle
        ctx.fillStyle = "#c0a030";
        ctx.fillRect(Math.floor(sx) + 10, Math.floor(sy) + 8, 2, 2);
        break;
      }

      case TileType.BUSH: {
        // Round bush with berry dots
        ctx.fillStyle = "#2d7520";
        const bcx = Math.floor(sx) + 8;
        const bcy = Math.floor(sy) + 10;
        ctx.beginPath();
        ctx.arc(bcx, bcy, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#3a9a30";
        ctx.beginPath();
        ctx.arc(bcx - 1, bcy - 2, 4, 0, Math.PI * 2);
        ctx.fill();
        // Berry dots
        ctx.fillStyle = "#cc3333";
        ctx.fillRect(Math.floor(sx) + 5, Math.floor(sy) + 8, 2, 2);
        ctx.fillRect(Math.floor(sx) + 10, Math.floor(sy) + 10, 2, 2);
        break;
      }

      case TileType.ROCK: {
        ctx.fillStyle = "#585858";
        ctx.beginPath();
        ctx.moveTo(Math.floor(sx) + 3, Math.floor(sy) + 13);
        ctx.lineTo(Math.floor(sx) + 8, Math.floor(sy) + 4);
        ctx.lineTo(Math.floor(sx) + 13, Math.floor(sy) + 13);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#707070";
        ctx.beginPath();
        ctx.moveTo(Math.floor(sx) + 5, Math.floor(sy) + 11);
        ctx.lineTo(Math.floor(sx) + 8, Math.floor(sy) + 6);
        ctx.lineTo(Math.floor(sx) + 11, Math.floor(sy) + 11);
        ctx.closePath();
        ctx.fill();
        break;
      }

      case TileType.FENCE: {
        ctx.fillStyle = "#8b6b3a";
        // Posts
        ctx.fillRect(Math.floor(sx) + 2, Math.floor(sy) + 4, 2, 12);
        ctx.fillRect(Math.floor(sx) + 12, Math.floor(sy) + 4, 2, 12);
        // Rails
        ctx.fillRect(Math.floor(sx), Math.floor(sy) + 6, 16, 2);
        ctx.fillRect(Math.floor(sx), Math.floor(sy) + 12, 16, 2);
        break;
      }

      case TileType.BRIDGE: {
        // Wood planks
        ctx.fillStyle = "#a08050";
        ctx.fillRect(Math.floor(sx), Math.floor(sy), size, size);
        ctx.strokeStyle = "rgba(0,0,0,0.2)";
        ctx.lineWidth = 1;
        for (let i = 0; i < size; i += 4) {
          ctx.beginPath();
          ctx.moveTo(Math.floor(sx), Math.floor(sy) + i);
          ctx.lineTo(Math.floor(sx) + size, Math.floor(sy) + i);
          ctx.stroke();
        }
        // Side rails
        ctx.fillStyle = "#705830";
        ctx.fillRect(Math.floor(sx), Math.floor(sy), 2, size);
        ctx.fillRect(Math.floor(sx) + size - 2, Math.floor(sy), 2, size);
        break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Entity rendering
  // -------------------------------------------------------------------------

  private renderCat(camera: Camera, cat: CatState): void {
    const ctx = this.ctx;
    const screen = camera.worldToScreen(cat.x, cat.y);
    const x = Math.floor(screen.x);
    const y = Math.floor(screen.y);

    // Shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.beginPath();
    ctx.ellipse(x, y + 10, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    const facingRight =
      cat.facing === "E" || cat.facing === "NE" || cat.facing === "SE";
    const facingUp = cat.facing === "N" || cat.facing === "NE" || cat.facing === "NW";
    const mirror = facingRight ? 1 : -1;

    ctx.save();
    ctx.translate(x, y);

    // Body bob animation
    const bob = Math.sin(cat.animation_frame * 0.3) * 1.5;

    // Body (oval)
    ctx.fillStyle = "#ff9944";
    ctx.beginPath();
    ctx.ellipse(0, bob - 2, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Stripes
    ctx.fillStyle = "#dd7722";
    ctx.fillRect(-3, bob - 5, 2, 4);
    ctx.fillRect(1, bob - 5, 2, 4);

    // Head
    ctx.fillStyle = "#ffaa55";
    ctx.beginPath();
    ctx.ellipse(mirror * 5, bob - 6, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    ctx.fillStyle = "#ff9944";
    ctx.beginPath();
    ctx.moveTo(mirror * 2, bob - 9);
    ctx.lineTo(mirror * 3, bob - 14);
    ctx.lineTo(mirror * 6, bob - 9);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(mirror * 6, bob - 9);
    ctx.lineTo(mirror * 8, bob - 14);
    ctx.lineTo(mirror * 10, bob - 9);
    ctx.closePath();
    ctx.fill();

    // Inner ears
    ctx.fillStyle = "#ffbbaa";
    ctx.beginPath();
    ctx.moveTo(mirror * 3, bob - 9);
    ctx.lineTo(mirror * 4, bob - 12);
    ctx.lineTo(mirror * 5, bob - 9);
    ctx.closePath();
    ctx.fill();

    // Eyes
    ctx.fillStyle = "#222222";
    const eyeX = mirror * 4;
    const eyeY = bob - 7;
    ctx.fillRect(eyeX - 1, eyeY, 2, 2);
    ctx.fillRect(eyeX + mirror * 3, eyeY, 2, 2);

    // Eye shine
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(eyeX, eyeY, 1, 1);
    ctx.fillRect(eyeX + mirror * 3 + 1, eyeY, 1, 1);

    // Nose
    ctx.fillStyle = "#ff6688";
    ctx.fillRect(mirror * 7, bob - 5, 2, 1);

    // Tail
    ctx.strokeStyle = "#ff9944";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    const tailWag = Math.sin(cat.animation_frame * 0.5) * 3;
    ctx.beginPath();
    ctx.moveTo(-mirror * 6, bob - 1);
    ctx.quadraticCurveTo(
      -mirror * 12,
      bob - 8 + tailWag,
      -mirror * 14,
      bob - 12 + tailWag
    );
    ctx.stroke();

    // Legs (simple)
    ctx.fillStyle = "#dd8833";
    const legOffset = Math.sin(cat.animation_frame * 0.4) * 2;
    // Front legs
    ctx.fillRect(mirror * 2 - 1, bob + 2, 2, 4 + legOffset);
    ctx.fillRect(mirror * 4 - 1, bob + 2, 2, 4 - legOffset);
    // Back legs
    ctx.fillRect(-mirror * 3 - 1, bob + 2, 2, 4 - legOffset);
    ctx.fillRect(-mirror * 5 - 1, bob + 2, 2, 4 + legOffset);

    // Paws
    ctx.fillStyle = "#ffccaa";
    ctx.fillRect(mirror * 2 - 1, bob + 5 + legOffset, 2, 2);
    ctx.fillRect(mirror * 4 - 1, bob + 5 - legOffset, 2, 2);
    ctx.fillRect(-mirror * 3 - 1, bob + 5 - legOffset, 2, 2);
    ctx.fillRect(-mirror * 5 - 1, bob + 5 + legOffset, 2, 2);

    ctx.restore();

    // Damage flash
    if (cat.is_damaged) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = "#ff0044";
      ctx.beginPath();
      ctx.ellipse(x, y - 2, 12, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Eating particles
    if (cat.is_eating) {
      ctx.fillStyle = "#ffcc00";
      for (let i = 0; i < 4; i++) {
        const px =
          x + Math.cos(cat.animation_frame * 0.8 + i * 1.5) * 10;
        const py =
          y - 8 + Math.sin(cat.animation_frame * 0.8 + i * 1.5) * 6;
        ctx.fillRect(Math.floor(px), Math.floor(py), 2, 2);
      }
    }

    // Name label
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    ctx.fillText("NEUROKITTY", x, y - 18);
  }

  private renderEnemies(camera: Camera, enemies: Enemy[]): void {
    const ctx = this.ctx;

    for (const enemy of enemies) {
      const screen = camera.worldToScreen(enemy.x, enemy.y);
      const x = Math.floor(screen.x);
      const y = Math.floor(screen.y);

      // Skip if off screen
      if (x < -20 || y < -20 || x > ctx.canvas.width + 20 || y > ctx.canvas.height + 20)
        continue;

      const color = ENEMY_COLORS[enemy.type] || "#ff4444";

      // Shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      ctx.beginPath();
      ctx.ellipse(x, y + 8, 6, 2, 0, 0, Math.PI * 2);
      ctx.fill();

      switch (enemy.type) {
        case "slime": {
          const squish = Math.sin(enemy.animation_frame * 0.2) * 1.5;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.ellipse(x, y - 2 + squish, 6 + squish, 7 - squish, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.3)";
          ctx.beginPath();
          ctx.ellipse(x - 2, y - 5 + squish, 2, 3, -0.3, 0, Math.PI * 2);
          ctx.fill();
          // Eyes
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(x - 3, y - 4 + squish, 2, 3);
          ctx.fillRect(x + 1, y - 4 + squish, 2, 3);
          ctx.fillStyle = "#111111";
          ctx.fillRect(x - 2, y - 3 + squish, 1, 2);
          ctx.fillRect(x + 2, y - 3 + squish, 1, 2);
          break;
        }

        case "bat": {
          const wingFlap = Math.sin(enemy.animation_frame * 0.6) * 4;
          ctx.fillStyle = color;
          // Body
          ctx.beginPath();
          ctx.ellipse(x, y - 4, 4, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          // Wings
          ctx.beginPath();
          ctx.moveTo(x - 4, y - 4);
          ctx.lineTo(x - 12, y - 8 + wingFlap);
          ctx.lineTo(x - 8, y - 2 + wingFlap);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(x + 4, y - 4);
          ctx.lineTo(x + 12, y - 8 + wingFlap);
          ctx.lineTo(x + 8, y - 2 + wingFlap);
          ctx.closePath();
          ctx.fill();
          // Eyes
          ctx.fillStyle = "#ff4444";
          ctx.fillRect(x - 2, y - 5, 2, 2);
          ctx.fillRect(x + 1, y - 5, 2, 2);
          break;
        }

        case "spider": {
          ctx.fillStyle = color;
          // Body
          ctx.beginPath();
          ctx.ellipse(x, y - 3, 5, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          // Legs
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          for (let i = 0; i < 4; i++) {
            const angle = (-0.8 + i * 0.5) + Math.sin(enemy.animation_frame * 0.3 + i) * 0.2;
            ctx.beginPath();
            ctx.moveTo(x - 4, y - 3);
            ctx.lineTo(x - 4 - Math.cos(angle) * 8, y - 3 + Math.sin(angle) * 6);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x + 4, y - 3);
            ctx.lineTo(x + 4 + Math.cos(angle) * 8, y - 3 + Math.sin(angle) * 6);
            ctx.stroke();
          }
          // Eyes (many)
          ctx.fillStyle = "#ff2222";
          ctx.fillRect(x - 3, y - 5, 1, 1);
          ctx.fillRect(x - 1, y - 6, 1, 1);
          ctx.fillRect(x + 1, y - 6, 1, 1);
          ctx.fillRect(x + 3, y - 5, 1, 1);
          break;
        }

        case "ghost": {
          const float = Math.sin(enemy.animation_frame * 0.15) * 3;
          ctx.save();
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.ellipse(x, y - 6 + float, 6, 7, 0, 0, Math.PI);
          ctx.rect(x - 6, y - 6 + float, 12, 7);
          ctx.fill();
          // Wavy bottom
          for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.arc(x - 5 + i * 4, y + 1 + float, 2, 0, Math.PI);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
          // Eyes
          ctx.fillStyle = "#111133";
          ctx.beginPath();
          ctx.ellipse(x - 2, y - 6 + float, 2, 2.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(x + 3, y - 6 + float, 2, 2.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          break;
        }

        case "snake": {
          ctx.fillStyle = color;
          const segCount = 5;
          for (let s = 0; s < segCount; s++) {
            const sx2 =
              x - s * 4 + Math.sin(enemy.animation_frame * 0.25 + s * 0.8) * 2;
            const sy2 = y - 2;
            ctx.beginPath();
            ctx.arc(sx2, sy2, 3 - s * 0.3, 0, Math.PI * 2);
            ctx.fill();
          }
          // Eyes
          ctx.fillStyle = "#ffff00";
          ctx.fillRect(x + 1, y - 4, 2, 2);
          ctx.fillRect(x - 2, y - 4, 2, 2);
          // Tongue
          ctx.strokeStyle = "#ff4444";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + 3, y - 2);
          ctx.lineTo(x + 6, y - 3);
          ctx.lineTo(x + 7, y - 4);
          ctx.moveTo(x + 6, y - 3);
          ctx.lineTo(x + 7, y - 1);
          ctx.stroke();
          break;
        }

        case "beetle": {
          ctx.fillStyle = color;
          // Shell
          ctx.beginPath();
          ctx.ellipse(x, y - 3, 5, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          // Shell line
          ctx.strokeStyle = "#664400";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, y - 7);
          ctx.lineTo(x, y + 1);
          ctx.stroke();
          // Legs
          ctx.fillStyle = "#554422";
          for (let i = -1; i <= 1; i++) {
            ctx.fillRect(x - 7, y - 3 + i * 3, 3, 1);
            ctx.fillRect(x + 5, y - 3 + i * 3, 3, 1);
          }
          // Antennae
          ctx.strokeStyle = "#554422";
          ctx.beginPath();
          ctx.moveTo(x - 2, y - 7);
          ctx.lineTo(x - 4, y - 11);
          ctx.moveTo(x + 2, y - 7);
          ctx.lineTo(x + 4, y - 11);
          ctx.stroke();
          break;
        }

        default: {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y - 4, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Chase state indicator
      if (enemy.state === "chase") {
        ctx.fillStyle = "#ff0044";
        ctx.font = "bold 10px monospace";
        ctx.textAlign = "center";
        ctx.fillText("!", x, y - 14);
      }
    }
  }

  private renderBerries(camera: Camera, berries: Berry[]): void {
    const ctx = this.ctx;

    for (const berry of berries) {
      if (berry.collected) continue;

      const screen = camera.worldToScreen(berry.x, berry.y);
      const x = Math.floor(screen.x);
      const y = Math.floor(screen.y);

      if (x < -10 || y < -10 || x > ctx.canvas.width + 10 || y > ctx.canvas.height + 10)
        continue;

      const color = BERRY_COLORS[berry.type] || "#ff3344";

      // Glow
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Berry body
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();

      // Highlight
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.fillRect(x - 1, y - 2, 1, 1);

      // Stem
      ctx.strokeStyle = "#228822";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - 3);
      ctx.lineTo(x + 1, y - 5);
      ctx.stroke();

      // Leaf
      ctx.fillStyle = "#44aa44";
      ctx.beginPath();
      ctx.ellipse(x + 2, y - 5, 2, 1, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private renderRaycasts(
    camera: Camera,
    cat: CatState,
    raycasts: RaycastResult[]
  ): void {
    const ctx = this.ctx;
    const catScreen = camera.worldToScreen(cat.x, cat.y);

    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = "#00ff88";
    ctx.lineWidth = 1;

    for (const ray of raycasts) {
      const endX =
        catScreen.x + Math.cos(ray.angle) * ray.distance;
      const endY =
        catScreen.y + Math.sin(ray.angle) * ray.distance;

      ctx.beginPath();
      ctx.moveTo(catScreen.x, catScreen.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Hit marker
      if (ray.hit_type !== "none") {
        ctx.fillStyle =
          ray.hit_type === "enemy"
            ? "#ff0044"
            : ray.hit_type === "berry"
            ? "#00ff88"
            : "#ffaa00";
        ctx.fillRect(endX - 1, endY - 1, 3, 3);
      }
    }

    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // Minimap
  // -------------------------------------------------------------------------

  private renderMinimap(camera: Camera, gameState: GameState): void {
    const ctx = this.ctx;
    const mmWidth = 160;
    const mmHeight = 85;
    const mmX = 10;
    const mmY = ctx.canvas.height - mmHeight - 10;

    // Background
    ctx.fillStyle = "rgba(10, 10, 15, 0.85)";
    ctx.fillRect(mmX - 2, mmY - 2, mmWidth + 4, mmHeight + 4);
    ctx.strokeStyle = "rgba(0, 255, 136, 0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(mmX - 2, mmY - 2, mmWidth + 4, mmHeight + 4);

    // Build minimap if dirty
    if (this.minimapDirty || !this.minimapCanvas) {
      this.buildMinimapCache(mmWidth, mmHeight);
    }

    if (this.minimapCanvas) {
      ctx.drawImage(this.minimapCanvas, mmX, mmY, mmWidth, mmHeight);
    }

    // Scale factors
    const scaleX = mmWidth / (this.tilemap.width * this.tilemap.tile_size);
    const scaleY = mmHeight / (this.tilemap.height * this.tilemap.tile_size);

    // Viewport rectangle
    const bounds = camera.getVisibleBounds();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      mmX + bounds.left * scaleX,
      mmY + bounds.top * scaleY,
      (bounds.right - bounds.left) * scaleX,
      (bounds.bottom - bounds.top) * scaleY
    );

    // Enemies
    ctx.fillStyle = "#ff4444";
    for (const enemy of gameState.enemies) {
      ctx.fillRect(
        mmX + enemy.x * scaleX - 1,
        mmY + enemy.y * scaleY - 1,
        2,
        2
      );
    }

    // Berries
    ctx.fillStyle = "#ffcc00";
    for (const berry of gameState.berries) {
      if (!berry.collected) {
        ctx.fillRect(
          mmX + berry.x * scaleX,
          mmY + berry.y * scaleY,
          1,
          1
        );
      }
    }

    // Cat
    ctx.fillStyle = "#00ff88";
    ctx.fillRect(
      mmX + gameState.cat.x * scaleX - 2,
      mmY + gameState.cat.y * scaleY - 2,
      4,
      4
    );

    // Label
    ctx.fillStyle = "rgba(0, 255, 136, 0.6)";
    ctx.font = "7px monospace";
    ctx.fillText("MAP", mmX + 2, mmY - 4);
  }

  private buildMinimapCache(width: number, height: number): void {
    try {
      this.minimapCanvas = new OffscreenCanvas(width, height);
      const mmCtx = this.minimapCanvas.getContext("2d");
      if (!mmCtx) return;

      const tm = this.tilemap;
      const tileW = width / tm.width;
      const tileH = height / tm.height;

      for (let ty = 0; ty < tm.height; ty++) {
        for (let tx = 0; tx < tm.width; tx++) {
          const tileType = tm.tiles[ty]?.[tx];
          if (tileType === undefined) continue;
          mmCtx.fillStyle =
            MINIMAP_TILE_COLORS[tileType] || "#3a7030";
          mmCtx.fillRect(
            Math.floor(tx * tileW),
            Math.floor(ty * tileH),
            Math.ceil(tileW),
            Math.ceil(tileH)
          );
        }
      }

      this.minimapDirty = false;
    } catch {
      // OffscreenCanvas not supported in all environments
      this.minimapCanvas = null;
    }
  }
}
