/**
 * Contract for objects that receive per-frame updates from the game loop.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
export interface Tickable {
  tick(dt: number): void
  /**
   * Stable label for debug profilers when this instance is a plain object literal
   * (`constructor.name` is `Object`). Classes should omit this — the profiler uses
   * `constructor.name` instead.
   */
  tickDebugLabel?: string
}
