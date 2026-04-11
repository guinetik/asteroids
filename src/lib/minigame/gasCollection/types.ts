/**
 * Types for the gas collection orbital minigame.
 *
 * @author guinetik
 * @date 2026-04-11
 * @spec docs/superpowers/specs/2026-04-10-gas-collection-minigame-design.md
 */

/** WASD input state for ship movement. */
export interface ShipInput {
  /** W key held. */
  up: boolean
  /** S key held. */
  down: boolean
  /** A key held. */
  left: boolean
  /** D key held. */
  right: boolean
}

/** A drone in flight. */
export interface Drone {
  /** Horizontal position in canvas pixels. */
  x: number
  /** Vertical position in canvas pixels. */
  y: number
  /** Horizontal velocity in px/s. */
  vx: number
  /** Vertical velocity in px/s. */
  vy: number
  /** Seconds since launch. */
  airTime: number
  /** Whether this drone has been collected. */
  collected: boolean
}
