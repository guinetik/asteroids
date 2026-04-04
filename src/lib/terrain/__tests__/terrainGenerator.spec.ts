import { describe, it, expect } from 'vitest'
import { generateTerrain } from '../terrainGenerator'
import type { SurfaceFeatures } from '@/lib/asteroids/types'

const ROCKY_SURFACE: SurfaceFeatures = {
  craterDensity: 0.7,
  craterMaxScale: 0.3,
  boulderDensity: 0.5,
  ridgeFrequency: 0.3,
  roughness: 0.8,
  dustCoverage: 0.2,
}

const ICY_SURFACE: SurfaceFeatures = {
  craterDensity: 0.15,
  craterMaxScale: 0.1,
  boulderDensity: 0.0,
  ridgeFrequency: 0.8,
  roughness: 0.25,
  dustCoverage: 0.85,
}

describe('generateTerrain', () => {
  it('returns a Heightmap with the requested resolution', () => {
    const hm = generateTerrain(ROCKY_SURFACE, { seed: 42, resolution: 64, worldSize: 500 })
    expect(hm.resolution).toBe(64)
    expect(hm.worldSize).toBe(500)
  })

  it('is deterministic for the same seed', () => {
    const a = generateTerrain(ROCKY_SURFACE, { seed: 42, resolution: 64, worldSize: 500 })
    const b = generateTerrain(ROCKY_SURFACE, { seed: 42, resolution: 64, worldSize: 500 })
    expect(a.heightAt(10, 10)).toBe(b.heightAt(10, 10))
    expect(a.heightAt(-50, 30)).toBe(b.heightAt(-50, 30))
  })

  it('produces different terrain for different seeds', () => {
    const a = generateTerrain(ROCKY_SURFACE, { seed: 1, resolution: 64, worldSize: 500 })
    const b = generateTerrain(ROCKY_SURFACE, { seed: 2, resolution: 64, worldSize: 500 })
    expect(a.heightAt(10, 10)).not.toBe(b.heightAt(10, 10))
  })

  it('rocky surface has more height variation than icy surface', () => {
    const rocky = generateTerrain(ROCKY_SURFACE, { seed: 42, resolution: 64, worldSize: 500 })
    const icy = generateTerrain(ICY_SURFACE, { seed: 42, resolution: 64, worldSize: 500 })
    let rockyMin = Infinity, rockyMax = -Infinity
    let icyMin = Infinity, icyMax = -Infinity
    for (let i = 0; i < rocky.grid.length; i++) {
      rockyMin = Math.min(rockyMin, rocky.grid[i]!)
      rockyMax = Math.max(rockyMax, rocky.grid[i]!)
      icyMin = Math.min(icyMin, icy.grid[i]!)
      icyMax = Math.max(icyMax, icy.grid[i]!)
    }
    expect(rockyMax - rockyMin).toBeGreaterThan(icyMax - icyMin)
  })

  it('high craterDensity produces more negative heights (bowls)', () => {
    const highCraters: SurfaceFeatures = { ...ROCKY_SURFACE, craterDensity: 0.9, craterMaxScale: 0.4 }
    const lowCraters: SurfaceFeatures = { ...ROCKY_SURFACE, craterDensity: 0.1, craterMaxScale: 0.05 }
    const high = generateTerrain(highCraters, { seed: 42, resolution: 64, worldSize: 500 })
    const low = generateTerrain(lowCraters, { seed: 42, resolution: 64, worldSize: 500 })
    let highNeg = 0, lowNeg = 0
    for (let i = 0; i < high.grid.length; i++) {
      if (high.grid[i]! < -1) highNeg++
      if (low.grid[i]! < -1) lowNeg++
    }
    expect(highNeg).toBeGreaterThan(lowNeg)
  })
})
