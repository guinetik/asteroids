import * as THREE from 'three'
import type { SpaceTimeGrid } from './SpaceTimeGrid'

/**
 * Gravitational constant scaled for game units.
 * Real G = 6.674e-11 m³/(kg·s²). We use an exaggerated value
 * so that solar-mass bodies produce meaningful acceleration
 * on the shuttle at game-scale distances.
 */
const GRAVITY_CONSTANT = 3000

/** Minimum distance to prevent infinite force at center */
const MIN_GRAVITY_DISTANCE = 15

/**
 * Radius at which gravity becomes "significant" for the shuttle.
 * Used for the visual danger ring. Scales with sqrt(mass).
 */
const GRAVITY_INFLUENCE_SCALE = 400
const INFLUENCE_RING_SEGMENTS = 64

/**
 * Interface for any object that exerts gravitational pull.
 * Implemented by CelestialBody; future asteroids/stations could too.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
export interface GravityWell {
  readonly position: THREE.Vector3
  readonly mass: number // solar masses (M☉)

  /**
   * Calculate gravitational acceleration vector on a body at the given position.
   * Points toward this gravity source. Magnitude = G * M / r².
   */
  getGravityAt(position: THREE.Vector3): THREE.Vector3
}

export interface CelestialBodyConfig {
  name: string
  mass: number // solar masses
  radius: number // visual radius in game units
  color: number
  glowColor: number
  glowScale: number // glow radius multiplier (e.g. 1.3 = 30% larger than body)
  position: THREE.Vector3
}

/**
 * A massive body that distorts spacetime and pulls nearby objects.
 * Renders as a sphere with additive glow. Implements GravityWell
 * so the shuttle and any future objects can query gravitational pull.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
export class CelestialBody implements GravityWell {
  readonly name: string
  readonly mass: number
  readonly group = new THREE.Group()
  readonly influenceRadius: number
  private readonly bodyMesh: THREE.Mesh
  private readonly glowMesh: THREE.Mesh
  private readonly influenceRing: THREE.LineLoop
  private spaceTimeGrid: SpaceTimeGrid | null = null

  constructor(config: CelestialBodyConfig) {
    this.name = config.name
    this.mass = config.mass

    // Body sphere
    const bodyGeo = new THREE.SphereGeometry(config.radius, 32, 32)
    const bodyMat = new THREE.MeshBasicMaterial({ color: config.color })
    this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat)
    this.group.add(this.bodyMesh)

    // Glow sphere
    const glowRadius = config.radius * config.glowScale
    const glowGeo = new THREE.SphereGeometry(glowRadius, 32, 32)
    const glowMat = new THREE.MeshBasicMaterial({
      color: config.glowColor,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    })
    this.glowMesh = new THREE.Mesh(glowGeo, glowMat)
    this.group.add(this.glowMesh)

    // Gravity influence ring — red circle that follows the grid curvature
    this.influenceRadius = GRAVITY_INFLUENCE_SCALE * Math.sqrt(config.mass)
    const ringPositions = new Float32Array((INFLUENCE_RING_SEGMENTS + 1) * 3)
    const ringGeo = new THREE.BufferGeometry()
    ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPositions, 3))
    const ringMat = new THREE.LineBasicMaterial({
      color: 0xff2222,
      transparent: true,
      opacity: 0.5,
    })
    this.influenceRing = new THREE.LineLoop(ringGeo, ringMat)
    this.influenceRing.frustumCulled = false
    this.group.add(this.influenceRing)

    this.group.position.copy(config.position)
  }

  get position(): THREE.Vector3 {
    return this.group.position
  }

  setSpaceTimeGrid(grid: SpaceTimeGrid): void {
    this.spaceTimeGrid = grid
    this.updateInfluenceRing()
  }

  updateInfluenceRing(): void {
    const posAttr = this.influenceRing.geometry.getAttribute('position') as THREE.BufferAttribute
    const positions = posAttr.array as Float32Array
    const cx = this.position.x
    const cz = this.position.z

    for (let i = 0; i <= INFLUENCE_RING_SEGMENTS; i++) {
      const angle = (i / INFLUENCE_RING_SEGMENTS) * Math.PI * 2
      const wx = cx + Math.cos(angle) * this.influenceRadius
      const wz = cz + Math.sin(angle) * this.influenceRadius
      const wy = this.spaceTimeGrid
        ? -this.spaceTimeGrid.getDepthAt(wx, wz) + 0.5
        : 0.5

      // Positions are relative to group (which is at cx, cy, cz)
      positions[i * 3] = Math.cos(angle) * this.influenceRadius
      positions[i * 3 + 1] = wy - this.position.y
      positions[i * 3 + 2] = Math.sin(angle) * this.influenceRadius
    }

    posAttr.needsUpdate = true
  }

  getGravityAt(pos: THREE.Vector3): THREE.Vector3 {
    const direction = new THREE.Vector3().subVectors(this.position, pos)
    // Only XZ plane — no vertical pull
    direction.y = 0
    const dist = Math.max(direction.length(), MIN_GRAVITY_DISTANCE)

    // Smooth ramp: no pull outside influence radius, full 1/r² inside
    const t = Math.max(0, 1 - dist / this.influenceRadius)
    // Cubic ease-in so pull is gentle at the edge, aggressive near center
    const ramp = t * t * t

    const forceMag = (GRAVITY_CONSTANT * this.mass * ramp) / (dist * dist)
    return direction.normalize().multiplyScalar(forceMag)
  }

  dispose(): void {
    this.bodyMesh.geometry.dispose()
    ;(this.bodyMesh.material as THREE.MeshBasicMaterial).dispose()
    this.glowMesh.geometry.dispose()
    ;(this.glowMesh.material as THREE.MeshBasicMaterial).dispose()
    this.influenceRing.geometry.dispose()
    ;(this.influenceRing.material as THREE.LineBasicMaterial).dispose()
  }
}
