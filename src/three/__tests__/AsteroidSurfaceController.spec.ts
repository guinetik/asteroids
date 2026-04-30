import * as THREE from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAsteroidSurface } from '@/three/AsteroidSurfaceController'
import { loadGLB } from '@/three/loadGLB'
import { applyAsteroidSurfaceModulator } from '@/three/applyAsteroidSurfaceModulator'

vi.mock('@/three/loadGLB', () => ({
  fixMaterials: vi.fn(),
  loadGLB: vi.fn(),
}))

vi.mock('@/three/applyAsteroidSurfaceModulator', () => ({
  applyAsteroidSurfaceModulator: vi.fn(() => ({
    colorMap: { dispose: vi.fn() },
    normalMap: { dispose: vi.fn() },
    roughnessMap: { dispose: vi.fn() },
    aoMap: { dispose: vi.fn() },
    metalnessMap: { dispose: vi.fn() },
    emissionMap: { dispose: vi.fn() },
  })),
}))

const PLANE_SIZE = 100
const PLANE_SEGMENTS = 1
const BAKE_RESOLUTION = 17
const BAKE_RAY_START_ALTITUDE = 50
const CRATER_RADIUS = 20
const CRATER_DEPTH = 12
const OUTSIDE_CRATER_SAMPLE_X = 40
const PATCH_SETTLE_MINIMUM = 0.05
const CENTER_VERTEX_INDEX = 0
const OUTER_RIM_VERTEX_INDEX = 1 + (24 - 1) * 96
const MID_BOWL_VERTEX_INDEX = 1 + (12 - 1) * 96
const NEAR_BLACK_BRIGHTNESS = 0.15
const MIN_GROUND_GRAY_BRIGHTNESS = 0.85
const MAX_GROUND_GRAY_BRIGHTNESS = 1.55
const MID_BOWL_MIN_BRIGHTNESS = 0.45
const MODEL_SCALE = 10

function buildFlatAsteroidScene(): THREE.Group {
  const scene = new THREE.Group()
  const geometry = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE, PLANE_SEGMENTS, PLANE_SEGMENTS)
  geometry.rotateX(-Math.PI / 2)
  scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()))
  return scene
}

