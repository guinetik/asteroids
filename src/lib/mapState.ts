/**
 * Map overlay state machine — tracks open/close transitions.
 *
 * Four phases: closed → opening → open → closing → closed.
 * Provides transition progress (0–1) for camera animation
 * and guards to prevent invalid transitions.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-map-overlay-design.md
 */

/** Possible phases of the map overlay. */
export type MapPhase = 'closed' | 'opening' | 'open' | 'closing'

/** Duration in seconds for the opening transition (perspective pull-up + ortho zoom). */
const OPEN_DURATION = 1.0

/** Duration in seconds for the closing transition. */
const CLOSE_DURATION = 0.5

/**
 * Tracks the map overlay lifecycle with transition timing.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-map-overlay-design.md
 */
export class MapState {
  /** Current phase of the map overlay. */
  phase: MapPhase = 'closed'

  /** Elapsed time in current transition phase. */
  private elapsed = 0

  /** Whether the map is visible (opening, open, or closing). */
  get isOpen(): boolean {
    return this.phase !== 'closed'
  }

  /**
   * Normalized transition progress (0–1).
   * During opening: 0 → 1. During open: 1. During closing: 1 → 0. During closed: 0.
   */
  get progress(): number {
    switch (this.phase) {
      case 'closed':
        return 0
      case 'opening':
        return Math.min(1, this.elapsed / OPEN_DURATION)
      case 'open':
        return 1
      case 'closing':
        return Math.max(0, 1 - this.elapsed / CLOSE_DURATION)
    }
  }

  /**
   * Attempt to open the map. Returns true if the transition started.
   * Blocked if already opening or open.
   */
  open(): boolean {
    if (this.phase !== 'closed') return false
    this.phase = 'opening'
    this.elapsed = 0
    return true
  }

  /**
   * Attempt to close the map. Returns true if the transition started.
   * Blocked if already closed or closing.
   */
  close(): boolean {
    if (this.phase !== 'open') return false
    this.phase = 'closing'
    this.elapsed = 0
    return true
  }

  /**
   * Advance the transition timer. Automatically advances phase
   * when duration is reached.
   *
   * @param dt - Frame delta in seconds
   */
  tick(dt: number): void {
    if (this.phase === 'opening') {
      this.elapsed += dt
      if (this.elapsed >= OPEN_DURATION) {
        this.phase = 'open'
        this.elapsed = 0
      }
    } else if (this.phase === 'closing') {
      this.elapsed += dt
      if (this.elapsed >= CLOSE_DURATION) {
        this.phase = 'closed'
        this.elapsed = 0
      }
    }
  }
}
