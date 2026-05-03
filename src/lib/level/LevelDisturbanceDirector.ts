/**
 * Scene-facing adapter for hidden level disturbance responses.
 *
 * Converts pure disturbance response events into deterministic ambient
 * bacteriophage enemies without coupling the hidden model to Three.js.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-level-disturbance-system-design.md
 */
import * as THREE from 'three'
import type { Enemy } from '@/lib/fps/enemy'
import { EnemyDirector, type EnemyHandle } from '@/lib/fps/enemyDirector'
import type { ProjectileSystem } from '@/lib/fps/projectileSystem'
import {
  createLevelDisturbanceState,
  recordLevelDisturbance,
  resetLevelDisturbance,
  tickLevelDisturbance,
  type LevelDisturbanceEvent,
  type LevelDisturbanceState,
} from '@/lib/level/levelDisturbance'
import type { Heightmap } from '@/lib/terrain/heightmap'
import { BacteriophageController, PHAGE_HIT_CENTER_Y } from '@/three/BacteriophageController'

/** Maximum live hidden-system ambient enemies allowed at once. */
const MAX_LIVE_AMBIENT_ENEMIES = 5
/** Minimum radial spawn distance from the EVA player, in world units. */
const SPAWN_DISTANCE_MIN = 55
/** Maximum radial spawn distance from the EVA player, in world units. */
const SPAWN_DISTANCE_MAX = 95
/** Number of deterministic positions tried before giving up on one spawn. */
const SPAWN_POSITION_ATTEMPTS = 12
/** Minimum XZ clearance from the lander before a disturbance enemy may spawn. */
const LANDER_CLEARANCE_XZ = 32
/** Floating-point tolerance for spawn distance comparisons. */
const SPAWN_DISTANCE_EPSILON = 1e-6
/** Full revolution in radians for radial spawn rolls. */
const FULL_TURN_RADIANS = Math.PI * 2
/** Mulberry32 state increment. */
const MULBERRY_INCREMENT = 0x6d2b79f5
/** First Mulberry32 mix shift. */
const MULBERRY_SHIFT_A = 15
/** Second Mulberry32 mix shift. */
const MULBERRY_SHIFT_B = 7
/** Final Mulberry32 mix shift. */
const MULBERRY_SHIFT_C = 14
/** First Mulberry32 odd multiplier mask. */
const MULBERRY_MASK_A = 1
/** Second Mulberry32 odd multiplier mask. */
const MULBERRY_MASK_B = 61
/** Unsigned 32-bit divisor used to convert PRNG output to `[0, 1)`. */
const UINT32_FLOAT_DIVISOR = 4294967296

/**
 * Dependencies required by the runtime disturbance director.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-level-disturbance-system-design.md
 */
export interface LevelDisturbanceDirectorDeps {
  /**
   * Three.js scene that receives bacteriophage controller groups.
   *
   * Example: `sceneManager.scene` for the active level scene.
   */
  scene: THREE.Scene
  /**
   * Terrain height sampler used to place enemies on the asteroid surface.
   *
   * Values are sampled through `heightAt(x, z)` in world units.
   */
  heightmap: Heightmap
  /**
   * Projectile registry used so player bolts can collide with ambient enemies.
   *
   * Example: the shared surface EVA `ProjectileSystem`.
   */
  projectileSystem: ProjectileSystem
  /**
   * Mission difficulty in `[1, 10]`; invalid values are clamped by the pure model.
   *
   * Example: `10` produces the fastest hidden disturbance escalation.
   */
  missionDifficulty: number
  /**
   * Deterministic PRNG seed used for ambient spawn positions.
   *
   * Finite integer-like values such as `4813` reproduce the same spawn sequence.
   */
  seed: number
}

/**
 * Per-frame context needed by the disturbance director.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-level-disturbance-system-design.md
 */
export interface LevelDisturbanceFrameContext {
  /**
   * Whether the player is currently in surface EVA.
   *
   * Use `true` only when ambient enemies should chase and contact-damage the player.
   */
  evaActive: boolean
  /**
   * Current EVA player position, or `null` when the player is not spawned.
   *
   * Example: the FPS controller group position while walking on the surface.
   */
  playerPosition: THREE.Vector3 | null
  /**
   * Current lander position, or `null` if no lander clearance zone is available.
   *
   * Disturbance spawns reject positions within `32` XZ units of this point.
   */
  landerPosition: THREE.Vector3 | null
}

/**
 * Runtime adapter that turns hidden disturbance events into ambient viroids.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-level-disturbance-system-design.md
 */
