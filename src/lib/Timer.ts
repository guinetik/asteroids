/**
 * Standalone RAF-based timer utility for UI-layer delays.
 * Independent of the game loop's TickHandler — owns its own RAF cycle.
 * Starts lazily on first timer, stops when empty (zero cost at idle).
 *
 * @author guinetik
 * @date 2026-04-07
 * @spec docs/superpowers/specs/2026-04-07-timer-design.md
 */

/** Opaque handle returned by timer creation methods, used for cancellation. */
export type TimerHandle = number

/** Maximum delta (seconds) per frame — prevents burst after tab-away. */
const MAX_DELTA_S = 0.1

/** Milliseconds → seconds conversion factor. */
const MS_TO_S = 1 / 1000

/** Internal entry tracking a single timed callback. */
interface TimerEntry {
  /** Unique handle for cancellation. */
  id: number
  /** Seconds accumulated so far. */
  elapsed: number
  /** Seconds until this entry fires. */
  delay: number
  /** Callback to invoke when delay elapses. */
  fn: () => void
  /** Next entry in a sequence chain (undefined for standalone timers). */
  next?: TimerEntry
}

/** Monotonically increasing handle counter. */
let nextId = 1

/** All currently active timer entries. */
const active: TimerEntry[] = []

/** RAF handle, 0 when loop is not running. */
let rafId = 0

/** Timestamp of the previous frame in ms, -1 when not yet seeded. */
let lastTime = -1

/**
 * Process one RAF frame: accumulate delta, fire completed entries, schedule next.
 * @param timeMs - RAF timestamp in milliseconds
 */
function frame(timeMs: number): void {
  if (lastTime < 0) {
    lastTime = timeMs
    rafId = requestAnimationFrame(frame)
    return
  }

  const rawDelta = (timeMs - lastTime) * MS_TO_S
  const dt = Math.min(rawDelta, MAX_DELTA_S)
  lastTime = timeMs

  for (let i = active.length - 1; i >= 0; i--) {
    const entry = active[i]!
    entry.elapsed += dt
    if (entry.elapsed >= entry.delay) {
      entry.fn()
      active.splice(i, 1)
      if (entry.next) {
        active.push(entry.next)
      }
    }
  }

  if (active.length > 0) {
    rafId = requestAnimationFrame(frame)
  } else {
    rafId = 0
    lastTime = -1
  }
}

/** Start the RAF loop if not already running. */
function ensureRunning(): void {
  if (rafId !== 0) return
  lastTime = -1
  rafId = requestAnimationFrame(frame)
}

/**
 * Standalone RAF-based timer utility for UI-layer delays.
 * Independent of the game loop's TickHandler — owns its own RAF cycle.
 * Starts lazily on first timer, stops when empty (zero cost at idle).
 */
export class Timer {
  /**
   * Fire `fn` once after `delaySec` seconds.
   * @param delaySec - delay in seconds before the callback fires
   * @param fn - callback to invoke
   * @returns handle for cancellation via {@link Timer.cancel}
   */
  static after(delaySec: number, fn: () => void): TimerHandle {
    const id = nextId++
    active.push({ id, elapsed: 0, delay: delaySec, fn })
    ensureRunning()
    return id
  }

  /**
   * Cancel a specific timer by handle. For sequences, cancels the entire chain.
   * @param handle - the handle returned by {@link Timer.after} or {@link Timer.sequence}
   */
  static cancel(handle: TimerHandle): void {
    const idx = active.findIndex((e) => e.id === handle)
    if (idx !== -1) active.splice(idx, 1)
    if (active.length === 0 && rafId !== 0) {
      cancelAnimationFrame(rafId)
      rafId = 0
      lastTime = -1
    }
  }

  /**
   * Cancel all active timers. Intended for scene teardown / onUnmounted.
   */
  static cancelAll(): void {
    active.length = 0
    if (rafId !== 0) {
      cancelAnimationFrame(rafId)
      rafId = 0
      lastTime = -1
    }
  }

  /**
   * Number of active timer entries (useful for tests/debugging).
   */
  static get activeCount(): number {
    return active.length
  }
}
