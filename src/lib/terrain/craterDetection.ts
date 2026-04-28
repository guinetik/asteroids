/**
 * Crater detection utilities for baked asteroid heightmaps.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-dan-mission-design.md
 */

import type { Heightmap } from '@/lib/terrain/heightmap'

/** A bowl-shaped depression detected on or applied to a heightmap, in world-space coordinates. */
export interface Crater {
  /** World-space X of the bowl center. */
  x: number
  /** World-space Z of the bowl center. */
  z: number
  /** Approximate bowl radius in world units (rim outer is roughly 1.4x this). */
  radius: number
  /** Approximate bowl depth in world units (positive number). */
  depth: number
}

/** World-space rectangle used to restrict crater center selection. */
export interface FindCratersRegion {
  /** Minimum world-space X included in the query. */
  minX: number
  /** Maximum world-space X included in the query. */
  maxX: number
  /** Minimum world-space Z included in the query. */
  minZ: number
  /** Maximum world-space Z included in the query. */
  maxZ: number
}

/** Tunable thresholds for `findCratersInHeightmap`. */
export interface FindCratersOptions {
  /** Minimum bowl radius in world units to count as a crater. Filters out noise. */
  minRadius: number
  /** Minimum bowl depth in world units. Filters out shallow dips. */
  minDepth: number
  /** Maximum craters to return. Returned in descending quality order. Default 16. */
  maxResults?: number
  /** Optional world-space rectangle restricting returned crater centers. */
  region?: FindCratersRegion
}

/** Internal crater candidate paired with its sorting score. */
interface CraterCandidate {
  /** Detected crater geometry. */
  crater: Crater
  /** Quality score used for deterministic result ordering. */
  score: number
}

const DEFAULT_MAX_RESULTS = 16
const CARDINAL_DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const
const RING_SAMPLE_DIRECTIONS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
] as const
const MINIMUM_CARDINAL_RISE = 4
const LOCAL_MINIMUM_EPSILON = 1e-4
const SEARCH_RADIUS_MULTIPLIER = 3

/** Convert a grid X index to world-space X. */
function gridToWorldX(gx: number, heightmap: Heightmap): number {
  return -heightmap.worldSize / 2 + gx * (heightmap.worldSize / (heightmap.resolution - 1))
}

/** Convert a grid Z index to world-space Z. */
function gridToWorldZ(gz: number, heightmap: Heightmap): number {
  return -heightmap.worldSize / 2 + gz * (heightmap.worldSize / (heightmap.resolution - 1))
}

/** Returns whether a world-space point is inside an optional detection region. */
function isInsideRegion(x: number, z: number, region?: FindCratersRegion): boolean {
  if (!region) return true
  return x >= region.minX && x <= region.maxX && z >= region.minZ && z <= region.maxZ
}

/** Collects a deterministic average height for an integer ring around a grid center. */
function sampleRingAverage(
  heightmap: Heightmap,
  centerX: number,
  centerZ: number,
  ring: number,
): number | null {
  let sum = 0
  let count = 0

  for (const [dx, dz] of RING_SAMPLE_DIRECTIONS) {
    const length = Math.hypot(dx, dz)
    const gx = Math.round(centerX + (dx / length) * ring)
    const gz = Math.round(centerZ + (dz / length) * ring)
    if (!heightmap.isValid(gx, gz)) return null
    sum += heightmap.get(gx, gz)
    count++
  }

  return count === 0 ? null : sum / count
}

/** Returns whether the cell is the lowest valid point in its local search window. */
function isLocalMinimum(
  heightmap: Heightmap,
  gx: number,
  gz: number,
  windowCells: number,
): boolean {
  const centerHeight = heightmap.get(gx, gz)
  let cardinalRise = 0

  for (let z = gz - windowCells; z <= gz + windowCells; z++) {
    for (let x = gx - windowCells; x <= gx + windowCells; x++) {
      if (!heightmap.isValid(x, z)) return false
      if (heightmap.get(x, z) < centerHeight - LOCAL_MINIMUM_EPSILON) return false
    }
  }

  for (const [dx, dz] of CARDINAL_DIRECTIONS) {
    const edgeHeight = heightmap.get(gx + dx * windowCells, gz + dz * windowCells)
    if (edgeHeight > centerHeight + LOCAL_MINIMUM_EPSILON) cardinalRise++
  }

  return cardinalRise >= MINIMUM_CARDINAL_RISE
}

/** Estimate crater radius and depth from the center to the first local baseline crossing. */
function estimateCrater(
  heightmap: Heightmap,
  gx: number,
  gz: number,
  minRadiusCells: number,
): Crater | null {
  const centerHeight = heightmap.get(gx, gz)
  const maxRing = Math.max(
    minRadiusCells + 1,
    Math.floor(minRadiusCells * SEARCH_RADIUS_MULTIPLIER),
  )
  let bestDepth = 0
  let bestRing = 0

  for (let ring = 1; ring <= maxRing; ring++) {
    const average = sampleRingAverage(heightmap, gx, gz, ring)
    if (average === null) return null

    const depth = average - centerHeight
    if (depth > bestDepth) {
      bestDepth = depth
      bestRing = ring
    }
  }

  if (bestRing < minRadiusCells) return null

  const cellSize = heightmap.worldSize / (heightmap.resolution - 1)
  return {
    x: gridToWorldX(gx, heightmap),
    z: gridToWorldZ(gz, heightmap),
    radius: bestRing * cellSize,
    depth: bestDepth,
  }
}

/**
 * Find bowl-shaped depressions in a heightmap.
 *
 * @param heightmap - Heightmap to scan.
 * @param options - Detection thresholds and optional region.
 * @returns Detected craters sorted by descending quality.
 */
export function findCratersInHeightmap(
  heightmap: Heightmap,
  options: FindCratersOptions,
): Crater[] {
  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS
  const cellSize = heightmap.worldSize / (heightmap.resolution - 1)
  const minRadiusCells = Math.max(1, Math.round(options.minRadius / cellSize))
  const candidates: CraterCandidate[] = []

  for (let gz = minRadiusCells; gz < heightmap.resolution - minRadiusCells; gz++) {
    for (let gx = minRadiusCells; gx < heightmap.resolution - minRadiusCells; gx++) {
      if (!heightmap.isValid(gx, gz)) continue
      if (!isLocalMinimum(heightmap, gx, gz, minRadiusCells)) continue

      const crater = estimateCrater(heightmap, gx, gz, minRadiusCells)
      if (!crater) continue
      if (crater.radius < options.minRadius || crater.depth < options.minDepth) continue
      if (!isInsideRegion(crater.x, crater.z, options.region)) continue

      candidates.push({ crater, score: crater.depth * crater.radius })
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.crater.x - b.crater.x || a.crater.z - b.crater.z)

  const selected: Crater[] = []
  for (const candidate of candidates) {
    const overlaps = selected.some((crater) => {
      const dx = crater.x - candidate.crater.x
      const dz = crater.z - candidate.crater.z
      const minSpacing = Math.min(crater.radius, candidate.crater.radius)
      return dx * dx + dz * dz < minSpacing * minSpacing
    })
    if (overlaps) continue

    selected.push(candidate.crater)
    if (selected.length >= maxResults) break
  }

  return selected
}
