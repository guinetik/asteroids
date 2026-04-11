/**
 * Renders an asteroid belt as InstancedMeshes using GLB model geometry.
 *
 * Loads asteroid shapes from a GLB file, distributes instances with
 * power-law sizing, Rayleigh vertical spread, and Kirkwood gap
 * rejection sampling. Animates slow belt-wide orbital drift and a
 * bounded subset of nearby tumbling instances.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-04-map-view-design.md
 * @spec docs/superpowers/specs/2026-04-06-nearby-asteroid-tumble-design.md
 */
import * as THREE from 'three'
import type { AsteroidBelt } from '@/lib/planets/types'
import { ORBIT_SCALE } from '@/lib/planets/constants'
import { loadGLB, fixMaterials } from '@/three/loadGLB'
import {
  decideNearbyTumbleState,
  getNearbyTumbleSampleWindow,
  isWithinNearbyTumbleRadius,
} from '@/three/controllers/asteroidBeltNearbyTumble'

/** GLB file used for asteroid geometry (both belts share this). */
const ASTEROID_GLB = '/models/asteroids.glb'

/**
 * Belt-local distance within which sampled instances may activate tumbling
 * (same length units as instance positions after `ORBIT_SCALE`).
 */
const NEARBY_TUMBLE_RADIUS = 32 * ORBIT_SCALE

/** Run tumble membership / activation sampling only every N frames. */
const NEARBY_TUMBLE_EVALUATION_INTERVAL_FRAMES = 4

/** Maximum instance indices inspected per InstancedMesh per evaluation pass. */
const NEARBY_TUMBLE_SAMPLES_PER_PASS = 8

/** Lottery threshold for starting tumble when nearby and under the active cap. */
const NEARBY_TUMBLE_ACTIVATION_CHANCE = 0.04

/** Lottery threshold for stopping an active tumbler while still nearby. */
const NEARBY_TUMBLE_DEACTIVATION_CHANCE = 0.02

/** Hard cap on simultaneously tumbling asteroids for this belt (all meshes). */
const NEARBY_TUMBLE_MAX_ACTIVE = 24

/** Scales catalog tumble speed into radians per unit sim time for the tumble axis. */
const NEARBY_TUMBLE_ANGLE_SCALE = 1.2

/** Lower bound multiplier on per-instance tumble angular velocity. */
const TUMBLE_SPEED_JITTER_RATIO_MIN = 0.75

/** Upper bound multiplier on per-instance tumble angular velocity. */
const TUMBLE_SPEED_JITTER_RATIO_MAX = 1.35

/** Approximate asteroid collision radius multiplier from sampled instance scale. */
const ASTEROID_COLLISION_RADIUS_SCALE = 0.5

/**
 * Per-geometry instance tracking: mesh, placement caches, and nearby tumble state.
 */
interface BeltInstanceData {
  /** Instanced draw for one asteroid shape. */
  mesh: THREE.InstancedMesh
  /** Total allocated instances (never changes after init). */
  maxCount: number
  /** Original instance transforms (never includes tumble offset). */
  baseMatrices: THREE.Matrix4[]
  /** Positions in belt group space (matches columns of base matrix translation). */
  localPositions: THREE.Vector3[]
  /** Unit axes for local tumble rotation. */
  tumbleAxes: THREE.Vector3[]
  /** Per-instance angular velocity scale (radians per sim-time unit). */
  tumbleSpeeds: number[]
  /** Approximate per-instance collision radii in belt-local units. */
  collisionRadii: number[]
  /** Parallel to `activeTumblerSet` for O(1) lookup in the sample window. */
  isTumbling: boolean[]
  /** Indices currently receiving per-frame tumble matrix updates. */
  activeTumblerSet: Set<number>
  /** Rotates which visible indices are considered each evaluation pass. */
  sampleCursor: number
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
  private instanceDataList: BeltInstanceData[] = []
  private orbitalSpeed: number
  private innerRadiusWorld = 0
  private outerRadiusWorld = 0

  private tumbleEvaluationFrameCounter = 0
  private nearbyTumblerActiveCount = 0

  private readonly _shuttleBeltLocal = new THREE.Vector3()
  private readonly _shuttleLocalLike = { x: 0, y: 0, z: 0 }
  private readonly _asteroidLocalLike = { x: 0, y: 0, z: 0 }
  private readonly _workMatrix = new THREE.Matrix4()
  private readonly _tumbleRotMatrix = new THREE.Matrix4()
  private readonly _impactWorldPosition = new THREE.Vector3()

