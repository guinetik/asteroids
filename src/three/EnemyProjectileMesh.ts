/**
 * Glowing sphere visual for enemy-fired projectiles.
 *
 * Pool-friendly: no per-instance lights, no per-instance materials.
 * Use {@link EnemyProjectileMeshPool} to acquire/release instances
 * instead of `new`/`dispose` per shot.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-spire-enemy-design.md
 * @spec docs/superpowers/specs/2026-04-18-fps-perf-fixes-design.md
 */
import * as THREE from 'three'

const PROJECTILE_RADIUS = 0.3
const PROJECTILE_SEGMENTS = 6
const HALO_RADIUS = 0.9
const HALO_OPACITY = 0.55

/** Shared sphere geometry — every instance reuses the same buffer. */
const projectileGeo = new THREE.SphereGeometry(PROJECTILE_RADIUS, PROJECTILE_SEGMENTS, PROJECTILE_SEGMENTS)

/** Shared core material — additive blend, depthWrite off so it doesn't cut into terrain. */
const projectileMat = new THREE.MeshBasicMaterial({
  color: 0xff6600,
  transparent: true,
  opacity: 0.9,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})

/** Shared halo billboard geometry — flat plane, kept facing the camera by Three.js sprite material. */
const haloGeo = new THREE.PlaneGeometry(HALO_RADIUS * 2, HALO_RADIUS * 2)

/**
 * Shared halo material — soft additive glow standing in for the dynamic point light
 * we used to allocate per projectile.
 */
const haloMat = new THREE.MeshBasicMaterial({
  color: 0xff6600,
  transparent: true,
  opacity: HALO_OPACITY,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})

/**
 * Glowing enemy projectile mesh.
 *
 * Owns no per-instance disposable resources beyond the `THREE.Group`
 * itself (geometry/material are shared module-level). Pool the instance
 * via {@link EnemyProjectileMeshPool}.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-spire-enemy-design.md
 * @spec docs/superpowers/specs/2026-04-18-fps-perf-fixes-design.md
 */
export class EnemyProjectileMesh {
  /** Root group — add to scene on acquire, remove on release. */
  readonly group = new THREE.Group()

  constructor() {
    const sphere = new THREE.Mesh(projectileGeo, projectileMat)
    this.group.add(sphere)

    // Camera-facing halo billboard. Cheaper than a PointLight and looks similar.
    const halo = new THREE.Mesh(haloGeo, haloMat)
    halo.renderOrder = 1
    this.group.add(halo)
  }

  /**
   * Update world position.
   *
   * @param x - World X
   * @param y - World Y
   * @param z - World Z
   */
  setPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z)
  }

  /**
   * Toggle visibility — used by the pool when releasing the mesh back to the free list.
   *
   * @param visible - Whether the group should render this frame
   */
  setVisible(visible: boolean): void {
    this.group.visible = visible
  }

  /**
   * Reset to a clean state ready for re-acquisition (visible, at the origin).
   * Called by the pool when handing the mesh back out.
   */
  reset(): void {
    this.group.visible = true
    this.group.position.set(0, 0, 0)
  }

  /**
   * Hard teardown — only called by the pool's `disposeAll`. Removes the
   * group from any parent. Shared geometry/material are module-level
   * and intentionally not disposed here.
   */
  dispose(): void {
    this.group.removeFromParent()
  }
}
