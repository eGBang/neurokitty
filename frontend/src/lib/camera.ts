// ============================================================================
// NEUROKITTY - Camera System
// Smooth-follow camera with viewport clamping and screen shake
// ============================================================================

export class Camera {
  /** Current camera center position in world coordinates */
  x: number = 0;
  y: number = 0;

  /** Viewport dimensions in pixels */
  viewportWidth: number = 800;
  viewportHeight: number = 600;

  /** World bounds */
  worldWidth: number = 2800;
  worldHeight: number = 1500;

  /** Smooth follow interpolation speed */
  private static readonly LERP_SPEED = 0.08;

  /** Screen shake state */
  private shakeIntensity: number = 0;
  private shakeDuration: number = 0;
  private shakeTimer: number = 0;
  private shakeOffsetX: number = 0;
  private shakeOffsetY: number = 0;

  /** Target position for smooth follow */
  private targetX: number = 0;
  private targetY: number = 0;

  constructor(
    viewportWidth: number,
    viewportHeight: number,
    worldWidth: number = 2800,
    worldHeight: number = 1500
  ) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
  }

  /** Set the target position (usually the cat's position) */
  setTarget(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
  }

  /** Update camera position with smooth interpolation */
  update(deltaTime: number): void {
    // Lerp toward target
    const lerpFactor = 1 - Math.pow(1 - Camera.LERP_SPEED, deltaTime * 60);
    this.x += (this.targetX - this.x) * lerpFactor;
    this.y += (this.targetY - this.y) * lerpFactor;

    // Clamp to world bounds
    const halfW = this.viewportWidth / 2;
    const halfH = this.viewportHeight / 2;

    this.x = Math.max(halfW, Math.min(this.worldWidth - halfW, this.x));
    this.y = Math.max(halfH, Math.min(this.worldHeight - halfH, this.y));

    // Update screen shake
    if (this.shakeTimer > 0) {
      this.shakeTimer -= deltaTime;
      const progress = this.shakeTimer / this.shakeDuration;
      const currentIntensity = this.shakeIntensity * progress;
      this.shakeOffsetX =
        (Math.random() * 2 - 1) * currentIntensity;
      this.shakeOffsetY =
        (Math.random() * 2 - 1) * currentIntensity;
    } else {
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }
  }

  /** Trigger screen shake effect (e.g., on damage) */
  shake(intensity: number = 5, duration: number = 0.3): void {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
    this.shakeTimer = duration;
  }

  /** Convert world coordinates to screen coordinates */
  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x:
        worldX -
        (this.x - this.viewportWidth / 2) +
        this.shakeOffsetX,
      y:
        worldY -
        (this.y - this.viewportHeight / 2) +
        this.shakeOffsetY,
    };
  }

  /** Convert screen coordinates to world coordinates */
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: screenX + (this.x - this.viewportWidth / 2) - this.shakeOffsetX,
      y: screenY + (this.y - this.viewportHeight / 2) - this.shakeOffsetY,
    };
  }

  /** Get the visible region in world coordinates */
  getVisibleBounds(): {
    left: number;
    top: number;
    right: number;
    bottom: number;
  } {
    const halfW = this.viewportWidth / 2;
    const halfH = this.viewportHeight / 2;
    return {
      left: this.x - halfW - 32, // small padding for partially visible tiles
      top: this.y - halfH - 32,
      right: this.x + halfW + 32,
      bottom: this.y + halfH + 32,
    };
  }

  /** Resize the viewport */
  resize(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  /** Instantly snap camera to position (no lerp) */
  snapTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.targetX = x;
    this.targetY = y;
  }
}
