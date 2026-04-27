/**
 * Object pool for {@link EnemyProjectileMesh} instances.
 *
 * Centralizes the acquire/release pattern that was previously duplicated
 * across `ExterminateMinigame`, `RescueMinigame`, and `FpsViewController`.
 * Each scene owns one pool; it binds `acquire`/`release` directly to the
 * `EnemyProjectileSystem.onProjectileMove` / `onProjectileRemoved`
 * callbacks.
 *
 * @author guinetik
 * @date 2026-04-18
 * @spec docs/superpowers/specs/2026-04-18-fps-perf-fixes-design.md
 */
import * as THREE from 'three'
import { EnemyProjectileMesh } from './EnemyProjectileMesh'

/** Default pre-warm count when none is specified. */
const DEFAULT_PREWARM_COUNT = 32

/**
 * Acquires {@link EnemyProjectileMesh} instances from a free list and
 * returns them when projectiles are removed. Holds a reference to the
 * scene so it can attach/detach the underlying group transparently.
 *
 * @author guinetik
 * @date 2026-04-18
 * @spec docs/superpowers/specs/2026-04-18-fps-perf-fixes-design.md
 */
export class EnemyProjectileMeshPool {
  private readonly scene: THREE.Scene
  /** Active meshes keyed by projectile id. */
  private readonly active = new Map<number, EnemyProjectileMesh>()
  /** Idle meshes parked off-scene, ready to be re-acquired. */
  private readonly free: EnemyProjectileMesh[] = []

  /**
   * @param scene - Scene that active meshes will be attached to.
   */
  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  /**
   * Pre-allocate a batch of meshes and attach them to the scene up-front
   * (hidden) so the renderer's shader precompile pass walks their
   * materials. Without this, the additive-blend `MeshBasicMaterial`
   * variant would compile on the first projectile spawn — a multi-hundred
   * millisecond stall mid-combat. Acquire/release now toggle visibility
   * instead of churning scene-graph membership per shot.
   *
   * @param count - Number of meshes to construct up-front (defaults to 32).
   */
  prewarm(count: number = DEFAULT_PREWARM_COUNT): void {
    for (let i = 0; i < count; i++) {
      const mesh = new EnemyProjectileMesh()
      mesh.setVisible(false)
      this.scene.add(mesh.group)
      this.free.push(mesh)
    }
  }

  /**
   * Acquire a mesh for a newly spawned projectile and place it at the
   * given world position. Wire this directly to
   * `EnemyProjectileSystem.onProjectileMove`.
   *
   * @param id - Projectile id provided by the system.
   * @param x - World X position.
   * @param y - World Y position.
   * @param z - World Z position.
   */
  acquire = (id: number, x: number, y: number, z: number): void => {
    let mesh = this.active.get(id)
    if (!mesh) {
      const reused = this.free.pop()
      if (reused) {
        mesh = reused
      } else {
        // Free list exhausted — pool is undersized for the current
        // encounter. Construct on demand and keep the mesh in the
        // scene for future reuse.
        mesh = new EnemyProjectileMesh()
        this.scene.add(mesh.group)
      }
      mesh.reset()
      this.active.set(id, mesh)
    }
    mesh.setPosition(x, y, z)
  }

  /**
   * Return a mesh to the free list. Wire this directly to
   * `EnemyProjectileSystem.onProjectileRemoved`. The mesh stays attached
   * to the scene so it can be reused without touching scene-graph state.
   *
   * @param id - Projectile id provided by the system.
   */
  release = (id: number): void => {
    const mesh = this.active.get(id)
    if (!mesh) return
    this.active.delete(id)
    mesh.setVisible(false)
    this.free.push(mesh)
  }

  /**
   * Hard teardown — dispose every active and idle mesh and clear all
   * internal state. Call from the owning scene's `dispose()`.
   */
  disposeAll(): void {
    for (const mesh of this.active.values()) {
      mesh.dispose()
    }
    this.active.clear()
    for (const mesh of this.free) {
      mesh.dispose()
    }
    this.free.length = 0
  }
}