export class LevelDisturbanceDirector {
  private readonly scene: THREE.Scene
  private readonly heightmap: Heightmap
  private readonly projectileSystem: ProjectileSystem
  private readonly enemyDirector = new EnemyDirector()
  private readonly controllers = new Map<number, BacteriophageController>()
  private readonly state: LevelDisturbanceState
  private rngState: number

  /**
   * Damage callback mirroring existing level combat routing.
   *
   * `source` is `'contact'` for disturbance viroid touch damage.
   */
  onDamagePlayer:
    | ((
        damage: number,
        sourceX: number,
        sourceZ: number,
        source?: 'projectile' | 'contact' | 'hazard',
      ) => void)
    | null = null

  /**
   * Alert callback for hidden-system response text.
   *
   * Example alert: `VIROID SIGNAL CLOSING`.
   */
  onAlert: ((alert: string) => void) | null = null

  /**
   * Create a runtime disturbance director.
   *
   * @param deps - Scene, gameplay, and deterministic tuning dependencies.
   */
  constructor(deps: LevelDisturbanceDirectorDeps) {
    this.scene = deps.scene
    this.heightmap = deps.heightmap
    this.projectileSystem = deps.projectileSystem
    this.state = createLevelDisturbanceState({ missionDifficulty: deps.missionDifficulty })
    this.rngState = deps.seed >>> 0

    this.enemyDirector.onContactDamage = (handle, damage) => {
      this.onDamagePlayer?.(damage, handle.enemy.position.x, handle.enemy.position.z, 'contact')
    }
  }

  /**
   * Record one hidden disturbance action.
   *
   * @param event - Pure disturbance event such as `movement`, `jump`, or `explosion`.
   */
  record(event: LevelDisturbanceEvent): void {
    recordLevelDisturbance(this.state, event)
  }

  /**
   * Reset the hidden escalation cycle after lander liftoff.
   */
  resetForLiftoff(): void {
    resetLevelDisturbance(this.state)
    this.clearAmbientEnemies()
  }

  /**
   * Flash the visual controller for an owned enemy when a projectile hits it.
   *
   * @param enemy - Enemy entity reported by the projectile system.
   */
  notifyEnemyHit(enemy: Enemy): void {
    for (const ctrl of this.controllers.values()) {
      if (ctrl.enemy !== enemy) continue

      ctrl.flash()
      break
    }
  }

  /**
   * Advance hidden responses, ambient enemy AI, and visual controllers.
   *
   * @param dt - Delta time in seconds.
   * @param ctx - Current surface EVA context.
   */
  tick(dt: number, ctx: LevelDisturbanceFrameContext): void {
    const player = ctx.evaActive ? ctx.playerPosition : null

    if (player) {
      const responseEvents = tickLevelDisturbance(this.state, dt)

      for (const event of responseEvents) {
        this.onAlert?.(event.alert)
        this.spawnAmbientEnemies(event.enemyCount, player, ctx.landerPosition)
      }

      this.enemyDirector.setPlayerPosition(player.x, player.y, player.z)
      this.enemyDirector.tick(dt)
    }

    this.syncVisualControllers(dt)
  }

  /**
   * Remove all owned controllers and unregister all owned enemies.
   */
  dispose(): void {
    this.clearAmbientEnemies()
  }

  /**
   * Spawn up to the requested count while respecting the live ambient cap.
   *
   * @param requestedCount - Number of bacteriophages requested by the pure response model.
   * @param playerPosition - Radial spawn center around the EVA player.
   * @param landerPosition - Optional lander clearance center.
   */
  private spawnAmbientEnemies(
    requestedCount: number,
    playerPosition: THREE.Vector3,
    landerPosition: THREE.Vector3 | null,
  ): void {
    const availableSlots = Math.max(0, MAX_LIVE_AMBIENT_ENEMIES - this.countLiveEnemies())
    const spawnCount = Math.min(requestedCount, availableSlots)

    for (let i = 0; i < spawnCount; i++) {
      const position = this.findSpawnPosition(playerPosition, landerPosition)
      if (!position) continue

      const groundY = this.heightmap.heightAt(position.x, position.z)
      const handle = this.enemyDirector.spawn('bacteriophage', position.x, groundY, position.z)
      this.projectileSystem.addEnemy(handle.enemy)

      const ctrl = new BacteriophageController(handle.enemy)
      ctrl.group.position.set(position.x, groundY, position.z)
      this.scene.add(ctrl.group)
      this.controllers.set(handle.id, ctrl)
    }
  }

