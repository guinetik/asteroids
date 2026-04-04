import type { Tickable } from './Tickable'

/** Internal entry pairing a tickable with its dispatch priority. */
interface TickEntry {
  tickable: Tickable
  priority: number
}

const DEFAULT_PRIORITY = 0

/**
 * Central registry for per-frame update callbacks, dispatched in priority order.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
export class TickHandler {
  private entries: TickEntry[] = []

  register(tickable: Tickable, priority: number = DEFAULT_PRIORITY): void {
    if (this.entries.some((e) => e.tickable === tickable)) return
    this.entries.push({ tickable, priority })
    this.entries.sort((a, b) => a.priority - b.priority)
  }

  unregister(tickable: Tickable): void {
    this.entries = this.entries.filter((e) => e.tickable !== tickable)
  }

  tick(dt: number): void {
    for (const entry of this.entries) {
      entry.tickable.tick(dt)
    }
  }
}
