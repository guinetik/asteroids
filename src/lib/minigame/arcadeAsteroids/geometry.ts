/**
 * Geometry helpers for vector-style arcade Asteroids entities.
 *
 * @author guinetik
 * @date 2026-05-09
 * @spec docs/superpowers/specs/2026-05-09-arcade-asteroids-design.md
 */

import { ASTEROIDS_GAME_CONFIG } from './config'
import { randomRange } from './rng'
import type { RandomSource } from './types'

/** Two-dimensional vector point in normalized or pixel coordinates. */
export interface VectorPoint {
  /** Horizontal coordinate. */
  x: number
  /** Vertical coordinate. */
  y: number
}

/**
 * Wrap a coordinate so entities leave one edge and return from the opposite edge.
 *
 * @param value - Coordinate to wrap.
 * @param max - Viewport maximum for that axis.
 * @param radius - Entity radius used as the offscreen wrap margin.
 */
export function wrapCoordinate(value: number, max: number, radius: number): number {
  if (value < -radius) return max + radius
  if (value > max + radius) return -radius
  return value
}

/**
 * Test circular collision using squared distance.
 *
 * @param ax - First circle x.
 * @param ay - First circle y.
 * @param ar - First circle radius.
 * @param bx - Second circle x.
 * @param by - Second circle y.
 * @param br - Second circle radius.
 */
export function circlesOverlap(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
): boolean {
  const dx = ax - bx
  const dy = ay - by
  const r = ar + br
  return dx * dx + dy * dy <= r * r
}

/**
 * Build an irregular unit-radius asteroid outline.
 *
 * @param random - Source returning values in [0, 1).
 */
export function buildAsteroidVertices(random: RandomSource): readonly VectorPoint[] {
  const points: VectorPoint[] = []
  for (let i = 0; i < ASTEROIDS_GAME_CONFIG.asteroidVertexCount; i += 1) {
    const angle = (i / ASTEROIDS_GAME_CONFIG.asteroidVertexCount) * Math.PI * 2
    const radius = randomRange(
      random,
      1 - ASTEROIDS_GAME_CONFIG.asteroidVertexJitter,
      1 + ASTEROIDS_GAME_CONFIG.asteroidVertexJitter,
    )
    points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius })
  }
  return points
}

/**
 * Convert an angle and speed into a velocity vector.
 *
 * @param angle - Direction in radians.
 * @param speed - Speed in pixels per second.
 */
export function velocityFromAngle(angle: number, speed: number): VectorPoint {
  return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }
}
