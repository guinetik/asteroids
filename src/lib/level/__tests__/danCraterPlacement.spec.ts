import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import type { AsteroidDefinition } from '@/lib/asteroids/types'
import { Heightmap } from '@/lib/terrain/heightmap'
import { applyCraterToHeightmap } from '@/lib/terrain/craterSynthesis'
import { rotationFromSeed } from '@/lib/level/levelContext'
import {
  DEFAULT_DAN_CRATER_MIN_DEPTH,
  DEFAULT_DAN_CRATER_MIN_QUALITY_SCORE,
  DEFAULT_DAN_CRATER_RADIUS,
  chooseDanCraterPlacement,
  deriveCandidateRotations,
  type DanCraterSpec,
} from '@/lib/level/danCraterPlacement'
import { bakeHeightmapFromMesh } from '@/lib/terrain/meshHeightmap'
import { loadGLB } from '@/three/loadGLB'

vi.mock('@/three/loadGLB', () => ({
  loadGLB: vi.fn(),
}))

vi.mock('@/lib/terrain/meshHeightmap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/terrain/meshHeightmap')>()
  return {
    ...actual,
    bakeHeightmapFromMesh: vi.fn(),
  }
})

const ASTEROID = {
  id: 'test-asteroid',
  name: 'Test Asteroid',
  designation: 'TEST',
  type: 'Carbonaceous',
  biome: 'rocky',
  description: 'Test asteroid',
  composition: [],
  shape: {
    dimensions: [1, 1, 1],
    elongation: 1,
    lobeCount: 1,
    irregularity: 0.5,
  },
  surface: {
    craterDensity: 0,
    craterMaxScale: 0,
    boulderDensity: 0,
    ridgeFrequency: 0,
    roughness: 0,
    dustCoverage: 0,
    modelPath: '/models/test.glb',
    modelScale: 2,
  },
  visual: {
    albedo: 0.1,
    baseColor: [0.5, 0.5, 0.5],
  },
  physical: {
    mass: 1,
    density: 1,
    surfaceGravity: 1,
    rotationPeriod: 1,
    surfaceTemperature: 1,
  },
  lighting: {
    direction: [1, 1, 1],
    color: [1, 1, 1],
    intensity: 1,
  },
} as unknown as AsteroidDefinition

const BAKE_OPTIONS = {
  resolution: 64,
  worldSize: 200,
  rayStartAltitude: 100,
}

function makeScene(): THREE.Group {
  return new THREE.Group()
}

function makeCraterHeightmap(): Heightmap {
  const heightmap = new Heightmap(64, 200)
  applyCraterToHeightmap(heightmap, { x: 0, z: 0, radius: DEFAULT_DAN_CRATER_RADIUS, depth: 18 })
  return heightmap
}

function makeFlatHeightmap(): Heightmap {
  return new Heightmap(64, 200)
}

describe('deriveCandidateRotations', () => {
  it('returns deterministic candidates with the default rotation first', () => {
    const lottery = { x: 0, z: 0.25 }
    const rotations = deriveCandidateRotations(12345, lottery, 4)

    expect(rotations).toHaveLength(4)
    expect(rotations[0]).toEqual(rotationFromSeed(12345, lottery))
    expect(rotations).toEqual(deriveCandidateRotations(12345, lottery, 4))
    expect(rotations.every((rotation) => rotation.x === lottery.x)).toBe(true)
    expect(rotations.every((rotation) => rotation.z === lottery.z)).toBe(true)
  })
})

describe('chooseDanCraterPlacement', () => {
  it('returns the same placement for the same asteroid, seed, and spec', async () => {
    const spec: DanCraterSpec = {
      targetRadius: DEFAULT_DAN_CRATER_RADIUS,
      minDepth: DEFAULT_DAN_CRATER_MIN_DEPTH,
      minQualityScore: DEFAULT_DAN_CRATER_MIN_QUALITY_SCORE,
      candidateRotationCount: 2,
    }
    vi.mocked(loadGLB).mockResolvedValue(makeScene())
    vi.mocked(bakeHeightmapFromMesh).mockImplementation(() => makeCraterHeightmap())

    const first = await chooseDanCraterPlacement(ASTEROID, 12345, spec, BAKE_OPTIONS)
    vi.mocked(loadGLB).mockResolvedValue(makeScene())
    const second = await chooseDanCraterPlacement(ASTEROID, 12345, spec, BAKE_OPTIONS)

    expect(first).toEqual(second)
    expect(first.source).toBe('natural')
  })

  it('returns synthesis fallback when minQualityScore is unreachable', async () => {
    const spec: DanCraterSpec = {
      targetRadius: DEFAULT_DAN_CRATER_RADIUS,
      minDepth: DEFAULT_DAN_CRATER_MIN_DEPTH,
      minQualityScore: Number.POSITIVE_INFINITY,
      candidateRotationCount: 2,
    }
    vi.mocked(loadGLB).mockResolvedValue(makeScene())
    vi.mocked(bakeHeightmapFromMesh).mockImplementation(() => makeFlatHeightmap())

    const result = await chooseDanCraterPlacement(ASTEROID, 12345, spec, BAKE_OPTIONS)

    expect(result.source).toBe('synthesized')
    expect(result.crater.x).toBe(0)
    expect(result.crater.z).toBe(0)
    expect(result.crater.radius).toBe(DEFAULT_DAN_CRATER_RADIUS)
  })
})
