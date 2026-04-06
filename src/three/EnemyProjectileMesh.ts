/**
 * Glowing sphere visual for enemy-fired projectiles.
 *
 * Simple additive-blended sphere with point light.
 * The VC creates one per spawned projectile and syncs position.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-spire-enemy-design.md
 */
import * as THREE from 'three'

const PROJECTILE_RADIUS = 0.3
const PROJECTILE_SEGMENTS = 6
const LIGHT_INTENSITY = 1.5
const LIGHT_DISTANCE = 8

const projectileGeo = new THREE.SphereGeometry(PROJECTILE_RADIUS, PROJECTILE_SEGMENTS, PROJECTILE_SEGMENTS)
const projectileMat = new THREE.MeshBasicMaterial({
  color: 0xff6600,
  transparent: true,
  opacity: 0.9,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})

/**
 * Glowing enemy projectile mesh.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-spire-enemy-design.md
 */
export class EnemyProjectileMesh {
  readonly group = new THREE.Group()
  private readonly light: THREE.PointLight

  constructor() {
    const sphere = new THREE.Mesh(projectileGeo, projectileMat)
    this.group.add(sphere)

    this.light = new THREE.PointLight(0xff6600, LIGHT_INTENSITY, LIGHT_DISTANCE)
    this.group.add(this.light)
  }

  /** Update world position. */
  setPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z)
  }

  /** Clean up — only disposes instance-owned resources. */
  dispose(): void {
    this.group.removeFromParent()
    this.light.dispose()
  }
}
