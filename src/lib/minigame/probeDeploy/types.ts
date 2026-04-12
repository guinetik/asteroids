/**
 * Types for the probe deploy orbital minigame.
 *
 * @author guinetik
 * @date 2026-04-11
 * @spec docs/superpowers/specs/2026-04-11-probe-deploy-minigame-design.md
 */

/** Vertical-only input state for ship movement. */
export interface ShipInput {
  /** W key held. */
  up: boolean
  /** S key held. */
  down: boolean
}

/** Size category of a meteorite. */
export type MeteoriteSize = 'small' | 'medium' | 'large'

/** A meteorite drifting across the play area. */
export interface Meteorite {
  /** Horizontal position in canvas pixels. */
  x: number
  /** Vertical position in canvas pixels. */
  y: number
  /** Horizontal velocity in px/s (negative = moving left). */
  vx: number
  /** Vertical drift velocity in px/s. */
  vy: number
  /** Size category. */
  size: MeteoriteSize
  /** Collision radius in px. */
  radius: number
}

/** A probe in flight toward the planet. */
export interface Probe {
  /** Horizontal position in canvas pixels. */
  x: number
  /** Vertical position in canvas pixels (fixed at launch Y). */
  y: number
  /** Horizontal speed in px/s (positive = moving right). */
  speed: number
  /** Whether this probe has reached the planet or been consumed. */
  consumed: boolean
}

/** A target zone on the planet surface. */
export interface PlanetTarget {
  /** Fixed angle on the planet surface in radians. */
  surfaceAngle: number
  /** Current world X position (computed from rotation). */
  x: number
  /** Current world Y position (computed from rotation). */
  y: number
  /** Visual radius in px. */
  radius: number
  /** Whether this target has been successfully hit. */
  hit: boolean
  /** Pulse animation offset. */
  pulseOffset: number
}
