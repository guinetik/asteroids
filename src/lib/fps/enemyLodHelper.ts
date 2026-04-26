import type { EnemyHandle } from '@/lib/fps/enemyDirector'
import type { BacteriophageController } from '@/three/BacteriophageController'
import type { ChimeraWalkerController } from '@/three/ChimeraWalkerController'
import type { SpireController } from '@/three/SpireController'

/**
 * Squared XZ distance beyond which an enemy is considered "too far" for
 * its limb-tube wiggle to be visible. The minigame VC uses this to set
 * `lodSkipGeometry = true` on Chimera/Phage controllers, killing the
 * `MutableTubeGeometry.update` calls (and the analytic-normal recompute)
 * for enemies the player can't see moving anyway.
 *
 * 36 world units keeps close threats animated while avoiding camera-turn
 * uploads for background rescue packs at the FPS player's typical FOV.
 * the player ends up close-zooming on distant enemies.
 */
export const ENEMY_LOD_GEOMETRY_DISTANCE = 36
export const ENEMY_LOD_GEOMETRY_DISTANCE_SQ =
  ENEMY_LOD_GEOMETRY_DISTANCE * ENEMY_LOD_GEOMETRY_DISTANCE

/**
 * Maximum number of enemies allowed to keep their interior point lights
 * enabled at once. Each enabled light bumps `NUM_POINT_LIGHTS` in the
 * material program defines (which is fine — we warm for max in v3) and,
 * more importantly, adds a per-fragment shading branch on every PBR
 * surface inside the light's distance.
 *
 * The N nearest enemies keep their lights; the rest are toggled off via
 * `setLightsEnabled(false)` so their `THREE.PointLight.visible = false`
 * skips them at render time entirely.
 */
export const ENEMY_MAX_LIVE_LIGHTS = 2

/**
 * Minimal duck-typed interface the LOD helper needs from any enemy
 * controller. Keeping it duck-typed avoids forcing a shared base class
 * on the three independent controllers.
 */
interface EnemyControllerLike {
  setLightsEnabled(enabled: boolean): void
  /** Optional — only Chimera/Phage have a geometry LOD flag; Spire ignores. */
  lodSkipGeometry?: boolean
}

/**
 * Pre-allocated entry used inside {@link EnemyLodApplier} to avoid GC
 * pressure on the per-frame distance pass.
 */
interface LodEntry {
  ctrl: EnemyControllerLike
  distSq: number
}

/**
 * Per-minigame helper that, every tick, walks all live enemy controllers,
 * sets `lodSkipGeometry` on Chimera/Phage based on player distance, and
 * caps the number of enabled enemy point lights to {@link ENEMY_MAX_LIVE_LIGHTS}
 * by keeping only the N closest.
 *
 * Owns a single scratch array that's reused across frames — no allocations
 * per call.
 *
 * Usage:
 *
 * ```ts
 * private readonly lodApplier = new EnemyLodApplier()
 *
 * // every tick, BEFORE controller.tick(dt) runs:
 * this.lodApplier.begin(playerX, playerZ)
 * for (const handle of this.enemyDirector.enemies) {
 *   this.lodApplier.consider(handle, this.groundControllers.get(handle.id))
 *   this.lodApplier.consider(handle, this.chimeraControllers.get(handle.id))
 *   this.lodApplier.consider(handle, this.spireControllers.get(handle.id))
 * }
 * this.lodApplier.commit()
 * ```
 *
 * @see docs/superpowers/specs/2026-04-18-fps-perf-fixes-design.md (v5)
 */
export class EnemyLodApplier {
  private readonly buffer: LodEntry[] = []
  private playerX = 0
  private playerZ = 0
  private size = 0

  /**
   * Reset the per-frame buffer and remember the player position used for
   * subsequent `consider` calls. Must be called before any `consider`s.
   *
   * @param playerX Player world X.
   * @param playerZ Player world Z.
   */
  begin(playerX: number, playerZ: number): void {
    this.playerX = playerX
    this.playerZ = playerZ
    this.size = 0
  }

  /**
   * Compute distance from the player to `handle`'s position, set
   * `lodSkipGeometry` on the controller (for the controllers that have
   * it), and queue the controller for the lights cap pass in `commit()`.
   *
   * Safe to call with `undefined` controller — silently ignored.
   *
   * @param handle Director handle providing the enemy world position.
   * @param ctrl Enemy controller (or undefined if not constructed yet).
   */
  consider(
    handle: EnemyHandle,
    ctrl: BacteriophageController | ChimeraWalkerController | SpireController | undefined,
  ): void {
    if (!ctrl) return
    const dx = handle.enemy.position.x - this.playerX
    const dz = handle.enemy.position.z - this.playerZ
    const distSq = dx * dx + dz * dz

    if ('lodSkipGeometry' in ctrl) {
      ;(ctrl as { lodSkipGeometry: boolean }).lodSkipGeometry =
        distSq > ENEMY_LOD_GEOMETRY_DISTANCE_SQ
    }

    let entry = this.buffer[this.size]
    if (!entry) {
      entry = { ctrl, distSq }
      this.buffer[this.size] = entry
    } else {
      entry.ctrl = ctrl
      entry.distSq = distSq
    }
    this.size++
  }

  /**
   * Sort the queued controllers by distance and toggle their lights so
   * only the closest {@link ENEMY_MAX_LIVE_LIGHTS} stay enabled.
   *
   * Idempotent — safe to call again with the same buffer; calling without
   * a prior `begin()` toggles all lights off (size = 0).
   */
  commit(): void {
    const buf = this.buffer
    const n = this.size
    if (n > 1) {
      buf.length = n
      buf.sort(EnemyLodApplier.compareByDistance)
    }
    for (let i = 0; i < n; i++) {
      buf[i]!.ctrl.setLightsEnabled(i < ENEMY_MAX_LIVE_LIGHTS)
    }
  }

  /** Stable distance comparator for `Array.prototype.sort`. */
  private static compareByDistance(a: LodEntry, b: LodEntry): number {
    return a.distSq - b.distSq
  }
}
