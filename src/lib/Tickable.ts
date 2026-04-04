/**
 * Contract for objects that receive per-frame updates from the game loop.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
export interface Tickable {
  tick(dt: number): void
}
