import type { Tickable } from './Tickable'

/** Internal entry pairing a tickable with its dispatch priority. */
interface TickEntry {
  tickable: Tickable
  priority: number
}

/**
 * Per-frame timing record produced when profiling is enabled. The same array
 * instance is reused across frames — copy if you need to hold onto a snapshot.
 */
export interface TickProfileSample {
  /**
   * {@link Tickable.tickDebugLabel}, else `constructor.name`, else `AnonymousTickable`
   * for plain object tickables.
   */
  name: string
  /** Wall-clock milliseconds spent inside this tickable's `tick()` call. */
  ms: number
}

const DEFAULT_PRIORITY = 0

/**
 * Display string for one tickable in profiling output. Plain object literals get
 * `Object` from `constructor.name` — use {@link Tickable.tickDebugLabel} instead.
 */
function tickProfileDisplayName(tickable: Tickable): string {
  const custom = tickable.tickDebugLabel?.trim()
  if (custom) return custom
  const ctor = tickable.constructor?.name ?? ''
  if (ctor && ctor !== 'Object') return ctor
  return 'AnonymousTickable'
}

/**
 * Central registry for per-frame update callbacks, dispatched in priority order.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
export class TickHandler {
  private entries: TickEntry[] = []
  private profilingEnabled = false
  private readonly lastSamples: TickProfileSample[] = []

  register(tickable: Tickable, priority: number = DEFAULT_PRIORITY): void {
    if (this.entries.some((e) => e.tickable === tickable)) return
    this.entries.push({ tickable, priority })
    this.entries.sort((a, b) => a.priority - b.priority)
  }

  unregister(tickable: Tickable): void {
    this.entries = this.entries.filter((e) => e.tickable !== tickable)
  }

  /**
   * Toggle per-tickable wall-clock measurement. Off by default — only enable
   * from debug instrumentation, since each frame allocates a sample slot per
   * registered tickable.
   *
   * @param enabled - True to record per-frame timings.
   */
  setProfilingEnabled(enabled: boolean): void {
    this.profilingEnabled = enabled
    if (!enabled) this.lastSamples.length = 0
  }

  /**
   * Most recent frame's per-tickable timings, ordered by registration priority.
   * Empty when profiling is disabled.
   *
   * @returns Read-only view of the live samples buffer.
   */
  getLastTickTimings(): readonly TickProfileSample[] {
    return this.lastSamples
  }

  tick(dt: number): void {
    if (!this.profilingEnabled) {
      for (const entry of this.entries) {
        entry.tickable.tick(dt)
      }
      return
    }

    const samples = this.lastSamples
    samples.length = 0
    for (const entry of this.entries) {
      const start = performance.now()
      entry.tickable.tick(dt)
      const ms = performance.now() - start
      samples.push({ name: tickProfileDisplayName(entry.tickable), ms })
    }
  }
}
