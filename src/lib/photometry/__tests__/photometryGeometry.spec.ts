import { describe, expect, it } from 'vitest'
import {
  computePhotometryProbeTarget,
  computePhotometryStandoffDistance,
  findClosestPhotometrySurfacePoint,
} from '@/lib/photometry/photometryGeometry'
import { Heightmap } from '@/lib/terrain/heightmap'

describe('computePhotometryProbeTarget', () => {
  it('places one probe at a deterministic mid-height side standoff', () => {
    const target = computePhotometryProbeTarget({
      objectiveX: 100,
      objectiveZ: -40,
      terminalY: 12,
      asteroidMidY: 180,
      probeDistance: 1000,
      seed: 42,
    })

    const dx = target.x - 100
    const dz = target.z - -40
    expect(Math.hypot(dx, dz)).toBeCloseTo(1000, 5)
    expect(target.y).toBe(0)
    expect(computePhotometryProbeTarget({
      objectiveX: 100,
      objectiveZ: -40,
      terminalY: 12,
      asteroidMidY: 180,
      probeDistance: 1000,
      seed: 42,
    })).toEqual(target)
  })

  it('keeps the standoff below the launch apex after the probe arcs sideways', () => {
    const target = computePhotometryProbeTarget({
      objectiveX: 0,
      objectiveZ: 0,
      terminalY: 20,
      asteroidMidY: 160,
      probeDistance: 900,
      seed: 7,
    })

    expect(target.y).toBe(0)
    expect(target.y).toBeLessThan(target.launchApexY)
  })

  it('places the final standoff at the equator plane even when the terminal is high', () => {
    const target = computePhotometryProbeTarget({
      objectiveX: 0,
      objectiveZ: 0,
      terminalY: 100,
      asteroidMidY: 40,
      probeDistance: 900,
      seed: 11,
    })

    expect(target.y).toBe(0)
    expect(target.y).toBeLessThan(target.launchApexY)
  })
})

describe('computePhotometryStandoffDistance', () => {
  it('derives standoff distance from the valid asteroid footprint radius', () => {
    const heightmap = new Heightmap(5, 400)
    for (let gz = 0; gz < heightmap.resolution; gz++) {
      for (let gx = 0; gx < heightmap.resolution; gx++) {
        heightmap.setValid(gx, gz, false)
      }
    }
    heightmap.setValid(2, 2, true)
    heightmap.setValid(4, 2, true)

    expect(computePhotometryStandoffDistance(heightmap)).toBeCloseTo(540)
  })
})

describe('findClosestPhotometrySurfacePoint', () => {
  it('returns the closest valid asteroid surface point to the probe viewpoint', () => {
    const heightmap = new Heightmap(3, 200)
    heightmap.set(0, 1, 10)
    heightmap.set(2, 1, 50)
    heightmap.setValid(0, 1, true)
    heightmap.setValid(2, 1, true)
    heightmap.setValid(1, 1, false)

    const point = findClosestPhotometrySurfacePoint(
      heightmap,
      { x: 220, y: 80, z: 0 },
      12,
    )

    expect(point).toEqual({ x: 100, y: 62, z: 0 })
  })
})