  private constructor(belt: AsteroidBelt) {
    this.group = new THREE.Group()
    this.group.name = belt.id
    this.orbitalSpeed = belt.orbitalSpeed
    this.innerRadiusWorld = belt.innerRadius * ORBIT_SCALE
    this.outerRadiusWorld = belt.outerRadius * ORBIT_SCALE
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
      const localPositions: THREE.Vector3[] = []
      const tumbleAxes: THREE.Vector3[] = []
      const tumbleSpeeds: number[] = []
      const collisionRadii: number[] = []
      const isTumbling: boolean[] = []

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

        matrix.compose(position, quaternion, scale)
        instancedMesh.setMatrixAt(i, matrix)

        baseMatrices.push(matrix.clone())
        localPositions.push(position.clone())
        const tumbleAxis = new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5,
        ).normalize()
        tumbleAxes.push(tumbleAxis)
        const jitter =
          TUMBLE_SPEED_JITTER_RATIO_MIN +
          Math.random() * (TUMBLE_SPEED_JITTER_RATIO_MAX - TUMBLE_SPEED_JITTER_RATIO_MIN)
        tumbleSpeeds.push(belt.tumbleSpeed * jitter)
        collisionRadii.push(s * ASTEROID_COLLISION_RADIUS_SCALE)
        isTumbling.push(false)
      }

      instancedMesh.instanceMatrix.needsUpdate = true
      controller.group.add(instancedMesh)

      controller.instanceDataList.push({
        mesh: instancedMesh,
        maxCount: count,
        baseMatrices,
        localPositions,
        tumbleAxes,
        tumbleSpeeds,
        collisionRadii,
        isTumbling,
        activeTumblerSet: new Set<number>(),
        sampleCursor: 0,
      })
    }

    return controller
  }

  /**
   * Set the visible fraction of instances (0–1). Used for distance-based LOD.
   * At fraction=1 all instances render; at 0.25 only 25% are shown.
   */
  setLodFraction(fraction: number): void {
    const f = Math.max(0, Math.min(1, fraction))
    for (const data of this.instanceDataList) {
      data.mesh.count = Math.max(1, Math.round(data.maxCount * f))
    }
  }

  /**
   * Advance belt orbital motion and optional nearby tumble animation.
   *
   * @param dt - Frame delta time (seconds)
   * @param simTime - Accumulated simulation time for tumble phase
   * @param shuttleWorldPosition - Shuttle world position, or null to skip nearby tumble work
   */
  tick(dt: number, simTime: number, shuttleWorldPosition: THREE.Vector3 | null): void {
    this.group.rotation.y += dt * this.orbitalSpeed

    if (!shuttleWorldPosition) {
      return
    }

    this._shuttleBeltLocal.copy(shuttleWorldPosition)
    this.group.worldToLocal(this._shuttleBeltLocal)
    this._shuttleLocalLike.x = this._shuttleBeltLocal.x
    this._shuttleLocalLike.y = this._shuttleBeltLocal.y
    this._shuttleLocalLike.z = this._shuttleBeltLocal.z

    this.tumbleEvaluationFrameCounter += 1
    const shouldEvaluateNearbyTumble =
      this.tumbleEvaluationFrameCounter % NEARBY_TUMBLE_EVALUATION_INTERVAL_FRAMES === 0

    if (shouldEvaluateNearbyTumble) {
      for (const data of this.instanceDataList) {
        const visibleCount = data.mesh.count
        let wroteInstanceMatrix = false
        const activeSnapshot = [...data.activeTumblerSet]

        for (const idx of activeSnapshot) {
          if (idx >= visibleCount) {
            data.mesh.setMatrixAt(idx, data.baseMatrices[idx]!)
            data.isTumbling[idx] = false
            data.activeTumblerSet.delete(idx)
            this.nearbyTumblerActiveCount -= 1
            wroteInstanceMatrix = true
            continue
          }

          const localPos = data.localPositions[idx]!
          this._asteroidLocalLike.x = localPos.x
          this._asteroidLocalLike.y = localPos.y
          this._asteroidLocalLike.z = localPos.z

          const isInsideNearbyRadius = isWithinNearbyTumbleRadius({
            shuttleLocal: this._shuttleLocalLike,
            asteroidLocal: this._asteroidLocalLike,
            nearbyRadius: NEARBY_TUMBLE_RADIUS,
          })

          if (!isInsideNearbyRadius) {
            data.mesh.setMatrixAt(idx, data.baseMatrices[idx]!)
            data.isTumbling[idx] = false
            data.activeTumblerSet.delete(idx)
            this.nearbyTumblerActiveCount -= 1
            wroteInstanceMatrix = true
          }
        }

        const sampleWindow = getNearbyTumbleSampleWindow({
          sampleCursor: data.sampleCursor,
          samplesPerPass: NEARBY_TUMBLE_SAMPLES_PER_PASS,
          visibleCount,
        })
        if (!sampleWindow) {
          if (wroteInstanceMatrix) {
            data.mesh.instanceMatrix.needsUpdate = true
          }
          continue
        }

        for (let w = 0; w < sampleWindow.windowLength; w += 1) {
          const idx = (sampleWindow.startIndex + w) % visibleCount
          const wasTumbling = data.isTumbling[idx]!
          const localPos = data.localPositions[idx]!
          this._asteroidLocalLike.x = localPos.x
          this._asteroidLocalLike.y = localPos.y
          this._asteroidLocalLike.z = localPos.z

          const isInsideNearbyRadius = isWithinNearbyTumbleRadius({
            shuttleLocal: this._shuttleLocalLike,
            asteroidLocal: this._asteroidLocalLike,
            nearbyRadius: NEARBY_TUMBLE_RADIUS,
          })

          const decision = decideNearbyTumbleState({
            isInsideNearbyRadius,
            isCurrentlyTumbling: wasTumbling,
            activeTumblerCount: this.nearbyTumblerActiveCount,
            maxActiveTumblers: NEARBY_TUMBLE_MAX_ACTIVE,
            activationRoll: Math.random(),
            activationChance: NEARBY_TUMBLE_ACTIVATION_CHANCE,
            deactivationRoll: Math.random(),
            deactivationChance: NEARBY_TUMBLE_DEACTIVATION_CHANCE,
          })

          if (decision.nextIsTumbling !== wasTumbling) {
            if (decision.nextIsTumbling) {
              data.activeTumblerSet.add(idx)
            } else {
              data.activeTumblerSet.delete(idx)
            }
            this.nearbyTumblerActiveCount += decision.nextIsTumbling ? 1 : -1
          }

          data.isTumbling[idx] = decision.nextIsTumbling

          const shouldResetToBaseMatrix =
            decision.shouldResetToBaseMatrix || (wasTumbling && !decision.nextIsTumbling)

          if (shouldResetToBaseMatrix) {
            data.mesh.setMatrixAt(idx, data.baseMatrices[idx]!)
            wroteInstanceMatrix = true
          }
        }

        data.sampleCursor =
          (data.sampleCursor + sampleWindow.windowLength) % Math.max(1, visibleCount)

        if (wroteInstanceMatrix) {
          data.mesh.instanceMatrix.needsUpdate = true
        }
      }
    }

    for (const data of this.instanceDataList) {
      const mesh = data.mesh
      let wroteMatrices = false
      const activeSnapshot = [...data.activeTumblerSet]
      for (const idx of activeSnapshot) {
        if (idx >= mesh.count) {
          mesh.setMatrixAt(idx, data.baseMatrices[idx]!)
          data.isTumbling[idx] = false
          data.activeTumblerSet.delete(idx)
          this.nearbyTumblerActiveCount -= 1
          wroteMatrices = true
          continue
        }

        const angle = simTime * data.tumbleSpeeds[idx]! * NEARBY_TUMBLE_ANGLE_SCALE
        this._tumbleRotMatrix.makeRotationAxis(data.tumbleAxes[idx]!, angle)
        this._workMatrix.multiplyMatrices(data.baseMatrices[idx]!, this._tumbleRotMatrix)
        mesh.setMatrixAt(idx, this._workMatrix)
        wroteMatrices = true
      }
      if (wroteMatrices) {
        mesh.instanceMatrix.needsUpdate = true
      }
    }
  }

  /**
   * Return the nearest currently visible asteroid overlapping the shuttle.
   *
   * Uses simple sphere overlap in belt-local space; intended for map-view
   * impact gameplay rather than exact mesh collision.
   */
  findNearestImpact(
    shuttleWorldPosition: THREE.Vector3,
    shuttleRadius: number,
  ): { worldPosition: THREE.Vector3; asteroidRadius: number; distance: number } | null {
    this._shuttleBeltLocal.copy(shuttleWorldPosition)
    this.group.worldToLocal(this._shuttleBeltLocal)

    const shuttleRadial = Math.hypot(this._shuttleBeltLocal.x, this._shuttleBeltLocal.z)
    if (
      shuttleRadial < this.innerRadiusWorld - NEARBY_TUMBLE_RADIUS ||
      shuttleRadial > this.outerRadiusWorld + NEARBY_TUMBLE_RADIUS
    ) {
      return null
    }

    let nearestData: { localPosition: THREE.Vector3; asteroidRadius: number; distance: number } | null =
      null

    for (const data of this.instanceDataList) {
      const visibleCount = data.mesh.count
      for (let i = 0; i < visibleCount; i += 1) {
        const localPosition = data.localPositions[i]!
        const asteroidRadius = data.collisionRadii[i]!
        const dx = localPosition.x - this._shuttleBeltLocal.x
        const dy = localPosition.y - this._shuttleBeltLocal.y
        const dz = localPosition.z - this._shuttleBeltLocal.z
        const distSq = dx * dx + dy * dy + dz * dz
        const impactRadius = shuttleRadius + asteroidRadius

        if (distSq > impactRadius * impactRadius) continue

        const distance = Math.sqrt(distSq)
        if (!nearestData || distance < nearestData.distance) {
          nearestData = { localPosition, asteroidRadius, distance }
        }
      }
    }

    if (!nearestData) return null

    this._impactWorldPosition.copy(nearestData.localPosition)
    this.group.localToWorld(this._impactWorldPosition)

    return {
      worldPosition: this._impactWorldPosition.clone(),
      asteroidRadius: nearestData.asteroidRadius,
      distance: nearestData.distance,
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
