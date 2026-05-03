/**
 * Scene-facing adapter for hidden level disturbance responses.
 *
 * Converts pure disturbance response events into deterministic ambient viroids
 * (`bacteriophage`, `spire`, `chimera`) without coupling the hidden model to Three.js.
 * Mission difficulty selects both palette tiers and which archetypes may spawn.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-level-disturbance-system-design.md
 */
import * as THREE from 'three'
import { spawnChimeraProjectileBurst } from '@/lib/fps/chimeraProjectileBurst'
import type { Enemy } from '@/lib/fps/enemy'
import { EnemyDirector, type EnemyHandle } from '@/lib/fps/enemyDirector'
import { EnemyProjectileSystem } from '@/lib/fps/enemyProjectileSystem'
import type { ProjectileSystem } from '@/lib/fps/projectileSystem'
import {
  createLevelDisturbanceState,
  grantAmbientWaveClearReprieve,
  recordLevelDisturbance,
  relieveLevelDisturbanceForAmbientKill,
  resetLevelDisturbance,
  tickLevelDisturbance,
  type LevelDisturbanceEvent,
  type LevelDisturbanceState,
} from '@/lib/level/levelDisturbance'
import type { Heightmap } from '@/lib/terrain/heightmap'
import { BacteriophageController, PHAGE_HIT_CENTER_Y } from '@/three/BacteriophageController'
import { ChimeraWalkerController, CHIMERA_HIT_CENTER_Y } from '@/three/ChimeraWalkerController'
import { EnemyProjectileMeshPool } from '@/three/EnemyProjectileMeshPool'
import { SpireController, SPIRE_HIT_CENTER_Y } from '@/three/SpireController'
import {
  disturbanceAmbientViroidKindsForMissionDifficulty,
  clampMissionDifficultyForEnemyRules,
  enemyPlayerDamageMultiplierForVisualTier,
  enemyVisualTierForDifficulty,
  type DisturbanceAmbientViroidKind,
  type EnemyVisualTier,
} from '@/three/enemyVisualPalette'

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
 * World X/Z coordinate used while the EVA avatar is inactive so dormant enemies
 * do not collide with cockpit coordinates (mirrors rescue “far chase” sentinel).
 */
const IDLE_PLAYER_FOCUS_XZ = 99999
/** Prewarmed enemy projectile mesh instances for disturbance combat. */
const ENEMY_PROJECTILE_MESH_PREWARM = 24
/** Treat nearly-zero directional vectors from aim math as degenerate aim. */
const PROJECTILE_DIRECTION_EPSILON_SQ = 0.000_1

/**
 * Dependencies required by the runtime disturbance director.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-level-disturbance-system-design.md
 */
export interface LevelDisturbanceDirectorDeps {
  /**
   * Three.js scene that receives viroid controller groups.
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
   * Example: `10` produces the hardest palette plus access to Chimera arrivals.
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
  private readonly enemyProjectileSystem = new EnemyProjectileSystem()
  private readonly enemyProjectileMeshPool: EnemyProjectileMeshPool

  private readonly phageControllers = new Map<number, BacteriophageController>()
  private readonly spireControllers = new Map<number, SpireController>()
  private readonly chimeraControllers = new Map<number, ChimeraWalkerController>()
  private readonly chimeraLaserMuzzleScratch = new THREE.Vector3()
  /** Unsubscribe handles for ambient kill-relief observers (cleared with enemies). */
  private readonly ambientDeathUnsubs = new Map<number, () => void>()
  /** True once at least one ambient viroid actually attached this level run (spawn position hit). */
  private ambientWaveEverSpawnedSuccessfully = false
  /** Prior frame live ambient headcount — detects wipes that earn calm windows. */
  private previousAmbientLiveResponders = 0
  /**
   * When true we skip awarding calm timers (liftoff/programmatic teardown is not a player wipe).
   */
  private suppressAmbientWaveGrant = false

