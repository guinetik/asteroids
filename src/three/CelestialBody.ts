import * as THREE from 'three'

/**
 * Gravitational constant scaled for game units.
 * Real G = 6.674e-11 m³/(kg·s²). We use an exaggerated value
 * so that solar-mass bodies produce meaningful acceleration
 * on the shuttle at game-scale distances.
 */
const GRAVITY_CONSTANT = 800

/** Minimum distance to prevent infinite force at center */
const MIN_GRAVITY_DISTANCE = 10

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
  private readonly bodyMesh: THREE.Mesh
  private readonly glowMesh: THREE.Mesh

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

    this.group.position.copy(config.position)
  }

  get position(): THREE.Vector3 {
    return this.group.position
  }

  getGravityAt(pos: THREE.Vector3): THREE.Vector3 {
    const direction = new THREE.Vector3().subVectors(this.position, pos)
    // Only XZ plane — no vertical pull
    direction.y = 0
    const distSq = Math.max(direction.lengthSq(), MIN_GRAVITY_DISTANCE * MIN_GRAVITY_DISTANCE)
    const forceMag = (GRAVITY_CONSTANT * this.mass) / distSq
    return direction.normalize().multiplyScalar(forceMag)
  }

  dispose(): void {
    this.bodyMesh.geometry.dispose()
    ;(this.bodyMesh.material as THREE.MeshBasicMaterial).dispose()
    this.glowMesh.geometry.dispose()
    ;(this.glowMesh.material as THREE.MeshBasicMaterial).dispose()
  }
}
