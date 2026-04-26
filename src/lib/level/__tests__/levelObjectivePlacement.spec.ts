import { describe, expect, it } from 'vitest'
import { Heightmap } from '@/lib/terrain/heightmap'
import {
  flattenHeightmapDisk,
  resampleObjectiveNearShip,
  sampleSpawnOnSurface,
} from '../levelObjectivePlacement'

function buildHeightmap(): Heightmap {
  const heightmap = new Heightmap(5, 40)
  for (let z = 0; z < 5; z++) {
    for (let x = 0; x < 5; x++) {
      heightmap.set(x, z, 10 + x + z)
      heightmap.setValid(x, z, true)
    }
  }
  return heightmap
}

describe('levelObjectivePlacement', () => {
  it('samples a valid spawn on the heightmap', () => {
    const heightmap = buildHeightmap()
    const spawn = sampleSpawnOnSurface(
      heightmap,
      { spawnPositionRange: 10, spawnSampleAttempts: 3 },
      () => 0.5,
    )

    expect(spawn.x).toBe(0)
    expect(spawn.z).toBe(0)
    expect(spawn.y).toBe(heightmap.heightAt(0, 0))
  })

  it('resamples an objective near the ship respecting valid cells', () => {
    const heightmap = buildHeightmap()
    const point = resampleObjectiveNearShip(
      heightmap,
      { x: 18, z: 18 },
      { x: 0, z: 0 },
      [],
      {
        minDistanceFromShip: 5,
        maxDistanceFromShip: 10,
        minMutualSpacing: 4,
        maxSlope: 10,
        resampleAttempts: 1,
        fallbackPullAttempts: 2,
        fallbackPullFactor: 0.9,
        fallbackPullDecay: 0.9,
      },
      () => 0.5,
    )

    expect(heightmap.isValidAt(point.x, point.z)).toBe(true)
  })

  it('flattens nearby heightmap cells toward the center height', () => {
    const heightmap = buildHeightmap()
    const before = heightmap.get(1, 2)

    flattenHeightmapDisk(heightmap, { x: 0, z: 0 }, { flattenRadius: 12, flattenFullRadius: 4 })

    expect(heightmap.get(1, 2)).not.toBe(before)
    expect(heightmap.heightAt(0, 0)).toBe(heightmap.heightAt(0, 0))
  })
})
