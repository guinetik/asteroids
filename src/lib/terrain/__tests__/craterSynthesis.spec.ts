import { describe, expect, it } from 'vitest'
import { Heightmap } from '@/lib/terrain/heightmap'
import { applyCraterToHeightmap } from '@/lib/terrain/craterSynthesis'

const RESOLUTION = 101
const WORLD_SIZE = 200
const CENTER_X = 0
const CENTER_Z = 0
const RADIUS = 20
const DEPTH = 12
const HEIGHT_EPSILON = 0.75

function flatHeightmap(): Heightmap {
  return new Heightmap(RESOLUTION, WORLD_SIZE)
}

describe('applyCraterToHeightmap', () => {
  it('depresses the crater center by the requested depth', () => {
    const heightmap = flatHeightmap()

    applyCraterToHeightmap(heightmap, { x: CENTER_X, z: CENTER_Z, radius: RADIUS, depth: DEPTH })

    expect(heightmap.heightAt(CENTER_X, CENTER_Z)).toBeCloseTo(-DEPTH, 1)
  })

  it('returns to baseline at the bowl edge', () => {
    const heightmap = flatHeightmap()

    applyCraterToHeightmap(heightmap, { x: CENTER_X, z: CENTER_Z, radius: RADIUS, depth: DEPTH })

    expect(heightmap.heightAt(RADIUS, CENTER_Z)).toBeCloseTo(0, 1)
  })

  it('raises a rim outside the bowl radius', () => {
    const heightmap = flatHeightmap()

    applyCraterToHeightmap(heightmap, { x: CENTER_X, z: CENTER_Z, radius: RADIUS, depth: DEPTH })

    expect(heightmap.heightAt(RADIUS * 1.2, CENTER_Z)).toBeGreaterThan(0)
  })

  it('leaves terrain outside the rim band unchanged', () => {
    const heightmap = flatHeightmap()

    applyCraterToHeightmap(heightmap, { x: CENTER_X, z: CENTER_Z, radius: RADIUS, depth: DEPTH })

    expect(heightmap.heightAt(RADIUS * 2, CENTER_Z)).toBeCloseTo(0, 1)
  })

  it('accumulates when the same crater is applied twice', () => {
    const heightmap = flatHeightmap()

    applyCraterToHeightmap(heightmap, { x: CENTER_X, z: CENTER_Z, radius: RADIUS, depth: DEPTH })
    applyCraterToHeightmap(heightmap, { x: CENTER_X, z: CENTER_Z, radius: RADIUS, depth: DEPTH })

    expect(heightmap.heightAt(CENTER_X, CENTER_Z)).toBeCloseTo(-DEPTH * 2, 1)
  })

  it('treats centers outside the heightmap as a no-op', () => {
    const heightmap = flatHeightmap()

    applyCraterToHeightmap(heightmap, {
      x: WORLD_SIZE,
      z: CENTER_Z,
      radius: RADIUS,
      depth: DEPTH,
    })

    expect(Math.max(...heightmap.grid)).toBeCloseTo(0, 1)
    expect(Math.min(...heightmap.grid)).toBeCloseTo(0, 1)
  })

  it('does not modify invalid cells', () => {
    const heightmap = flatHeightmap()
    const invalidX = Math.floor(RESOLUTION / 2)
    const invalidZ = Math.floor(RESOLUTION / 2)
    const originalHeight = 9
    heightmap.set(invalidX, invalidZ, originalHeight)
    heightmap.setValid(invalidX, invalidZ, false)

    applyCraterToHeightmap(heightmap, { x: CENTER_X, z: CENTER_Z, radius: RADIUS, depth: DEPTH })

    expect(heightmap.get(invalidX, invalidZ)).toBeCloseTo(originalHeight, HEIGHT_EPSILON)
    expect(heightmap.isValid(invalidX, invalidZ)).toBe(false)
  })
})
