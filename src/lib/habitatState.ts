/**
 * Habitat interior state machine — tracks enter/leave transitions.
 *
 * Five phases: map → transitioning_in → waking_up → habitat → transitioning_out → map.
 * Provides transition progress (0–1) for scene animation and guards
 * to prevent invalid transitions.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-habitat-interior-design.md
 */

/** Possible phases of the habitat interior overlay. */
export type HabitatPhase =
  | 'map'
  | 'transitioning_in'
  | 'waking_up'
  | 'habitat'
  | 'transitioning_out'

/** Duration in seconds for the fade-out transition (map → interior). */
const ENTER_DURATION = 0.8

/**
 * Duration in seconds for the wake-up camera animation (lying → standing). Tuned to feel
 * cinematic — long enough that the player registers the ceiling, the head-tilt, and the
 * stand-up as separate beats rather than a single hurried pan.
 */
const WAKEUP_DURATION = 3.0

/** Duration in seconds for the exit transition (habitat → map). */
const EXIT_DURATION = 0.5

/**
 * Tracks the habitat interior lifecycle with transition timing.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-habitat-interior-design.md
 */
export class HabitatState {
  /** Current phase of the habitat interior. */
  phase: HabitatPhase = 'map'

  /** Elapsed time in the current transition phase. */
  private elapsed = 0

  /**
   * Set to `true` after the first `transitioning_in` completes. Subsequent entries
   * skip the `waking_up` cinematic and jump straight to `habitat` so the player
   * feels like they're stepping through the hatch rather than waking up in bed.
   */
  private visited = false

  /** Whether the habitat interior is active (any phase except map). */
  get isActive(): boolean {
    return this.phase !== 'map'
  }

  /**
   * True only on the very first entry this session — used by the facade to decide
   * whether to run the bed wake-up camera animation or snap to the hatch spawn.
   */
  get isFirstEntry(): boolean {
    return !this.visited
  }

  /**
   * Normalized transition progress (0–1) for the current phase.
   * - transitioning_in: 0 → 1 (fade out)
   * - waking_up: 0 → 1 (camera rises)
   * - habitat: 1
   * - transitioning_out: 1 → 0 (fade out)
   * - map: 0
   */
  get progress(): number {
    switch (this.phase) {
      case 'map':
        return 0
      case 'transitioning_in':
        return Math.min(1, this.elapsed / ENTER_DURATION)
      case 'waking_up':
        return Math.min(1, this.elapsed / WAKEUP_DURATION)
      case 'habitat':
        return 1
      case 'transitioning_out':
        return Math.max(0, 1 - this.elapsed / EXIT_DURATION)
    }
  }

  /**
   * Attempt to enter the habitat. Returns true if the transition started.
   * Blocked if not currently in the `map` phase.
   */
  enter(): boolean {
    if (this.phase !== 'map') return false
    this.phase = 'transitioning_in'
    this.elapsed = 0
    return true
  }

  /**
   * Attempt to leave the habitat. Returns true if the transition started.
   * Blocked if not currently in the `habitat` phase.
   */
  leave(): boolean {
    if (this.phase !== 'habitat') return false
    this.phase = 'transitioning_out'
    this.elapsed = 0
    return true
  }

  /**
   * Advance the transition timer. Automatically advances phase
   * when the duration is reached.
   *
   * @param dt - Frame delta in seconds
   */
  tick(dt: number): void {
    if (this.phase === 'transitioning_in') {
      this.elapsed += dt
      if (this.elapsed >= ENTER_DURATION) {
        if (!this.visited) {
          // First ever entry — run the bed wake-up cinematic.
          this.phase = 'waking_up'
          // visited stays false until waking_up finishes so handleEnter can
          // still read isFirstEntry = true when giving the player control.
        } else {
          // Return visit — skip straight to playable habitat; facade snaps to hatch spawn.
          this.phase = 'habitat'
        }
        this.elapsed = 0
      }
    } else if (this.phase === 'waking_up') {
      this.elapsed += dt
      if (this.elapsed >= WAKEUP_DURATION) {
        this.phase = 'habitat'
        this.visited = true // mark after cinematic completes so handleEnter sees isFirstEntry = true
        this.elapsed = 0
      }
    } else if (this.phase === 'transitioning_out') {
      this.elapsed += dt
      if (this.elapsed >= EXIT_DURATION) {
        this.phase = 'map'
        this.elapsed = 0
      }
    }
  }
}
