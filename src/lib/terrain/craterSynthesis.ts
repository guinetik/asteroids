/**
 * Parabolic crater synthesis for baked or procedural heightmaps.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-dan-mission-design.md
 */

import type { Heightmap } from '@/lib/terrain/heightmap'
import type { Crater } from '@/lib/terrain/craterDetection'

/** Rim height as a fraction of bowl depth. Matches legacy terrain generator. */
export const CRATER_RIM_HEIGHT_RATIO = 0.35

/** Outer rim band as a multiple of crater radius. Matches legacy terrain generator. */
export const CRATER_RIM_EXTENT = 1.4

/** Default depth-to-radius ratio when caller omits explicit depth. */
export const DEFAULT_CRATER_DEPTH_RATIO = 0.6

/** Inputs for `applyCraterToHeightmap`. World-space coordinates. */
export interface ApplyCraterOptions {
  /** World-space X of the bowl center. */
  x: number
  /** World-space Z of the bowl center. */
  z: number
  /** Bowl radius in world units. */
  radius: number
  /** Bowl depth in world units (positive number). Defaults to `radius * 0.6` if omitted. */
  depth?: number
}

/**
 * Apply a parabolic crater bowl and raised rim to an existing heightmap.
 *
 * @param heightmap - Heightmap whose grid should receive the crater delta.
 * @param options - World-space crater center, radius, and optional depth.
 * @returns The crater that was applied, with defaulted depth resolved.
 */
export function applyCraterToHeightmap(heightmap: Heightmap, options: ApplyCraterOptions): Crater {
  const depth = options.depth ?? options.radius * DEFAULT_CRATER_DEPTH_RATIO
  const crater = { x: options.x, z: options.z, radius: options.radius, depth }
  const { resolution, worldSize } = heightmap
  const half = worldSize / 2

  if (options.radius <= 0 || depth <= 0) return crater
  if (options.x < -half || options.x > half || options.z < -half || options.z > half) {
    return crater
  }

  const cellSize = worldSize / (resolution - 1)
  const cx = ((options.x + half) / worldSize) * (resolution - 1)
  const cz = ((options.z + half) / worldSize) * (resolution - 1)
  const radiusCells = options.radius / cellSize
  const rimOuterCells = radiusCells * CRATER_RIM_EXTENT
  const rimHeight = depth * CRATER_RIM_HEIGHT_RATIO
  const minGx = Math.max(0, Math.floor(cx - rimOuterCells - 1))
  const maxGx = Math.min(resolution - 1, Math.ceil(cx + rimOuterCells + 1))
  const minGz = Math.max(0, Math.floor(cz - rimOuterCells - 1))
  const maxGz = Math.min(resolution - 1, Math.ceil(cz + rimOuterCells + 1))

  for (let gz = minGz; gz <= maxGz; gz++) {
    for (let gx = minGx; gx <= maxGx; gx++) {
      if (!heightmap.isValid(gx, gz)) continue

      const dx = gx - cx
      const dz = gz - cz
      const dist = Math.sqrt(dx * dx + dz * dz)
      const t = dist / radiusCells
      let delta = 0

      if (t <= 1) {
        delta = -depth * (1 - t * t)
      } else if (dist <= rimOuterCells) {
        const rimT = (dist - radiusCells) / (rimOuterCells - radiusCells)
        delta = rimHeight * (1 - rimT)
      }

      heightmap.grid[gz * resolution + gx]! += delta
    }
  }

  return crater
}
