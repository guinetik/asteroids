/**
 * Platformer-style gravity body for constant downward acceleration.
 *
 * NOT the same as orbital gravity (inverse-square wells on the XZ plane).
 * This is simple "things fall down" physics: constant acceleration along
 * the Y axis with ground collision detection against a floor height.
 *
 * Reusable across any scene that needs platformer physics (lander, rover, etc.).
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd.md
 */

/** Gravity presets in m/s² (game units per second²). */
export const GRAVITY_MOON = 1.62
export const GRAVITY_EARTH = 9.81
export const GRAVITY_MARS = 3.72
export const GRAVITY_CERES = 0.28

/** Configuration for a platformer physics body. */
export interface PlatformerBodyConfig {
  /** Downward acceleration in units/s² */
  gravity: number
  /** Maximum downward velocity (terminal velocity) */
  terminalVelocity?: number
}

const DEFAULT_TERMINAL_VELOCITY = 100

/**
 * Tracks vertical velocity and applies constant downward gravity.
 * Call {@link tick} each frame with the current floor height to get
 * the new Y position back.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd.md
 */
export class PlatformerBody {
  /** Current vertical velocity (positive = up, negative = down) */
  velocityY = 0

  /** Whether the body is currently resting on the ground */
  grounded = false

  private readonly gravity: number
  private readonly terminalVelocity: number

  constructor(config: PlatformerBodyConfig) {
    this.gravity = config.gravity
    this.terminalVelocity = config.terminalVelocity ?? DEFAULT_TERMINAL_VELOCITY
  }

  /**
   * Advance one frame of platformer physics.
   *
   * @param dt - Delta time in seconds
   * @param currentY - Object's current Y position
   * @param floorY - Y position of the ground surface below the object
   * @returns The new Y position after gravity and ground collision
   */
  tick(dt: number, currentY: number, floorY: number): number {
    // Apply gravity (downward = negative Y)
    this.velocityY -= this.gravity * dt

    // Clamp to terminal velocity
    if (this.velocityY < -this.terminalVelocity) {
      this.velocityY = -this.terminalVelocity
    }

    let newY = currentY + this.velocityY * dt

    // Ground collision
    if (newY <= floorY) {
      newY = floorY
      this.velocityY = 0
      this.grounded = true
    } else {
      this.grounded = false
    }

    return newY
  }

  /**
   * Apply an instantaneous upward impulse (e.g. thruster firing).
   *
   * @param force - Upward velocity to add (units/s)
   */
  impulse(force: number): void {
    this.velocityY += force
    if (this.velocityY > 0) {
      this.grounded = false
    }
  }
}
