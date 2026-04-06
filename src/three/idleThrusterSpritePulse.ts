/**
 * Pulse helper for rear-engine idle flame sprites.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */

/** Pulse sample for an idle thruster sprite frame. */
export interface IdleThrusterSpritePulse {
  /** Sprite opacity for the current pulse sample. */
  opacity: number
  /** Sprite scale multiplier for the current pulse sample. */
  scale: number
}

const IDLE_THRUSTER_PULSE_FREQUENCY = 4
const IDLE_THRUSTER_MIN_OPACITY = 0.24
const IDLE_THRUSTER_MAX_OPACITY = 0.5
const IDLE_THRUSTER_MIN_SCALE = 0.65
const IDLE_THRUSTER_MAX_SCALE = 1

/**
 * Returns a deterministic pulse sample for the rear-engine idle flame.
 *
 * @param elapsedTime - Animation time in seconds.
 * @returns Opacity and scale for the current pulse frame.
 */
export function getIdleThrusterSpritePulse(elapsedTime: number): IdleThrusterSpritePulse {
  const wave = 0.5 + 0.5 * Math.cos(elapsedTime * IDLE_THRUSTER_PULSE_FREQUENCY * Math.PI * 2)

  return {
    opacity: IDLE_THRUSTER_MIN_OPACITY
      + (IDLE_THRUSTER_MAX_OPACITY - IDLE_THRUSTER_MIN_OPACITY) * wave,
    scale: IDLE_THRUSTER_MIN_SCALE
      + (IDLE_THRUSTER_MAX_SCALE - IDLE_THRUSTER_MIN_SCALE) * wave,
  }
}