  private readonly state: LevelDisturbanceState
  private readonly enemyVisualTier: EnemyVisualTier
  private readonly ambientViroidKinds: readonly DisturbanceAmbientViroidKind[]
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

    const tierDifficulty = clampMissionDifficultyForEnemyRules(deps.missionDifficulty)
    this.enemyVisualTier = enemyVisualTierForDifficulty(tierDifficulty)
    this.ambientViroidKinds = disturbanceAmbientViroidKindsForMissionDifficulty(
      deps.missionDifficulty,
    )

    const playerDamageMultiplier = enemyPlayerDamageMultiplierForVisualTier(this.enemyVisualTier)
    this.enemyDirector.setPlayerDamageMultiplier(playerDamageMultiplier)
    this.enemyProjectileSystem.setPlayerDamageMultiplier(playerDamageMultiplier)
    this.enemyProjectileSystem.onPlayerHit = (damage, sourceX, sourceZ) => {
      this.onDamagePlayer?.(damage, sourceX, sourceZ, 'projectile')
    }

    this.enemyProjectileMeshPool = new EnemyProjectileMeshPool(deps.scene)
    this.enemyProjectileMeshPool.prewarm(ENEMY_PROJECTILE_MESH_PREWARM)
    this.enemyProjectileSystem.onProjectileMove = this.enemyProjectileMeshPool.acquire.bind(
      this.enemyProjectileMeshPool,
    )
    this.enemyProjectileSystem.onProjectileRemoved = this.enemyProjectileMeshPool.release.bind(
      this.enemyProjectileMeshPool,
    )

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
    this.ambientWaveEverSpawnedSuccessfully = false
    this.clearAmbientEnemies()
  }

  /**
   * Flash the visual controller for an owned enemy when a projectile hits it.
   *
   * @param enemy - Enemy entity reported by the projectile system.
   */
  notifyEnemyHit(enemy: Enemy): void {
    for (const ctrl of this.phageControllers.values()) {
      if (ctrl.enemy !== enemy) continue
      ctrl.flash()
      return
    }

    for (const ctrl of this.spireControllers.values()) {
      if (ctrl.enemy !== enemy) continue
      ctrl.flash()
      return
    }

    for (const ctrl of this.chimeraControllers.values()) {
      if (ctrl.enemy !== enemy) continue
      ctrl.flash()
      break
    }
  }

  /**
   * Advance hidden responses, ambient enemy AI, combat projectiles, and visuals.
   *
   * @param dt - Delta time in seconds.
   * @param ctx - Current surface EVA context.
   */
  tick(dt: number, ctx: LevelDisturbanceFrameContext): void {
    const activePlayer = ctx.evaActive && ctx.playerPosition

    if (activePlayer) {
      const playerPosition = ctx.playerPosition!
      const responseEvents = tickLevelDisturbance(this.state, dt)

      for (const event of responseEvents) {
        this.onAlert?.(event.alert)
        this.spawnAmbientEnemies(event.enemyCount, playerPosition, ctx.landerPosition)
      }

      this.enemyDirector.setPlayerPosition(playerPosition.x, playerPosition.y, playerPosition.z)
      this.enemyProjectileSystem.setPlayerPosition(
        playerPosition.x,
        playerPosition.y,
        playerPosition.z,
      )
      this.enemyDirector.tick(dt)
    } else {
      this.enemyDirector.setPlayerPosition(IDLE_PLAYER_FOCUS_XZ, 0, IDLE_PLAYER_FOCUS_XZ)
      this.enemyProjectileSystem.setPlayerPosition(IDLE_PLAYER_FOCUS_XZ, 0, IDLE_PLAYER_FOCUS_XZ)
    }

    this.syncVisualControllers(dt)

    const aliveRespondersNow = this.countLiveEnemies()
    const shouldAwardCalmGrant =
      !this.suppressAmbientWaveGrant &&
      this.ambientWaveEverSpawnedSuccessfully &&
      this.previousAmbientLiveResponders > 0 &&
      aliveRespondersNow === 0

    if (shouldAwardCalmGrant) {
      grantAmbientWaveClearReprieve(this.state)
    }

    if (!this.suppressAmbientWaveGrant) {
      this.previousAmbientLiveResponders = aliveRespondersNow
    } else {
      this.previousAmbientLiveResponders = 0
    }

    this.suppressAmbientWaveGrant = false

    this.enemyProjectileSystem.tick(dt)
  }

  /**
   * Remove all owned controllers, pools, projectile registrations, and meshes.
   */
  dispose(): void {
    this.clearAmbientEnemies()
    this.enemyProjectileMeshPool.disposeAll()
  }

  /**
   * Spawn up to the requested count while respecting the live ambient cap.
   *
   * @param requestedCount - Number of viroids requested by the pure response model.
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

    const visualTierArg = this.enemyVisualTier

    let placedAnyRespondersThisRequest = false

    for (let i = 0; i < spawnCount; i++) {
      const position = this.findSpawnPosition(playerPosition, landerPosition)
      if (!position) continue

      placedAnyRespondersThisRequest = true
      const groundY = this.heightmap.heightAt(position.x, position.z)
      const kinds = this.ambientViroidKinds
      const kind = kinds[Math.floor(this.rng() * kinds.length)] ?? 'bacteriophage'
      const handle = this.enemyDirector.spawn(kind, position.x, groundY, position.z)

      this.projectileSystem.addEnemy(handle.enemy)
      this.attachAmbientKillRelief(handle, kind)

      if (kind === 'bacteriophage') {
        const ctrl = new BacteriophageController(handle.enemy, { visualTier: visualTierArg })
        ctrl.group.position.set(position.x, groundY, position.z)
        this.scene.add(ctrl.group)
        this.phageControllers.set(handle.id, ctrl)
      } else if (kind === 'chimera') {
        const ctrl = new ChimeraWalkerController(handle.enemy, { visualTier: visualTierArg })
        ctrl.group.position.set(position.x, groundY, position.z)
        this.scene.add(ctrl.group)
        this.chimeraControllers.set(handle.id, ctrl)
      } else {
        const ctrl = new SpireController(handle.enemy, { visualTier: visualTierArg })
        ctrl.group.position.set(position.x, groundY + handle.config.floatHeight, position.z)
        ctrl.targetPosition.set(position.x, groundY + handle.config.floatHeight, position.z)
        this.scene.add(ctrl.group)
        this.spireControllers.set(handle.id, ctrl)
      }
    }

    if (placedAnyRespondersThisRequest) {
      this.ambientWaveEverSpawnedSuccessfully = true
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
   * Mirror enemy director state into viroid controllers and clean up deaths.
   *
   * @param dt - Delta time in seconds.
   */
  private syncVisualControllers(dt: number): void {
    for (const handle of this.enemyDirector.enemies.slice()) {
      switch (handle.type) {
        case 'bacteriophage':
          this.syncPhageGroundController(handle, this.phageControllers.get(handle.id), dt)
          break
        case 'chimera':
          this.syncChimeraGroundController(handle, this.chimeraControllers.get(handle.id), dt)
          break
        case 'spire':
          this.syncSpireController(handle, this.spireControllers.get(handle.id), dt)
          break
        default:
          break
      }
    }
  }

  /**
   * Sync walker mesh while alive; remove registrations when death playback ends.
   */
  private syncPhageGroundController(
    handle: EnemyHandle,
    ctrl: BacteriophageController | undefined,
    dt: number,
  ): void {
    if (!ctrl) return

    if (ctrl.deathComplete) {
      this.removeDeadEnemy(handle, ctrl.group, () => ctrl.dispose())
      this.phageControllers.delete(handle.id)
      return
    }

    if (handle.enemy.alive) {
      ctrl.isMoving = handle.lastOutput.isMoving
      ctrl.isAgitated = handle.lastOutput.isAgitated
      ctrl.group.position.x = handle.enemy.position.x
      ctrl.group.position.z = handle.enemy.position.z

      const groundY = this.heightmap.heightAt(handle.enemy.position.x, handle.enemy.position.z)
      ctrl.group.position.y = groundY
      handle.enemy.position.y = groundY + PHAGE_HIT_CENTER_Y

      if (handle.lastOutput.isMoving) {
        const dir = handle.lastOutput.moveDir
        ctrl.group.rotation.y = Math.atan2(dir.x, dir.z)
      }
    }

    ctrl.tick(dt)
  }

  /**
   * Sync chimera torso height, melee aim, burst eye lasers toward the pursuit target.
   */
  private syncChimeraGroundController(
    handle: EnemyHandle,
    ctrl: ChimeraWalkerController | undefined,
    dt: number,
  ): void {
    if (!ctrl) return

    if (ctrl.deathComplete) {
      this.removeDeadEnemy(handle, ctrl.group, () => ctrl.dispose())
      this.chimeraControllers.delete(handle.id)
      return
    }

    if (handle.enemy.alive) {
      ctrl.isMoving = handle.lastOutput.isMoving
      ctrl.isAgitated = handle.lastOutput.isAgitated
      ctrl.group.position.x = handle.enemy.position.x
      ctrl.group.position.z = handle.enemy.position.z

      const groundY = this.heightmap.heightAt(handle.enemy.position.x, handle.enemy.position.z)
      ctrl.group.position.y = groundY
      handle.enemy.position.y = groundY + CHIMERA_HIT_CENTER_Y

      if (handle.lastOutput.isChasing) {
        const ax = handle.lastOutput.aimTargetX
        const az = handle.lastOutput.aimTargetZ
        const adx = ax - handle.enemy.position.x
        const adz = az - handle.enemy.position.z
        ctrl.group.rotation.y = Math.atan2(adx, adz)
      } else if (handle.lastOutput.isMoving) {
        const dir = handle.lastOutput.moveDir
        ctrl.group.rotation.y = Math.atan2(dir.x, dir.z)
      }
    }

    ctrl.tick(dt)

    if (handle.enemy.alive && handle.lastOutput.wantsToFire) {
      ctrl.group.updateMatrixWorld(true)
      const muzzle = this.chimeraLaserMuzzleScratch
      ctrl.getEyeLaserMuzzle(muzzle)
      const spawnedCount = spawnChimeraProjectileBurst({
        originX: muzzle.x,
        originY: muzzle.y,
        originZ: muzzle.z,
        targetX: handle.lastOutput.aimTargetX,
        targetY: handle.lastOutput.aimTargetY,
        targetZ: handle.lastOutput.aimTargetZ,
        projectileSpeed: handle.config.projectileSpeed,
        projectileDamage: handle.config.projectileDamage,
        spawnBurst: this.enemyProjectileSystem.spawnBurst.bind(this.enemyProjectileSystem),
      })
      if (spawnedCount > 0) {
        ctrl.pulseEyeLaser()
      }
    }
  }

  /**
   * Bob and fire Spire blobs along the ranger behavior output.
   */
  private syncSpireController(
    handle: EnemyHandle,
    ctrl: SpireController | undefined,
    dt: number,
  ): void {
    if (!ctrl) return

    if (ctrl.deathComplete) {
      this.removeDeadEnemy(handle, ctrl.group, () => ctrl.dispose())
      this.spireControllers.delete(handle.id)
      return
    }

    if (handle.enemy.alive) {
      ctrl.isMoving = handle.lastOutput.isMoving
      ctrl.isAgitated = handle.lastOutput.isAgitated

      const groundY = this.heightmap.heightAt(handle.enemy.position.x, handle.enemy.position.z)
      ctrl.targetPosition.set(
        handle.enemy.position.x,
        groundY + handle.config.floatHeight,
        handle.enemy.position.z,
      )
      handle.enemy.position.y = ctrl.group.position.y + SPIRE_HIT_CENTER_Y

      const aimX = handle.lastOutput.aimTargetX
      const aimY = handle.lastOutput.aimTargetY
      const aimZ = handle.lastOutput.aimTargetZ

      if (handle.lastOutput.isChasing) {
        const dx = aimX - handle.enemy.position.x
        const dz = aimZ - handle.enemy.position.z
        ctrl.group.rotation.y = Math.atan2(dx, dz)
      }

      if (handle.lastOutput.wantsToFire) {
        const ep = handle.enemy.position
        const dx = aimX - ep.x
        const dy = aimY - ep.y
        const dz = aimZ - ep.z
        const distSq = dx * dx + dy * dy + dz * dz
        if (distSq > PROJECTILE_DIRECTION_EPSILON_SQ) {
          const dist = Math.sqrt(distSq)
          this.enemyProjectileSystem.spawn(
            ep.x,
            ep.y,
            ep.z,
            dx / dist,
            dy / dist,
            dz / dist,
            handle.config.projectileSpeed,
            handle.config.projectileDamage,
          )
          ctrl.fireFlash(aimX, aimZ)
        }
      }
    }

    ctrl.tick(dt)
  }

  private removeDeadEnemy(
    handle: EnemyHandle,
    group: THREE.Object3D,
    disposeCtrl: () => void,
  ): void {
    this.detachAmbientKillRelief(handle.id)
    group.removeFromParent()
    disposeCtrl()
    this.projectileSystem.removeEnemy(handle.enemy)
    this.enemyDirector.despawn(handle)
  }

  /**
   * Subscribe once-per-life kill relief so defeating harder silhouettes trims more meter.
   *
   * @param handle - Enemy handle spawned for this disturbance responder.
   * @param archetype - Walker / Floater / Chimera variant used when computing relief wedges.
   */
  private attachAmbientKillRelief(
    handle: EnemyHandle,
    archetype: DisturbanceAmbientViroidKind,
  ): void {
    const stopListening = handle.enemy.addDeathListener(() => {
      relieveLevelDisturbanceForAmbientKill(this.state, archetype)
      stopListening()
      this.ambientDeathUnsubs.delete(handle.id)
    })

    this.ambientDeathUnsubs.set(handle.id, stopListening)
  }

  private detachAmbientKillRelief(id: number): void {
    const off = this.ambientDeathUnsubs.get(id)
    if (!off) return

    off()
    this.ambientDeathUnsubs.delete(id)
  }

  private clearAmbientDeathSubscriptions(): void {
    for (const off of this.ambientDeathUnsubs.values()) off()

    this.ambientDeathUnsubs.clear()
  }

  /**
   * Remove every ambient enemy owned by this director.
   */
  private clearAmbientEnemies(): void {
    this.suppressAmbientWaveGrant = true
    this.previousAmbientLiveResponders = 0
    this.clearAmbientDeathSubscriptions()

    for (const handle of this.enemyDirector.enemies) {
      this.projectileSystem.removeEnemy(handle.enemy)
    }

    for (const ctrl of this.phageControllers.values()) {
      ctrl.group.removeFromParent()
      ctrl.dispose()
    }
    this.phageControllers.clear()

    for (const ctrl of this.spireControllers.values()) {
      ctrl.group.removeFromParent()
      ctrl.dispose()
    }
    this.spireControllers.clear()

    for (const ctrl of this.chimeraControllers.values()) {
      ctrl.group.removeFromParent()
      ctrl.dispose()
    }
    this.chimeraControllers.clear()

    this.enemyDirector.despawnAll()

    this.enemyProjectileSystem.dispose()
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
