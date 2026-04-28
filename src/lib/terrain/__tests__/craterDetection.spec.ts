import { describe, expect, it } from 'vitest'
import { Heightmap } from '@/lib/terrain/heightmap'
import { findCratersInHeightmap } from '@/lib/terrain/craterDetection'
import { applyCraterToHeightmap } from '@/lib/terrain/craterSynthesis'

const RESOLUTION = 64
const WORLD_SIZE = 200
const CELL_SIZE = WORLD_SIZE / (RESOLUTION - 1)

function flatHeightmap(): Heightmap {
  return new Heightmap(RESOLUTION, WORLD_SIZE)
}

describe('findCratersInHeightmap', () => {
  it('returns no craters for an empty heightmap', () => {
    const heightmap = flatHeightmap()

    expect(findCratersInHeightmap(heightmap, { minRadius: 10, minDepth: 4 })).toEqual([])
  })

  it('finds a single synthesized bowl', () => {
    const heightmap = flatHeightmap()
    const crater = applyCraterToHeightmap(heightmap, { x: 20, z: -10, radius: 22, depth: 14 })

    const results = findCratersInHeightmap(heightmap, {
      minRadius: 10,
      minDepth: 5,
      maxResults: 4,
    })

    expect(results).toHaveLength(1)
    expect(Math.abs(results[0]!.x - crater.x)).toBeLessThanOrEqual(CELL_SIZE)
    expect(Math.abs(results[0]!.z - crater.z)).toBeLessThanOrEqual(CELL_SIZE)
    expect(results[0]!.radius).toBeGreaterThanOrEqual(crater.radius * 0.75)
    expect(results[0]!.radius).toBeLessThanOrEqual(crater.radius * 1.25)
    expect(results[0]!.depth).toBeGreaterThanOrEqual(crater.depth * 0.75)
    expect(results[0]!.depth).toBeLessThanOrEqual(crater.depth * 1.25)
  })

  it('sorts two well-separated bowls by descending quality', () => {
    const heightmap = flatHeightmap()
    applyCraterToHeightmap(heightmap, { x: -45, z: -35, radius: 14, depth: 8 })
    applyCraterToHeightmap(heightmap, { x: 45, z: 35, radius: 24, depth: 14 })

    const results = findCratersInHeightmap(heightmap, {
      minRadius: 8,
      minDepth: 5,
      maxResults: 2,
    })

    expect(results).toHaveLength(2)
    expect(results[0]!.depth * results[0]!.radius).toBeGreaterThan(
      results[1]!.depth * results[1]!.radius,
    )
    expect(results[0]!.x).toBeGreaterThan(0)
  })

  it('rejects bowls shallower than the minimum depth', () => {
    const heightmap = flatHeightmap()
    applyCraterToHeightmap(heightmap, { x: 0, z: 0, radius: 20, depth: 3 })

    expect(findCratersInHeightmap(heightmap, { minRadius: 10, minDepth: 6 })).toEqual([])
  })

  it('returns no craters when all cells are invalid', () => {
    const heightmap = flatHeightmap()
    heightmap.validity.fill(0)

    expect(findCratersInHeightmap(heightmap, { minRadius: 10, minDepth: 4 })).toEqual([])
  })

  it('honors the region filter', () => {
    const heightmap = flatHeightmap()
    applyCraterToHeightmap(heightmap, { x: -40, z: 0, radius: 18, depth: 12 })
    applyCraterToHeightmap(heightmap, { x: 40, z: 0, radius: 18, depth: 12 })

    const results = findCratersInHeightmap(heightmap, {
      minRadius: 10,
      minDepth: 5,
      region: { minX: 0, maxX: 80, minZ: -30, maxZ: 30 },
    })

    expect(results).toHaveLength(1)
    expect(results[0]!.x).toBeGreaterThan(0)
  })
})
