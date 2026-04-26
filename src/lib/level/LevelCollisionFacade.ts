/**
 * Runtime collision bookkeeping for the asteroid level scene.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
import { CollisionWorld, type Vec3Like, type WorldCollider } from '@/lib/physics/worldCollision'
import type { Heightmap } from '@/lib/terrain/heightmap'

/**
 * Input for computing a safe EVA spawn above the lander.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export interface LevelEvaSpawnOptions {
  /** Simple X fallback used when no collision world exists yet. */
  fallbackOffsetX: number
  /** Vertical clearance applied above the higher of lander Y and ground Y. */
  topYOffset: number
}

/**
 * Owns the level scene's `CollisionWorld` plus static/dynamic collider cleanup.
 *
 * This facade intentionally stops at runtime registration/query policy. It does
 * not own gameplay decisions like adrift detection or movement controllers.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export class LevelCollisionFacade {
  private world: CollisionWorld | null = null
  private readonly staticColliderCleanup: Array<() => void> = []
  private readonly objectiveColliderCleanup: Array<() => void> = []
  private readonly surfaceRockColliderCleanup = new Map<number, () => void>()

  /**
   * Create/reset the collision world for a freshly baked asteroid heightmap.
   *
   * @param heightmap - Heightmap backing level support queries.
   * @returns The active collision world instance for downstream controller wiring.
   */
  initialize(heightmap: Heightmap): CollisionWorld {
    this.dispose()
    this.world = new CollisionWorld(heightmap)
    return this.world
  }

  /**
   * Read the active collision world.
   *
   * @returns The current world or null before initialize.
   */
  getWorld(): CollisionWorld | null {
    return this.world
  }

  /**
   * Replace the current static collider set.
   *
   * @param colliders - Static level colliders such as the lander and shuttle.
   */
  registerStaticColliders(colliders: readonly WorldCollider[]): void {
    if (!this.world) return
    this.clearStaticColliders()
    for (const collider of colliders) {
      this.staticColliderCleanup.push(this.world.addCollider(collider))
    }
  }

  /** Remove all registered static colliders. */
  clearStaticColliders(): void {
    while (this.staticColliderCleanup.length > 0) {
      this.staticColliderCleanup.pop()?.()
    }
  }

  /**
   * Replace the current objective prop collider set.
   *
   * @param colliders - Static objective props such as survey terminals.
   */
  registerObjectiveColliders(colliders: readonly WorldCollider[]): void {
    if (!this.world) return
    this.clearObjectiveColliders()
    for (const collider of colliders) {
      this.objectiveColliderCleanup.push(this.world.addCollider(collider))
    }
  }

  /** Remove all registered objective prop colliders. */
  clearObjectiveColliders(): void {
    while (this.objectiveColliderCleanup.length > 0) {
      this.objectiveColliderCleanup.pop()?.()
    }
  }

  /**
   * Register a rock collider keyed by its spawn index.
   *
   * Re-registering the same index first clears the old collider so mined rocks
   * can safely rebuild without leaking stale blockers.
   *
   * @param spawnIndex - Rock spawn index from `SurfaceRockController`.
   * @param collider - Analytic collider to register.
   */
  registerSurfaceRockCollider(spawnIndex: number, collider: WorldCollider): void {
    if (!this.world) return
    this.removeSurfaceRockCollider(spawnIndex)
    this.surfaceRockColliderCleanup.set(spawnIndex, this.world.addCollider(collider))
  }

  /**
   * Remove a single surface-rock collider by spawn index.
   *
   * @param spawnIndex - Rock spawn index to remove.
   */
  removeSurfaceRockCollider(spawnIndex: number): void {
    const cleanup = this.surfaceRockColliderCleanup.get(spawnIndex)
    if (!cleanup) return
    cleanup()
    this.surfaceRockColliderCleanup.delete(spawnIndex)
  }

  /** Remove every registered rock collider. */
  clearSurfaceRockColliders(): void {
    for (const cleanup of this.surfaceRockColliderCleanup.values()) cleanup()
    this.surfaceRockColliderCleanup.clear()
  }

  /**
   * Compute a safe EVA spawn above the lander using terrain support when
   * collision data exists, or a simple side-step fallback when it does not.
   *
   * @param landerPosition - Current world position of the lander.
   * @param options - Spawn offsets/clearance used by the level controller.
   * @returns Spawn position for the EVA player.
   */
  buildEvaSpawnPosition(landerPosition: Vec3Like, options: LevelEvaSpawnOptions): Vec3Like {
    if (!this.world) {
      return {
        x: landerPosition.x + options.fallbackOffsetX,
        y: landerPosition.y,
        z: landerPosition.z,
      }
    }

    const groundY = this.world.getGroundHeight(landerPosition.x, landerPosition.z)
    return {
      x: landerPosition.x,
      y: Math.max(groundY, landerPosition.y) + options.topYOffset,
      z: landerPosition.z,
    }
  }

  /** Tear down the world and every registered collider. */
  dispose(): void {
    this.clearStaticColliders()
    this.clearObjectiveColliders()
    this.clearSurfaceRockColliders()
    this.world = null
  }
}
