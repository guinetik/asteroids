/**
 * Orbit capture system — manages transitions between free flight, orbital insertion,
 * and established orbit states.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/asteroid-lander-gdd.md
 */

/** Possible states in the orbit state machine. */
export type OrbitCaptureState = 'free' | 'approaching' | 'orbiting'

/**
 * HUD state for OrbitPrompt.vue — represents the orbit system's current state
 * and relevant metrics to display to the player.
 */
export interface OrbitHudState {
  /** Current state of the orbit machine. */
  state: OrbitCaptureState
  /** Name of the nearest celestial body, or null if no valid target. */
  nearestBodyName: string | null
  /** Current orbital speed when in 'orbiting' state, in game units/second. */
  orbitalSpeed: number
  /** Speed gained from a slingshot launch when available. */
  slingshotSpeed: number
}