  /**
   * Pick a deterministic radial spawn position that is clear of the lander.
   *
   * @param playerPosition - Center point for the radial spawn roll.
   * @param landerPosition - Optional XZ clearance point to avoid.
   * @returns Spawn position with XZ filled, or `null` when all attempts violate lander clearance.
   */
  private findSpawnPosition(
    playerPosition: THREE.Vector3,
    landerPosition: THREE.Vector3 | null,
  ): THREE.Vector3 | null {
    for (let attempt = 0; attempt < SPAWN_POSITION_ATTEMPTS; attempt++) {
      const angle = this.rng() * FULL_TURN_RADIANS
      const distance = SPAWN_DISTANCE_MIN + this.rng() * (SPAWN_DISTANCE_MAX - SPAWN_DISTANCE_MIN)
      const position = new THREE.Vector3(
        playerPosition.x + Math.cos(angle) * distance,
        0,
        playerPosition.z + Math.sin(angle) * distance,
      )

      if (!this.isTooCloseToLander(position, landerPosition)) return position
    }

    return null
  }

  /**
   * Test whether a candidate spawn violates the lander safety radius.
   *
   * @param position - Candidate spawn point whose XZ components are tested.
   * @param landerPosition - Optional lander center to avoid.
   * @returns True when the position is within lander clearance.
   */
  private isTooCloseToLander(
    position: THREE.Vector3,
    landerPosition: THREE.Vector3 | null,
  ): boolean {
    if (!landerPosition) return false

    const dx = position.x - landerPosition.x
    const dz = position.z - landerPosition.z
    const clearance = LANDER_CLEARANCE_XZ + SPAWN_DISTANCE_EPSILON
    return dx * dx + dz * dz < clearance * clearance
  }

  /**
   * Mirror enemy director state into bacteriophage controllers and clean up deaths.
   *
   * @param dt - Delta time in seconds.
   */
  private syncVisualControllers(dt: number): void {
    for (const handle of this.enemyDirector.enemies.slice()) {
      const ctrl = this.controllers.get(handle.id)
      if (!ctrl) continue

      if (ctrl.deathComplete) {
        this.removeController(handle, ctrl)
        continue
      }

      if (handle.enemy.alive) {
        ctrl.isMoving = handle.lastOutput.isMoving
        ctrl.isAgitated = handle.lastOutput.isAgitated
        ctrl.group.position.x = handle.enemy.position.x
        ctrl.group.position.z = handle.enemy.position.z

        const groundY = this.heightmap.heightAt(handle.enemy.position.x, handle.enemy.position.z)
        ctrl.group.position.y = groundY
        handle.enemy.position.y = groundY + PHAGE_HIT_CENTER_Y
      }

      ctrl.tick(dt)
    }
  }

  /**
   * Remove one completed controller and its projectile/director registrations.
   *
   * @param handle - Enemy handle owned by this director.
   * @param ctrl - Visual controller owned by this director.
   */
  private removeController(handle: EnemyHandle, ctrl: BacteriophageController): void {
    ctrl.group.removeFromParent()
    ctrl.dispose()
    this.projectileSystem.removeEnemy(handle.enemy)
    this.enemyDirector.despawn(handle)
    this.controllers.delete(handle.id)
  }

  /**
   * Remove every ambient enemy owned by this director.
   */
  private clearAmbientEnemies(): void {
    for (const handle of this.enemyDirector.enemies) {
      this.projectileSystem.removeEnemy(handle.enemy)
    }

    for (const ctrl of this.controllers.values()) {
      ctrl.group.removeFromParent()
      ctrl.dispose()
    }

    this.controllers.clear()
    this.enemyDirector.despawnAll()
  }

  /**
   * Count live enemies still owned by this director.
   *
   * @returns Live enemy count in `[0, MAX_LIVE_AMBIENT_ENEMIES]`.
   */
  private countLiveEnemies(): number {
    let count = 0
    for (const handle of this.enemyDirector.enemies) {
      if (handle.enemy.alive) count++
    }
    return count
  }

  /**
   * Deterministic Mulberry32 PRNG.
   *
   * @returns Next floating-point value in `[0, 1)`.
   */
  private rng(): number {
    let state = (this.rngState += MULBERRY_INCREMENT)
    state = Math.imul(state ^ (state >>> MULBERRY_SHIFT_A), state | MULBERRY_MASK_A)
    state ^= state + Math.imul(state ^ (state >>> MULBERRY_SHIFT_B), state | MULBERRY_MASK_B)
    return ((state ^ (state >>> MULBERRY_SHIFT_C)) >>> 0) / UINT32_FLOAT_DIVISOR
  }
}
