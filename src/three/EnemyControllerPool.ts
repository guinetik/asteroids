/**
 * Centralized object pool for procedural enemy controllers.
 *
 * Every system that spawns Bacteriophage / Spire / Chimera enemies — rescue
 * minigames, exterminate waves, level disturbance director, future arenas —
 * borrows from a single shared pool instead of allocating fresh
 * `THREE.ShaderMaterial`s + `MutableTubeGeometry` instances on demand. A pre-
 * built controller has its VAOs warmed during the level's `precompileShaders`
 * pass (via {@link stageForPrewarm}), so the first time it shows up in
 * gameplay there is no compile/upload hitch.
 *
 * Pool sizing is per-archetype and supplied by the caller. Consumers that
 * need a controller call `acquireX(enemy)` — the pool pops from the free
 * list, recycles the controller against the freshly spawned domain `Enemy`,
 * and hands it back. Death/cleanup calls `releaseX(ctrl)` which retires the
 * controller (parks it at y=-10000, resets transforms/materials) and pushes
 * it back onto the free list.
 *
 * Pool exhaustion (more concurrent spawns than capacity) returns `null` —
 * callers must size up front. Falling back to `new ...Controller()` would
 * defeat the purpose of pooling because the fresh allocation would hit the
 * very VAO build we're trying to amortize.
 *
 * @author guinetik
 * @date 2026-05-11
 * @spec docs/asteroid-lander-gdd.md
 */
import * as THREE from 'three'
import { Enemy } from '@/lib/fps/enemy'
import { BacteriophageController } from '@/three/BacteriophageController'
import { ChimeraWalkerController } from '@/three/ChimeraWalkerController'
import { SpireController } from '@/three/SpireController'
import type { EnemyLightPool } from '@/three/EnemyLightPool'
import type { EnemyVisualTier } from '@/three/enemyVisualPalette'

/** Distance ahead of the prewarm camera to anchor staged pool controllers. */
const PREWARM_CAMERA_FORWARD_DISTANCE = 24
/** Lateral spacing between staged pool controllers during prewarm. */
const PREWARM_CONTROLLER_SPACING = 6
/** Stub enemy stats for pre-built controllers — overwritten on recycle. */
const POOL_STUB_ENEMY_HP = 1
/** Stub hit radius for pre-built controllers — overwritten on recycle. */
const POOL_STUB_ENEMY_HIT_RADIUS = 1

/**
 * Construction inputs for {@link EnemyControllerPool}.
 *
 * @author guinetik
 * @date 2026-05-11
 */
export interface EnemyControllerPoolDeps {
  /** Scene the retired controllers are parented under for the level lifetime. */
  scene: THREE.Scene
  /** Palette tier — derived from mission difficulty (same value used by every consumer in the level). */
  visualTier: EnemyVisualTier
  /** Shared light pool, or `null` when controllers should own their own lights. */
  lightPool: EnemyLightPool | null
  /** Number of bacteriophage controllers to pre-build. */
  phageCapacity: number
  /** Number of chimera walker controllers to pre-build. */
  chimeraCapacity: number
  /** Number of spire controllers to pre-build. */
  spireCapacity: number
}

/**
 * Single source of truth for procedural enemy controller instances across the
 * level. See module header for design notes.
 *
 * @author guinetik
 * @date 2026-05-11
 */
export class EnemyControllerPool {
  private readonly scene: THREE.Scene
  private readonly phageFree: BacteriophageController[] = []
  private readonly spireFree: SpireController[] = []
  private readonly chimeraFree: ChimeraWalkerController[] = []
  /** All controllers owned by the pool — borrowed or free — for prewarm + dispose. */
  private readonly allControllers: Array<
    BacteriophageController | SpireController | ChimeraWalkerController
  > = []
  /** Saved parked positions during {@link stageForPrewarm}. */
  private readonly prewarmRestoreEntries: Array<{
    ctrl: BacteriophageController | SpireController | ChimeraWalkerController
    position: THREE.Vector3
  }> = []
  /** Saved per-mesh frustum-culled flags during {@link stageForPrewarm}. */
  private readonly prewarmFrustumCullState: Array<{
    obj: THREE.Object3D
    frustumCulled: boolean
  }> = []
  private disposed = false

  /**
   * Build the per-archetype capacities up-front and park them retired.
   *
   * @param deps - Scene, palette, light-pool wiring, and per-archetype capacities.
   */
  constructor(deps: EnemyControllerPoolDeps) {
    this.scene = deps.scene

    for (let i = 0; i < deps.phageCapacity; i++) {
      const ctrl = new BacteriophageController(makeStubEnemy(), {
        visualTier: deps.visualTier,
        lightPool: deps.lightPool,
      })
      ctrl.retire()
      this.scene.add(ctrl.group)
      this.phageFree.push(ctrl)
      this.allControllers.push(ctrl)
    }

    for (let i = 0; i < deps.chimeraCapacity; i++) {
      const ctrl = new ChimeraWalkerController(makeStubEnemy(), {
        visualTier: deps.visualTier,
        lightPool: deps.lightPool,
      })
      ctrl.retire()
      this.scene.add(ctrl.group)
      this.chimeraFree.push(ctrl)
      this.allControllers.push(ctrl)
    }

    for (let i = 0; i < deps.spireCapacity; i++) {
      const ctrl = new SpireController(makeStubEnemy(), {
        visualTier: deps.visualTier,
        lightPool: deps.lightPool,
      })
      ctrl.retire()
      this.scene.add(ctrl.group)
      this.spireFree.push(ctrl)
      this.allControllers.push(ctrl)
    }
  }

