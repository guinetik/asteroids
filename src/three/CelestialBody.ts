import * as THREE from 'three'
import { gravityAt, influenceRadius, eventHorizonRadius, type GravitySource } from '@/lib/physics/gravity'
import { GravityRing } from './GravityRing'
import type { SpaceTimeGrid } from './SpaceTimeGrid'

/** Authoring data for a sun or planet mesh plus gravity visualization. */
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
 * Composes GravitySource (pure math) + GravityRing (visual) + mesh rendering.
 * Any Three.js object can use GravitySource + GravityRing independently
 * without inheriting from this class.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
export class CelestialBody implements GravitySource {
  readonly name: string
  readonly mass: number
  readonly group = new THREE.Group()
  readonly gravityRing: GravityRing
  readonly horizonRing: GravityRing

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

    // Gravity influence ring (red — pull starts here)
    this.gravityRing = new GravityRing(influenceRadius(config.mass))
    this.group.add(this.gravityRing.ring)

    // Event horizon ring (orange — point of no return)
    this.horizonRing = new GravityRing(eventHorizonRadius(config.mass), 0xff6600, 0.8)
    this.group.add(this.horizonRing.ring)

    this.group.position.copy(config.position)
  }

  // GravitySource interface
  getWorldX(): number {
    return this.group.position.x
  }

  getWorldZ(): number {
    return this.group.position.z
  }

  get position(): THREE.Vector3 {
    return this.group.position
  }

  setSpaceTimeGrid(grid: SpaceTimeGrid): void {
    this.gravityRing.setSpaceTimeGrid(grid)
    this.gravityRing.update(this.position.x, this.position.y, this.position.z)
    this.horizonRing.setSpaceTimeGrid(grid)
    this.horizonRing.update(this.position.x, this.position.y, this.position.z)
  }

  /**
   * Calculate gravitational acceleration at a given position.
   * Delegates to the pure gravity math primitive.
   */
  getGravityAt(pos: THREE.Vector3): THREE.Vector3 {
    const g = gravityAt(this.getWorldX(), this.getWorldZ(), this.mass, pos.x, pos.z)
    return new THREE.Vector3(g.ax, 0, g.az)
  }

  dispose(): void {
    this.bodyMesh.geometry.dispose()
    ;(this.bodyMesh.material as THREE.MeshBasicMaterial).dispose()
    this.glowMesh.geometry.dispose()
    ;(this.glowMesh.material as THREE.MeshBasicMaterial).dispose()
    this.gravityRing.dispose()
    this.horizonRing.dispose()
  }
}
