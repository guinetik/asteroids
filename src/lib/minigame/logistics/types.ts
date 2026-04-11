/**
 * Types for the logistics route orbital minigame.
 *
 * @author guinetik
 * @date 2026-04-11
 * @spec docs/superpowers/specs/2026-04-11-logistics-route-minigame-design.md
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

/** Route symbol shape types. */
export type RouteSymbolType = 'star' | 'diamond' | 'circle' | 'triangle' | 'square'

/** All available route symbol types. */
export const ROUTE_SYMBOL_TYPES: readonly RouteSymbolType[] = [
  'star',
  'diamond',
  'circle',
  'triangle',
  'square',
]

/** A route symbol scrolling down a shipping lane. */
export interface RouteSymbol {
  /** Horizontal position in canvas pixels (lane-centered). */
  x: number
  /** Vertical position in canvas pixels. */
  y: number
  /** The symbol shape type. */
  type: RouteSymbolType
  /** Which lane this symbol occupies (0-based). */
  lane: number
  /** Whether this symbol has been collected by the player. */
  collected: boolean
}

/** A traffic shuttle scrolling down a shipping lane. */
export interface TrafficShuttle {
  /** Horizontal position in canvas pixels. */
  x: number
  /** Vertical position in canvas pixels. */
  y: number
  /** Vertical scroll speed in px/s (positive = moving down). */
  speed: number
  /** Visual size multiplier (0.6–1.0). */
  size: number
  /** Which lane this shuttle occupies (0-based). */
  lane: number
  /** Visual opacity (0.3–0.6). */
  alpha: number
}
