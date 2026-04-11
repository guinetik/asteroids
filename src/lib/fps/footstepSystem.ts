/**
 * Step-timer driven footstep audio for on-foot movement.
 *
 * Alternates between two surface-specific sounds each time the accumulated
 * travel time exceeds the step interval. Both callers (habitat and EVA)
 * share the same logic; only the surface changes.
 *
 * @author guinetik
 * @date 2026-04-10
 * @spec docs/superpowers/specs/2026-04-06-habitat-interior-design.md
 */
import { useAudio } from '@/audio/useAudio'

/** Surfaces that have footstep sound pairs. */
export type FootstepSurface = 'habitat' | 'asteroid'

/** Minimum lateral speed (units/s) before a step is registered (EVA only). */
const MIN_MOVE_SPEED = 0.4

/** Seconds between steps per surface. */
const STEP_INTERVAL: Record<FootstepSurface, number> = {
  habitat: 0.45,
  asteroid: 0.52,
}

/**
 * Accumulates time while the player is moving and grounded, firing alternating
 * step sounds at a fixed interval.
 *
 * Usage:
 * ```ts
 * const steps = new FootstepSystem('asteroid')
 * // in tick:
 * steps.update(dt, player.speed > 0.4, player.grounded)
 * ```
 */
export class FootstepSystem {
  private stepTimer = 0
  private stepIndex = 0
  private surface: FootstepSurface
  private wasMoving = false

  /**
   * @param surface - Which surface sound pair to use.
   */
  constructor(surface: FootstepSurface) {
    this.surface = surface
  }

  /**
   * Change the active surface (e.g. when transitioning between zones).
   *
   * @param surface - New surface.
   */
  setSurface(surface: FootstepSurface): void {
    this.surface = surface
    this.stepTimer = 0
  }

  /**
   * Advance the step timer. Call once per frame with the frame delta.
   *
   * @param dt - Frame delta in seconds.
   * @param isMoving - True when the player has intentional lateral movement.
   * @param isGrounded - True when the player is on the ground. Pass `true` for
   *   flat-floor contexts (habitat) where the player is always grounded.
   */
  update(dt: number, isMoving: boolean, isGrounded: boolean): void {
    if (!isMoving || !isGrounded) {
      this.stepTimer = 0
      this.wasMoving = false
      return
    }

    // Fire the first step immediately on the rising edge so the player hears
    // it as soon as they start moving instead of after a full interval delay.
    if (!this.wasMoving) {
      this.wasMoving = true
      this.stepTimer = 0
      this._playStep()
      return
    }

    this.stepTimer += dt
    const interval = STEP_INTERVAL[this.surface]
    if (this.stepTimer >= interval) {
      this.stepTimer -= interval
      this._playStep()
    }
  }

  /** Reset the timer and movement state (e.g. on landing after a jump). */
  reset(): void {
    this.stepTimer = 0
    this.wasMoving = false
  }

  private _playStep(): void {
    const n = (this.stepIndex % 2) + 1
    this.stepIndex++
    useAudio().play(`sfx.step.${this.surface}.${n}` as `sfx.step.${FootstepSurface}.${1 | 2}`)
  }
}

export { MIN_MOVE_SPEED }
