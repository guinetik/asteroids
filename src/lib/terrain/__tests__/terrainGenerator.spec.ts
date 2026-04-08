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

function percentileSpan(grid: Float32Array, lower: number, upper: number): number {
  const values = Array.from(grid).sort((a, b) => a - b)
  const lowerIndex = Math.round((values.length - 1) * lower)
  const upperIndex = Math.round((values.length - 1) * upper)
  return values[upperIndex]! - values[lowerIndex]!
}

function countAboveAbs(grid: Float32Array, threshold: number): number {
  let count = 0
  for (let i = 0; i < grid.length; i++) {
    if (Math.abs(grid[i]!) > threshold) count++
  }
  return count
}

function localRoughness(grid: Float32Array, resolution: number): number {
  let sum = 0
  let samples = 0
  for (let z = 1; z < resolution - 1; z++) {
    for (let x = 1; x < resolution - 1; x++) {
      const i = z * resolution + x
      const c = grid[i]!
      const dx = Math.abs(c - grid[i + 1]!)
      const dz = Math.abs(c - grid[i + resolution]!)
      sum += dx + dz
      samples += 2
    }
  }
  return samples === 0 ? 0 : sum / samples
}

function localDetailContrast(grid: Float32Array, resolution: number): number {
  let sum = 0
  let samples = 0
  for (let z = 1; z < resolution - 1; z++) {
    for (let x = 1; x < resolution - 1; x++) {
      const i = z * resolution + x
      const center = grid[i]!
      const neighborMean =
        (grid[i - 1]! + grid[i + 1]! + grid[i - resolution]! + grid[i + resolution]!) / 4
      sum += Math.abs(center - neighborMean)
      samples++
    }
  }
  return samples === 0 ? 0 : sum / samples
}

// These constants are test-tuning guards for aggregate relief retention and local detail checks.
const MODERATE_DETAIL_HEIGHT = 14
const DUSTY_RELIEF_RETENTION_RATIO = 0.45
const BOULDER_ROUGHNESS_GROWTH_LIMIT = 2.5

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

  it('high dustCoverage suppresses local roughness while preserving macro relief', () => {
    const dusty: SurfaceFeatures = { ...ROCKY_SURFACE, dustCoverage: 0.9, roughness: 0.8 }
    const exposed: SurfaceFeatures = { ...ROCKY_SURFACE, dustCoverage: 0.05, roughness: 0.8 }

    const dustyHm = generateTerrain(dusty, { seed: 42, resolution: 96, worldSize: 1200 })
    const exposedHm = generateTerrain(exposed, { seed: 42, resolution: 96, worldSize: 1200 })

    const dustyMacroRelief = percentileSpan(dustyHm.grid, 0.05, 0.95)
    const exposedMacroRelief = percentileSpan(exposedHm.grid, 0.05, 0.95)

    expect(localRoughness(dustyHm.grid, dustyHm.resolution))
      .toBeLessThan(localRoughness(exposedHm.grid, exposedHm.resolution))
    expect(dustyMacroRelief).toBeGreaterThan(exposedMacroRelief * DUSTY_RELIEF_RETENTION_RATIO)
  })

  it('higher boulderDensity increases local micro-detail without runaway roughness', () => {
    const lowBoulders: SurfaceFeatures = { ...ROCKY_SURFACE, boulderDensity: 0.05, roughness: 0.55 }
    const highBoulders: SurfaceFeatures = { ...ROCKY_SURFACE, boulderDensity: 0.95, roughness: 0.55 }

    const low = generateTerrain(lowBoulders, { seed: 77, resolution: 96, worldSize: 1200 })
    const high = generateTerrain(highBoulders, { seed: 77, resolution: 96, worldSize: 1200 })

    expect(localDetailContrast(high.grid, high.resolution))
      .toBeGreaterThan(localDetailContrast(low.grid, low.resolution))
    expect(localRoughness(high.grid, high.resolution))
      .toBeLessThan(localRoughness(low.grid, low.resolution) * BOULDER_ROUGHNESS_GROWTH_LIMIT)
  })

  it('roughness increases strong-detail count and local roughness', () => {
    const smooth: SurfaceFeatures = { ...ROCKY_SURFACE, roughness: 0.15, dustCoverage: 0.25 }
    const rough: SurfaceFeatures = { ...ROCKY_SURFACE, roughness: 0.9, dustCoverage: 0.25 }

    const smoothHm = generateTerrain(smooth, { seed: 99, resolution: 96, worldSize: 1200 })
    const roughHm = generateTerrain(rough, { seed: 99, resolution: 96, worldSize: 1200 })

    const smoothStrong = countAboveAbs(smoothHm.grid, MODERATE_DETAIL_HEIGHT)
    const roughStrong = countAboveAbs(roughHm.grid, MODERATE_DETAIL_HEIGHT)

    expect(roughStrong).toBeGreaterThan(smoothStrong)
    expect(localRoughness(roughHm.grid, roughHm.resolution))
      .toBeGreaterThan(localRoughness(smoothHm.grid, smoothHm.resolution))
  })

  it('biome changes filler distribution without changing deterministic seeding', () => {
    const neutralA = generateTerrain(ROCKY_SURFACE, {
      seed: 11,
      resolution: 96,
      worldSize: 1200,
    })
    const neutralB = generateTerrain(ROCKY_SURFACE, {
      seed: 11,
      resolution: 96,
      worldSize: 1200,
    })
    const sandy = generateTerrain(ROCKY_SURFACE, {
      seed: 11,
      resolution: 96,
      worldSize: 1200,
      biome: 'sandy',
    })
    const rockyA = generateTerrain(ROCKY_SURFACE, {
      seed: 11,
      resolution: 96,
      worldSize: 1200,
      biome: 'rocky',
    })
    const rockyB = generateTerrain(ROCKY_SURFACE, {
      seed: 11,
      resolution: 96,
      worldSize: 1200,
      biome: 'rocky',
    })
    const volcanicA = generateTerrain(ROCKY_SURFACE, {
      seed: 11,
      resolution: 96,
      worldSize: 1200,
      biome: 'volcanic',
    })
    const volcanicB = generateTerrain(ROCKY_SURFACE, {
      seed: 11,
      resolution: 96,
      worldSize: 1200,
      biome: 'volcanic',
    })

    expect(localRoughness(sandy.grid, sandy.resolution))
      .toBeLessThan(localRoughness(rockyA.grid, rockyA.resolution))
    expect(localRoughness(volcanicA.grid, volcanicA.resolution))
      .toBeGreaterThan(localRoughness(sandy.grid, sandy.resolution))
    expect(neutralA.heightAt(100, -80)).toBe(neutralB.heightAt(100, -80))
    expect(rockyA.heightAt(100, -80)).toBe(rockyB.heightAt(100, -80))
    expect(volcanicA.heightAt(100, -80)).toBe(volcanicB.heightAt(100, -80))
    expect(volcanicA.heightAt(100, -80)).not.toBe(neutralA.heightAt(100, -80))
  })

  it('keeps flat zones usable after the new breakup passes', () => {
    const hm = generateTerrain(ROCKY_SURFACE, {
      seed: 123,
      resolution: 96,
      worldSize: 1200,
      biome: 'rocky',
      flatZones: [{ x: 0, z: 0, radius: 120 }],
    })

    const center = hm.heightAt(0, 0)
    const nearEdge = hm.heightAt(40, 35)
    const outside = hm.heightAt(180, 180)

    expect(Math.abs(center - nearEdge)).toBeLessThan(2)
    expect(Math.abs(center - outside)).toBeGreaterThan(1)
  })
})
