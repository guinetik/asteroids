/**
 * Suspension-lapse timer for Bunker Protect missions. Counts down from
 * arrival on the asteroid; expiry hard-fails the mission unless every wave
 * has been cleared AND the cylinder has been rebooted.
 *
 * Pure — no Three.js, no Vue. Tick state immutably with
 * `tickSuspensionLapseTimer`.
 *
 * @author guinetik
 * @date 2026-05-11
 * @spec docs/superpowers/specs/2026-05-11-yamada-mission-pool-design.md
 */

/** Immutable timer state. Use {@link tickSuspensionLapseTimer} to advance. */
export interface SuspensionLapseTimerState {
  /** Total configured seconds (immutable after creation). */
  readonly total: number
  /** Seconds remaining; clamped to 0. */
  readonly remaining: number
  /** Latched true once remaining reaches 0. */
  readonly expired: boolean
}

/**
 * Build a fresh timer.
 *
 * @param totalSeconds - Total countdown duration.
 */
export function createSuspensionLapseTimer(totalSeconds: number): SuspensionLapseTimerState {
  return { total: totalSeconds, remaining: totalSeconds, expired: false }
}

/**
 * Advance the timer by `dt` seconds. Pure — returns a new state. Zero or
 * negative `dt` is a no-op; once expired, the state stays expired.
 *
 * @param state - Previous state.
 * @param dt - Delta time, in seconds.
 */
export function tickSuspensionLapseTimer(
  state: SuspensionLapseTimerState,
  dt: number,
): SuspensionLapseTimerState {
  if (state.expired || dt <= 0) {
    return state
  }
  const remaining = Math.max(0, state.remaining - dt)
  return {
    total: state.total,
    remaining,
    expired: remaining === 0,
  }
}
