/**
 * Step-timer driven footstep audio for on-foot movement.
 *
 * Each step is synthesized procedurally (see `proceduralFootstep.ts`) so the
 * left/right cadence stays locked to the player's actual step interval and
 * never drifts the way a recorded loop pair could. Stereo, pitch, and
 * intensity are jittered per step so a long walk doesn't sound mechanical.
 *
 * @author guinetik
 * @date 2026-04-10
 * @spec docs/superpowers/specs/2026-04-18-procedural-footsteps-design.md
 */
import { useAudio } from '@/audio/useAudio'
import {
  type FootstepSurface,
  playProceduralFootstep,
} from '@/audio/proceduralFootstep'

/** Re-export so callers don't need to import the audio module directly. */
export type { FootstepSurface }

/** Minimum lateral speed (units/s) before a step is registered (EVA only). */
const MIN_MOVE_SPEED = 0.4

/** Seconds between steps per surface while walking. */
const WALK_INTERVAL: Record<FootstepSurface, number> = {
  habitat: 0.45,
  asteroid: 0.52,
}

/** Seconds between steps per surface while sprinting. */
const SPRINT_INTERVAL: Record<FootstepSurface, number> = {
  habitat: 0.32,
  asteroid: 0.36,
}

/** Stereo bias magnitude per foot. Negative = left, positive = right. */
const STEREO_BIAS = 0.45
/** Random pitch jitter half-range (1.0 ± this fraction). */
const PITCH_JITTER = 0.06
/** Random interval jitter half-range as a fraction of the base interval. */
const INTERVAL_JITTER = 0.08
/** Walk intensity in [0, 1] — feeds into procedural synth. */
const WALK_INTENSITY = 0.7
/** Sprint intensity in [0, 1] — louder + brighter steps. */
const SPRINT_INTENSITY = 1
/**
 * Output level multiplier on top of the sfx category gain. Procedural footsteps
 * are short transients and can read quiet at unity, so we scale them up here
 * to sit at a similar perceived level as recorded sfx.
 */
const FOOTSTEP_OUTPUT_GAIN = 1.4
/**
 * Hard floor on the gap between two consecutive steps, regardless of what
 * triggers them (rising edge of `isMoving`, scheduled timer, surface change,
 * etc.). Anything tighter than this is dropped — this is what prevents the
 * "drum machine" stutter when the player taps movement keys or `isMoving`
 * flickers across a single frame.
 *
 * Sized just below the sprint cadence so legitimate fast steps still pass.
 */
const MIN_STEP_GAP = 0.18

/**
 * Accumulates time while the player is moving and grounded, firing alternating
 * left/right procedural step sounds at a (jittered) fixed interval.
 *
 * Usage:
 * ```ts
 * const steps = new FootstepSystem('asteroid')
 * // in tick:
 * steps.update(dt, player.speed > 0.4, player.grounded, sprintHeld)
 * ```
 */
export class FootstepSystem {
  private stepTimer = 0
  private nextInterval: number
  private stepIndex = 0
  private surface: FootstepSurface
  private wasMoving = false
  private sprinting = false
  /** Seconds since the last actually-played step. Used as the cooldown gate. */
  private timeSinceLastStep = Infinity

  /**
   * @param surface - Which surface sound recipe to use.
   */
  constructor(surface: FootstepSurface) {
    this.surface = surface
    this.nextInterval = WALK_INTERVAL[surface]
  }

  /**
   * Change the active surface (e.g. when transitioning between zones).
   *
   * @param surface - New surface.
   */
  setSurface(surface: FootstepSurface): void {
    this.surface = surface
    this.stepTimer = 0
    this.nextInterval = this.baseInterval()
  }

  /**
   * Advance the step timer. Call once per frame with the frame delta.
   *
   * @param dt - Frame delta in seconds.
   * @param isMoving - True when the player has intentional lateral movement.
   * @param isGrounded - True when the player is on the ground. Pass `true` for
   *   flat-floor contexts (habitat) where the player is always grounded.
   * @param isSprinting - Optional flag to tighten cadence and boost intensity.
   */
  update(dt: number, isMoving: boolean, isGrounded: boolean, isSprinting = false): void {
    // Always advance the cooldown so it expires while standing still too.
    this.timeSinceLastStep += dt

    if (!isMoving || !isGrounded) {
      this.stepTimer = 0
      this.wasMoving = false
      this.sprinting = false
      return
    }

    this.sprinting = isSprinting

    // Fire the first step immediately on the rising edge so the player hears
    // it as soon as they start moving instead of after a full interval delay.
    // The cooldown inside `_tryPlayStep` prevents this from spamming when
    // `isMoving` flickers across consecutive frames.
    if (!this.wasMoving) {
      this.wasMoving = true
      this.stepTimer = 0
      this.nextInterval = this.jitteredInterval()
      this._tryPlayStep()
      return
    }

    this.stepTimer += dt
    if (this.stepTimer >= this.nextInterval) {
      this.stepTimer -= this.nextInterval
      this.nextInterval = this.jitteredInterval()
      this._tryPlayStep()
    }
  }

  /** Reset the timer and movement state (e.g. on landing after a jump). */
  reset(): void {
    this.stepTimer = 0
    this.wasMoving = false
    this.sprinting = false
    this.timeSinceLastStep = Infinity
  }

  private baseInterval(): number {
    return this.sprinting ? SPRINT_INTERVAL[this.surface] : WALK_INTERVAL[this.surface]
  }

  private jitteredInterval(): number {
    const base = this.baseInterval()
    const jitter = (Math.random() * 2 - 1) * INTERVAL_JITTER * base
    return Math.max(0.08, base + jitter)
  }

  /**
   * Cooldown-gated step trigger. Drops the request silently if the previous
   * step was too recent — never queues, never overlaps. This is the single
   * choke point that prevents the "drum machine" stutter no matter what
   * upstream timing logic does.
   */
  private _tryPlayStep(): void {
    if (this.timeSinceLastStep < MIN_STEP_GAP) return

    // Even index = left foot (-pan), odd index = right foot (+pan).
    const isRight = (this.stepIndex & 1) === 1
    const stereo = isRight ? STEREO_BIAS : -STEREO_BIAS
    const pitchScale = 1 + (Math.random() * 2 - 1) * PITCH_JITTER
    const intensity = this.sprinting ? SPRINT_INTENSITY : WALK_INTENSITY
    const sfxVolume = useAudio().getCategoryVolume('sfx')

    const played = playProceduralFootstep({
      surface: this.surface,
      stereo,
      pitchScale,
      intensity,
      volume: Math.min(1, sfxVolume * FOOTSTEP_OUTPUT_GAIN),
    })

    // Only advance the foot index and reset the cooldown when we actually
    // played a sound — keeps L/R alternation tight if a voice was dropped
    // by the global concurrency cap inside `proceduralFootstep`.
    if (played) {
      this.stepIndex++
      this.timeSinceLastStep = 0
    }
  }
}

export { MIN_MOVE_SPEED }
