/**
 * Types for the ice harvest orbital minigame.
 *
 * @author guinetik
 * @date 2026-04-11
 * @spec docs/superpowers/specs/2026-04-10-orbital-minigame-design.md
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

/** Size category of an ice chunk — determines shard yield and hull damage. */
export type IceChunkSize = 'small' | 'medium' | 'large'

/** An ice chunk drifting through the ring plane. */
export interface IceChunk {
  /** Horizontal position in canvas pixels. */
  x: number
  /** Vertical position in canvas pixels. */
  y: number
  /** Horizontal velocity in px/s (negative = moving left). */
  vx: number
  /** Vertical velocity in px/s (slight drift). */
  vy: number
  /** Size category. */
  size: IceChunkSize
  /** Collision radius in px. */
  radius: number
  /** Whether this chunk has been shattered by a harpoon. */
  shattered: boolean
}

/** A collectible ice shard left after a chunk is shattered. */
export interface IceShard {
  /** Horizontal position in canvas pixels. */
  x: number
  /** Vertical position in canvas pixels. */
  y: number
  /** Horizontal velocity in px/s. */
  vx: number
  /** Vertical velocity in px/s. */
  vy: number
  /** Time remaining before this shard evaporates (seconds). */
  ttl: number
  /** Whether this shard has been collected by the ship. */
  collected: boolean
  /** Ice units this shard is worth. */
  value: number
}

/** A titanium harpoon projectile. */
export interface Harpoon {
  /** Horizontal position in canvas pixels. */
  x: number
  /** Vertical position in canvas pixels. */
  y: number
  /** Horizontal velocity in px/s. */
  vx: number
  /** Vertical velocity in px/s. */
  vy: number
  /** Time since launch in seconds. */
  airTime: number
}
