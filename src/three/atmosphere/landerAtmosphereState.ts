/**
 * Maps lander controller state into the shared atmosphere context.
 *
 * Uses the lander's support-based altitude sampling so thruster wash effects
 * stay aligned with the same ground contact the physics system uses.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/superpowers/specs/2026-04-06-atmosphere-effects-design.md
 */
import type { AtmosphereContext } from './AtmosphereContext'

/**
 * Minimal lander shape needed to populate atmosphere state.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/superpowers/specs/2026-04-06-atmosphere-effects-design.md
 */
export interface LanderAtmosphereSource {
  /** Support-based altitude above ground under the lander footprint. */
  altitudeAboveGround: number
  /** Whether the main engine is currently firing. */
  isMainEngineActive: boolean
  /** Physics body state used by atmosphere effects. */
  body: {
    /** Vertical speed in m/s. Negative = falling. */
    velocityY: number
    /** Whether the lander is currently resting on support. */
    grounded: boolean
  }
  /** Current lander world position. */
  position: {
    /** World X coordinate. */
    x: number
    /** World Y coordinate. */
    y: number
    /** World Z coordinate. */
    z: number
  }
}

/**
 * Copy the current lander runtime state into the shared atmosphere context.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/superpowers/specs/2026-04-06-atmosphere-effects-design.md
 */
export function applyLanderAtmosphereState(
  ctx: AtmosphereContext,
  lander: LanderAtmosphereSource,
): void {
  ctx.landerAltitude = Math.max(0, lander.altitudeAboveGround)
  ctx.landerThrust = lander.isMainEngineActive ? 1 : 0
  ctx.landerVelocityY = lander.body.velocityY
  ctx.landerGrounded = lander.body.grounded
  ctx.landerPosition.set(lander.position.x, lander.position.y, lander.position.z)
}