  /**
   * Borrow a bacteriophage controller bound to the supplied domain enemy.
   *
   * @param enemy - Freshly spawned domain entity the controller will track.
   * @returns Pooled controller, or `null` if the per-archetype capacity is exhausted.
   */
  acquirePhage(enemy: Enemy): BacteriophageController | null {
    const ctrl = this.phageFree.pop()
    if (!ctrl) return null
    ctrl.recycle(enemy)
    return ctrl
  }

  /**
   * Borrow a chimera walker controller bound to the supplied domain enemy.
   *
   * @param enemy - Freshly spawned domain entity the controller will track.
   * @returns Pooled controller, or `null` if the per-archetype capacity is exhausted.
   */
  acquireChimera(enemy: Enemy): ChimeraWalkerController | null {
    const ctrl = this.chimeraFree.pop()
    if (!ctrl) return null
    ctrl.recycle(enemy)
    return ctrl
  }

  /**
   * Borrow a spire controller bound to the supplied domain enemy.
   *
   * @param enemy - Freshly spawned domain entity the controller will track.
   * @returns Pooled controller, or `null` if the per-archetype capacity is exhausted.
   */
  acquireSpire(enemy: Enemy): SpireController | null {
    const ctrl = this.spireFree.pop()
    if (!ctrl) return null
    ctrl.recycle(enemy)
    return ctrl
  }

  /**
   * Return a bacteriophage controller to the pool. Retires (resets state and
   * parks at y=-10000) and re-parents to the scene if the death anim detached it.
   *
   * @param ctrl - Controller to release.
   */
  releasePhage(ctrl: BacteriophageController): void {
    ctrl.retire()
    if (!ctrl.group.parent) this.scene.add(ctrl.group)
    this.phageFree.push(ctrl)
  }

  /**
   * Return a chimera walker controller to the pool.
   *
   * @param ctrl - Controller to release.
   */
  releaseChimera(ctrl: ChimeraWalkerController): void {
    ctrl.retire()
    if (!ctrl.group.parent) this.scene.add(ctrl.group)
    this.chimeraFree.push(ctrl)
  }

  /**
   * Return a spire controller to the pool.
   *
   * @param ctrl - Controller to release.
   */
  releaseSpire(ctrl: SpireController): void {
    ctrl.retire()
    if (!ctrl.group.parent) this.scene.add(ctrl.group)
    this.spireFree.push(ctrl)
  }

  /**
   * Stage every pooled controller (free or live) in front of the given camera
   * with frustum culling disabled so a one-shot prewarm render builds their
   * per-instance VAOs. Each controller owns its own `MutableTubeGeometry`,
   * so the VAO build is per-controller and cannot be amortized by warming a
   * single archetype instance.
   *
   * Caller must invoke {@link unstageFromPrewarm} after rendering.
   *
   * @param camera - Camera the prewarm render uses.
   */
  stageForPrewarm(camera: THREE.Camera): void {
    if (this.allControllers.length === 0) return
    const cameraPosition = new THREE.Vector3()
    const cameraDirection = new THREE.Vector3()
    camera.getWorldPosition(cameraPosition)
    camera.getWorldDirection(cameraDirection)

    const baseAnchor = cameraPosition
      .clone()
      .addScaledVector(cameraDirection, PREWARM_CAMERA_FORWARD_DISTANCE)

    this.prewarmRestoreEntries.length = 0
    this.prewarmFrustumCullState.length = 0

    const total = this.allControllers.length
    for (let i = 0; i < total; i++) {
      const ctrl = this.allControllers[i]!
      const xOff = (i - (total - 1) / 2) * PREWARM_CONTROLLER_SPACING
      this.prewarmRestoreEntries.push({
        ctrl,
        position: ctrl.group.position.clone(),
      })
      ctrl.group.position.set(baseAnchor.x + xOff, baseAnchor.y, baseAnchor.z)
      // Swap the hit-flash material onto the head/eye/membrane meshes for the
      // prewarm draw. The flash swap on first kill otherwise pays a per-(geo,
      // flashMat) VAO build inside the despawn anim — the lag the user sees
      // the first time each enemy type dies.
      ctrl.prewarmFlash()
      ctrl.group.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (!mesh.isMesh) return
        this.prewarmFrustumCullState.push({ obj, frustumCulled: obj.frustumCulled })
        obj.frustumCulled = false
      })
    }
  }

  /** Restore pooled controllers to their parked positions after prewarm. */
  unstageFromPrewarm(): void {
    for (const entry of this.prewarmRestoreEntries) {
      entry.ctrl.group.position.copy(entry.position)
      entry.ctrl.endPrewarmFlash()
    }
    this.prewarmRestoreEntries.length = 0
    for (const entry of this.prewarmFrustumCullState) {
      entry.obj.frustumCulled = entry.frustumCulled
    }
    this.prewarmFrustumCullState.length = 0
  }

  /**
   * Tear down every controller — drops them from the scene and disposes their
   * GPU resources. Idempotent.
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const ctrl of this.allControllers) {
      ctrl.group.removeFromParent()
      ctrl.dispose()
    }
    this.allControllers.length = 0
    this.phageFree.length = 0
    this.chimeraFree.length = 0
    this.spireFree.length = 0
  }
}

/** Build a minimal stub Enemy used to satisfy controller constructors. */
function makeStubEnemy(): Enemy {
  return new Enemy({ maxHp: POOL_STUB_ENEMY_HP, hitRadius: POOL_STUB_ENEMY_HIT_RADIUS })
}
