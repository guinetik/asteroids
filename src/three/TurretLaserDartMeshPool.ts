/**
 * Object pool for {@link TurretLaserDartMesh}.
 *
 * Drop-in counterpart to {@link EnemyProjectileMeshPool}: same
 * `acquire`/`release` shape so the host view can bind it directly to
 * {@link EnemyProjectileSystem.onProjectileMove} /
 * `onProjectileRemoved`. The pool keeps every dart parented under the
 * scene so acquire/release only toggle visibility instead of churning
 * scene-graph membership per shot.
 *
 * Acquire stores travel direction by tracking the previous frame's
 * position per dart, so the dart's cylindrical body aligns with motion.
 * On the very first frame after spawn there's no prior sample, so the
 * dart hides for one frame and then snaps into orientation — visually
 * indistinguishable at machine-gun cadence.
 *
 * @author guinetik
 * @date 2026-05-15
 * @spec docs/space-station-update-gdd.md
 */
import * as THREE from 'three'
import { TurretLaserDartMesh } from '@/three/TurretLaserDartMesh'

/** Default pre-warm count when none is specified. */
const DEFAULT_PREWARM_COUNT = 16

/** Per-dart book-keeping so `acquire` can derive a travel direction. */
interface DartState {
  /** Active mesh wrapping the visual. */
  mesh: TurretLaserDartMesh
  /** Previous-frame X position; `null` on the first frame after spawn. */
  lastX: number | null
  /** Previous-frame Y position. */
  lastY: number | null
  /** Previous-frame Z position. */
  lastZ: number | null
}

/**
 * Acquire / release pool for {@link TurretLaserDartMesh} instances.
 *
 * Construct once per scene, prewarm a batch, then wire `.acquire` and
 * `.release` to an `EnemyProjectileSystem`.
 */
export class TurretLaserDartMeshPool {
  private readonly scene: THREE.Scene
  /** Active states keyed by projectile id. */
  private readonly active = new Map<number, DartState>()
  /** Idle meshes parked off-screen. */
  private readonly free: TurretLaserDartMesh[] = []

  /**
   * @param scene - Scene every dart will be attached to.
   */
  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  /**
   * Pre-allocate a batch of darts and attach them (hidden) so the
   * renderer's shader precompile pass walks their materials. Without
   * this, the additive-blend `MeshBasicMaterial` variant would compile
   * on the first projectile spawn — a multi-hundred-millisecond stall.
   *
   * @param count - Number of darts to construct up-front.
   */
  prewarm(count: number = DEFAULT_PREWARM_COUNT): void {
    for (let i = 0; i < count; i++) {
      const mesh = new TurretLaserDartMesh()
      mesh.setVisible(false)
      this.scene.add(mesh.group)
      this.free.push(mesh)
    }
  }

  /**
   * Acquire-or-update for a projectile id. Wire directly to
   * `EnemyProjectileSystem.onProjectileMove`.
   *
   * @param id - Projectile id provided by the system.
   * @param x - World X position.
   * @param y - World Y position.
   * @param z - World Z position.
   */
  acquire = (id: number, x: number, y: number, z: number): void => {
    let state = this.active.get(id)
    if (!state) {
      const reused = this.free.pop()
      const mesh = reused ?? this.spawnFresh()
      mesh.reset()
      // No prior sample yet — hide for one frame, snap to orientation
      // next call. Imperceptible at machine-gun cadence.
      mesh.setVisible(false)
      state = { mesh, lastX: null, lastY: null, lastZ: null }
      this.active.set(id, state)
    } else if (state.lastX !== null && state.lastY !== null && state.lastZ !== null) {
      const dx = x - state.lastX
      const dy = y - state.lastY
      const dz = z - state.lastZ
      state.mesh.setVisible(true)
      state.mesh.setPositionAndDirection(x, y, z, dx, dy, dz)
    } else {
      state.mesh.group.position.set(x, y, z)
    }
    state.lastX = x
    state.lastY = y
    state.lastZ = z
  }

  /**
   * Return a dart to the free list. Wire to
   * `EnemyProjectileSystem.onProjectileRemoved`.
   *
   * @param id - Projectile id provided by the system.
   */
  release = (id: number): void => {
    const state = this.active.get(id)
    if (!state) return
    this.active.delete(id)
    state.mesh.setVisible(false)
    this.free.push(state.mesh)
  }

  /** Hard teardown — dispose every active + idle dart. */
  disposeAll(): void {
    for (const state of this.active.values()) state.mesh.dispose()
    this.active.clear()
    for (const mesh of this.free) mesh.dispose()
    this.free.length = 0
  }

  private spawnFresh(): TurretLaserDartMesh {
    const mesh = new TurretLaserDartMesh()
    this.scene.add(mesh.group)
    return mesh
  }
}
