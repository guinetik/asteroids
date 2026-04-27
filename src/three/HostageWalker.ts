/**
 * Autonomous per-instance walker for rescued hostages.
 *
 * Created by {@link FpsHostageController.recruit} after the player presses E
 * on a kneeling hostage. Walks XZ toward a live target (the lander), follows
 * the heightmap, faces direction of travel, and fires `onBoarded` when within
 * {@link HOSTAGE_BOARD_RADIUS} of the target. Movement is gated on the
 * underlying {@link HostageModel} reporting state `'walking'` so the root
 * never slides laterally while the stand-up clip is playing.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-rescue-extraction-phase-design.md
 */
import * as THREE from 'three'
import type { Heightmap } from '@/lib/terrain/heightmap'
import type { Hostage } from '@/lib/fps/hostage'
import type { HostageModel } from './HostageModel'

/** Forward XZ speed during extraction walk (m/s). */
export const HOSTAGE_WALK_SPEED = 5.0

/** Distance from the lander at which a walker boards and despawns (m). */
export const HOSTAGE_BOARD_RADIUS = 6

/**
 * Per-instance walker. One per recruited hostage. Owned by
 * {@link FpsHostageController}; the controller calls {@link tick} each frame
 * and removes the walker when {@link finished} flips true.
 */
export class HostageWalker {
  /** True once the walker has fired its `onBoarded` callback and should be removed. */
  finished = false

  private readonly toTarget = new THREE.Vector3()

  /**
   * @param hostage        - Domain entity (used to identify the walker on board)
   * @param model          - Visual; queried for state and translated each tick
   * @param targetProvider - Live lander XZ; called every tick (snapshot at recruit time would freeze)
   * @param onBoarded      - Fired once when the walker hits {@link HOSTAGE_BOARD_RADIUS}
   */
  constructor(
    readonly hostage: Hostage,
    private readonly model: HostageModel,
    private readonly targetProvider: () => THREE.Vector3,
    private readonly onBoarded: (hostage: Hostage) => void,
  ) {}

  /**
   * Per-frame update.
   *
   * @param dt        - Delta time in seconds
   * @param heightmap - Terrain sampled for ground Y at the walker's XZ
   */
  tick(dt: number, heightmap: Heightmap): void {
    if (this.finished) return
    if (!this.hostage.alive) {
      // Hostage died mid-walk. Self-mark for removal without firing onBoarded;
      // the death path drives the lost toast independently.
      this.finished = true
      return
    }
    if (this.model.getState() !== 'walking') return

    const target = this.targetProvider()
    const group = this.model.group
    const dx = target.x - group.position.x
    const dz = target.z - group.position.z
    const distSq = dx * dx + dz * dz

    if (distSq <= HOSTAGE_BOARD_RADIUS * HOSTAGE_BOARD_RADIUS) {
      this.finished = true
      this.onBoarded(this.hostage)
      return
    }

    const dist = Math.sqrt(distSq)
    const step = Math.min(dist, HOSTAGE_WALK_SPEED * dt)
    this.toTarget.set(dx / dist, 0, dz / dist)
    group.position.x += this.toTarget.x * step
    group.position.z += this.toTarget.z * step
    group.position.y = heightmap.heightAt(group.position.x, group.position.z)
    group.rotation.y = Math.atan2(this.toTarget.x, this.toTarget.z)
  }
}
