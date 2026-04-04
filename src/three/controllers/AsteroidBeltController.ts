/**
 * Renders an asteroid belt as InstancedMeshes using GLB model geometry.
 *
 * Loads asteroid shapes from a GLB file, distributes instances with
 * power-law sizing, Rayleigh vertical spread, and Kirkwood gap
 * rejection sampling. Animates orbital drift and per-instance tumble.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-map-view-design.md
 */
import * as THREE from 'three'
import type { AsteroidBelt } from '@/lib/planets/types'
import { ORBIT_SCALE } from '@/lib/planets/constants'
import { loadGLB, fixMaterials } from '@/three/loadGLB'

/** GLB file used for asteroid geometry (both belts share this). */
const ASTEROID_GLB = '/models/asteroids.glb'

/** Per-geometry instance tracking for tumble animation. */
interface InstanceData {
  mesh: THREE.InstancedMesh
  baseMatrices: THREE.Matrix4[]
  tumbleAxes: THREE.Vector3[]
  tumbleSpeeds: number[]
}

/**
 * Extract all Mesh geometries from a loaded GLB scene.
 * Returns pairs of [geometry, material] for each unique mesh found.
 */
function extractGeometries(
  glbScene: THREE.Group,
): { geometry: THREE.BufferGeometry; material: THREE.Material }[] {
  const results: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = []
  glbScene.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      results.push({
        geometry: child.geometry.clone(),
        material: (Array.isArray(child.material) ? child.material[0]! : child.material).clone(),
      })
    }
  })
  return results
}

/**
 * Compute density at a normalized belt position (0=inner, 1=outer).
 * Returns 0-1 where Kirkwood gaps reduce density via Gaussian falloff.
 */
function beltDensity(
  normalizedPos: number,
  gaps: readonly { position: number; width: number }[],
): number {
  let density = 1.0
  for (const gap of gaps) {
    const dist = (normalizedPos - gap.position) / gap.width
    density *= 1.0 - Math.exp(-0.5 * dist * dist)
  }
  return density
}

/**
 * Sample a radius within the belt using rejection sampling for Kirkwood gaps.
 */
function sampleRadius(
  innerRadius: number,
  outerRadius: number,
  gaps: readonly { position: number; width: number }[],
): number {
  const range = outerRadius - innerRadius
  for (let attempt = 0; attempt < 100; attempt++) {
    const r = innerRadius + Math.random() * range
    const normalized = (r - innerRadius) / range
    const density = beltDensity(normalized, gaps)
    if (Math.random() < density) return r
  }
  return innerRadius + Math.random() * range
}

/**
 * Sample a scale using power-law distribution.
 * Higher exponent = more small asteroids.
 */
function sampleScale(sizeRange: readonly [number, number], exponent: number): number {
  return sizeRange[0] + (sizeRange[1] - sizeRange[0]) * Math.pow(Math.random(), exponent)
}

/**
 * Sample a Y offset using Rayleigh distribution (toroidal vertical spread).
 * Most asteroids cluster near the ecliptic plane with a natural tail.
 */
function sampleYOffset(thicknessDeg: number): number {
  const sigma = thicknessDeg * (Math.PI / 180)
  const rayleigh = sigma * Math.sqrt(-2 * Math.log(1 - Math.random()))
  return rayleigh * (Math.random() < 0.5 ? 1 : -1)
}

/**
 * Instanced asteroid belt with GLB-based geometry and Kirkwood gap rejection.
 */
export class AsteroidBeltController {
  readonly group: THREE.Group
  private instanceDataList: InstanceData[] = []
  private orbitalSpeed: number

  // Reusable objects for tick
  private readonly tumbleQuat = new THREE.Quaternion()
  private readonly tumbleMatrix = new THREE.Matrix4()
  private readonly composedMatrix = new THREE.Matrix4()

  private constructor(belt: AsteroidBelt) {
    this.group = new THREE.Group()
    this.group.name = belt.id
    this.orbitalSpeed = belt.orbitalSpeed
  }