describe('createAsteroidSurface', () => {
  beforeEach(() => {
    vi.mocked(applyAsteroidSurfaceModulator).mockClear()
  })

  it('renders synthesized crater dents as a patch below matching collision heights', async () => {
    vi.mocked(loadGLB).mockResolvedValue(buildFlatAsteroidScene())

    const options: Parameters<typeof createAsteroidSurface>[0] = {
      modelPath: '/models/test-asteroid.glb',
      syntheticCrater: { x: 0, z: 0, radius: CRATER_RADIUS, depth: CRATER_DEPTH },
      bake: {
        resolution: BAKE_RESOLUTION,
        worldSize: PLANE_SIZE,
        rayStartAltitude: BAKE_RAY_START_ALTITUDE,
      },
    }

    const result = await createAsteroidSurface(options)
    const patch = result.group.getObjectByName('synthetic-crater-patch') as THREE.Mesh
    const positions = patch.geometry.getAttribute('position') as THREE.BufferAttribute

    expect(patch).toBeInstanceOf(THREE.Mesh)
    expect(result.heightmap.heightAt(0, 0)).toBeCloseTo(-CRATER_DEPTH, 3)
    expect(positions.getY(0)).toBeLessThan(result.heightmap.heightAt(0, 0) - PATCH_SETTLE_MINIMUM)
    expect(result.heightmap.heightAt(OUTSIDE_CRATER_SAMPLE_X, 0)).toBeCloseTo(0, 3)

    result.dispose()
  })

  it('grades the crater patch from a black floor to a light gray rim', async () => {
    vi.mocked(loadGLB).mockResolvedValue(buildFlatAsteroidScene())

    const result = await createAsteroidSurface({
      modelPath: '/models/test-asteroid.glb',
      baseColor: [0.18, 0.16, 0.14],
      syntheticCrater: { x: 0, z: 0, radius: CRATER_RADIUS, depth: CRATER_DEPTH },
      bake: {
        resolution: BAKE_RESOLUTION,
        worldSize: PLANE_SIZE,
        rayStartAltitude: BAKE_RAY_START_ALTITUDE,
      },
    })
    const patch = result.group.getObjectByName('synthetic-crater-patch') as THREE.Mesh
    const material = patch.material as THREE.MeshStandardMaterial
    const colors = patch.geometry.getAttribute('color') as THREE.BufferAttribute
    const centerBrightness =
      colors.getX(CENTER_VERTEX_INDEX) +
      colors.getY(CENTER_VERTEX_INDEX) +
      colors.getZ(CENTER_VERTEX_INDEX)
    const rimBrightness =
      colors.getX(OUTER_RIM_VERTEX_INDEX) +
      colors.getY(OUTER_RIM_VERTEX_INDEX) +
      colors.getZ(OUTER_RIM_VERTEX_INDEX)
    const midBowlBrightness =
      colors.getX(MID_BOWL_VERTEX_INDEX) +
      colors.getY(MID_BOWL_VERTEX_INDEX) +
      colors.getZ(MID_BOWL_VERTEX_INDEX)

    expect(material.vertexColors).toBe(true)
    expect(centerBrightness).toBeLessThan(NEAR_BLACK_BRIGHTNESS)
    expect(rimBrightness).toBeGreaterThan(MIN_GROUND_GRAY_BRIGHTNESS)
    expect(rimBrightness).toBeLessThan(MAX_GROUND_GRAY_BRIGHTNESS)
    expect(midBowlBrightness).toBeGreaterThan(MID_BOWL_MIN_BRIGHTNESS)
    expect(centerBrightness).toBeLessThan(rimBrightness)

    result.dispose()
  })

  it('reuses the already modulated asteroid material for the synthesized crater patch', async () => {
    const scene = buildFlatAsteroidScene()
    vi.mocked(loadGLB).mockResolvedValue(scene)

    const result = await createAsteroidSurface({
      modelPath: '/models/test-asteroid.glb',
      syntheticCrater: { x: 0, z: 0, radius: CRATER_RADIUS, depth: CRATER_DEPTH },
      surfaceTextures: '/textures/asteroids/default',
      surfaceTextureRepeat: 13,
      surfaceModulatorStrength: 0.9,
      surfaceModulatorColorBlend: 0.1,
      surfaceAOStrength: 0.6,
      surfaceEmissionStrength: 0.4,
      bake: {
        resolution: BAKE_RESOLUTION,
        worldSize: PLANE_SIZE,
        rayStartAltitude: BAKE_RAY_START_ALTITUDE,
      },
    })
    const patch = result.group.getObjectByName('synthetic-crater-patch') as THREE.Mesh
    const sourceMesh = scene.children[0] as THREE.Mesh

    expect(applyAsteroidSurfaceModulator).toHaveBeenCalledTimes(1)
    expect(applyAsteroidSurfaceModulator).toHaveBeenCalledWith(
      scene,
      expect.objectContaining({
        folder: '/textures/asteroids/default',
        repeat: 13,
        strength: 0.9,
        colorBlend: 0.1,
        aoStrength: 0.6,
        emissionStrength: 0.4,
      }),
    )
    expect(patch.material).not.toBe(sourceMesh.material)
    expect((patch.material as THREE.MeshStandardMaterial).vertexColors).toBe(true)

    result.dispose()
  })

  it('builds the crater patch in asteroid-local space so triplanar texture scale matches', async () => {
    const scene = buildFlatAsteroidScene()
    vi.mocked(loadGLB).mockResolvedValue(scene)

    const result = await createAsteroidSurface({
      modelPath: '/models/test-asteroid.glb',
      scale: MODEL_SCALE,
      syntheticCrater: { x: 0, z: 0, radius: CRATER_RADIUS, depth: CRATER_DEPTH },
      surfaceTextures: '/textures/asteroids/default',
      bake: {
        resolution: BAKE_RESOLUTION,
        worldSize: PLANE_SIZE,
        rayStartAltitude: BAKE_RAY_START_ALTITUDE,
      },
    })
    const patch = result.group.getObjectByName('synthetic-crater-patch') as THREE.Mesh
    const positions = patch.geometry.getAttribute('position') as THREE.BufferAttribute
    const worldPosition = new THREE.Vector3().fromBufferAttribute(positions, OUTER_RIM_VERTEX_INDEX)
    patch.localToWorld(worldPosition)

    expect(patch.parent).toBe(scene)
    expect(positions.getX(OUTER_RIM_VERTEX_INDEX)).toBeCloseTo(
      (CRATER_RADIUS * 1.4) / MODEL_SCALE,
      3,
    )
    expect(worldPosition.x).toBeCloseTo(CRATER_RADIUS * 1.4, 3)

    result.dispose()
  })
})
