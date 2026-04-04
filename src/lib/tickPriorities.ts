/**
 * Priority bands for TickHandler registration.
 * Lower priority = earlier execution. Input reads first,
 * then physics updates, then animations, then rendering.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
export const TICK_PRIORITY_INPUT = 0
export const TICK_PRIORITY_PHYSICS = 10
export const TICK_PRIORITY_ANIMATION = 20
export const TICK_PRIORITY_RENDER = 30