  /**
   * Create an asteroid belt controller asynchronously.
   * Loads the GLB model and distributes instances.
   *
   * @param belt - Asteroid belt definition from the catalog
   * @returns The initialized controller
   */
  static async create(belt: AsteroidBelt): Promise<AsteroidBeltController> {
    const controller = new AsteroidBeltController(belt)

    // Load GLB
    const glbScene = await loadGLB(ASTEROID_GLB)
    fixMaterials(glbScene)
    const extracted = extractGeometries(glbScene)

    if (extracted.length === 0) {
      console.warn(`No meshes found in ${ASTEROID_GLB}`)
      return controller
    }

    // Distribute particles across geometries
    const numGeometries = extracted.length
    const perGeometry = Math.floor(belt.maxParticles / numGeometries)
    const remainder = belt.maxParticles % numGeometries

    // Reusable math objects for setup
    const position = new THREE.Vector3()
    const rotation = new THREE.Euler()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    const matrix = new THREE.Matrix4()

    for (let gi = 0; gi < numGeometries; gi++) {
      const { geometry, material } = extracted[gi]!
      const count = perGeometry + (gi < remainder ? 1 : 0)
      if (count === 0) continue

      // Tune material for asteroid rendering
      if (material instanceof THREE.MeshStandardMaterial) {
        material.roughness = Math.max(material.roughness, 0.9)
        material.metalness = Math.min(material.metalness, 0.1)
        const ec = belt.emissiveColor ?? [0.06, 0.05, 0.04]
        material.emissive = new THREE.Color(ec[0], ec[1], ec[2])
        material.emissiveIntensity = 0.5
      }

      const instancedMesh = new THREE.InstancedMesh(geometry, material, count)
      instancedMesh.frustumCulled = false

      const baseMatrices: THREE.Matrix4[] = []
      const tumbleAxes: THREE.Vector3[] = []
      const tumbleSpeeds: number[] = []

      for (let i = 0; i < count; i++) {
        // Radius with Kirkwood gap rejection
        const r = sampleRadius(belt.innerRadius, belt.outerRadius, belt.kirkwoodGaps) * ORBIT_SCALE

        // Random angle
        const angle = Math.random() * Math.PI * 2

        // Y offset (toroidal spread)
        const y = sampleYOffset(belt.thickness) * ORBIT_SCALE * belt.innerRadius

        position.set(Math.cos(angle) * r, y, Math.sin(angle) * r)

        // Scale (power law)
        const s = sampleScale(belt.sizeRange, belt.sizeExponent)
        scale.set(s, s, s)

        // Random rotation
        rotation.set(
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
        )
        quaternion.setFromEuler(rotation)

        // Build base matrix
        matrix.compose(position, quaternion, scale)
        const baseMatrix = matrix.clone()
        baseMatrices.push(baseMatrix)

        // Tumble axis + speed
        tumbleAxes.push(
          new THREE.Vector3(
            Math.random() - 0.5,
            Math.random() - 0.5,
            Math.random() - 0.5,
          ).normalize(),
        )
        tumbleSpeeds.push((0.5 + Math.random()) * belt.tumbleSpeed)

        instancedMesh.setMatrixAt(i, baseMatrix)
      }

      instancedMesh.instanceMatrix.needsUpdate = true
      controller.group.add(instancedMesh)

      controller.instanceDataList.push({
        mesh: instancedMesh,
        baseMatrices,
        tumbleAxes,
        tumbleSpeeds,
      })
    }

    return controller
  }

  tick(dt: number, simTime: number): void {
    // Slow orbital drift
    this.group.rotation.y += dt * this.orbitalSpeed

    // Per-instance tumble
    for (const data of this.instanceDataList) {
      for (let i = 0; i < data.mesh.count; i++) {
        const angle = simTime * data.tumbleSpeeds[i]!
        this.tumbleQuat.setFromAxisAngle(data.tumbleAxes[i]!, angle)
        this.tumbleMatrix.makeRotationFromQuaternion(this.tumbleQuat)
        this.composedMatrix.multiplyMatrices(data.baseMatrices[i]!, this.tumbleMatrix)
        data.mesh.setMatrixAt(i, this.composedMatrix)
      }
      data.mesh.instanceMatrix.needsUpdate = true
    }
  }

  dispose(): void {
    for (const data of this.instanceDataList) {
      data.mesh.geometry.dispose()
      const mat = data.mesh.material
      if (Array.isArray(mat)) {
        mat.forEach((m) => m.dispose())
      } else {
        mat.dispose()
      }
    }
  }
}
