/**
 * Exterminate minigame — clear defenders, arm charges, destroy the nest.
 *
 * Spawns a nest prop and an enemy encounter at the objective site. Once all
 * defenders are dead, the nest becomes interactable in EVA. Arming charges
 * starts a short countdown, then the nest explodes and leaves a crater.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
import * as THREE from 'three'
import type { MiniGame, MiniGameContext, MiniGameEvents, MiniGameStatus, MiniGameStep } from './MiniGame'
import type { ConcreteObjective } from '@/lib/missions/types'
import type { Heightmap } from '@/lib/terrain/heightmap'
import { FLAT_ZONE_RADIUS } from '@/lib/terrain/terrainGenerator'
import type { ProjectileSystem } from '@/lib/fps/projectileSystem'
import { EnemyDirector, type EnemyHandle } from '@/lib/fps/enemyDirector'
import { EnemyProjectileSystem } from '@/lib/fps/enemyProjectileSystem'
import { EnemyTiltCache } from '@/lib/fps/enemyTiltCache'
import { EnemyLodApplier } from '@/lib/fps/enemyLodHelper'
import { NestModel } from '@/three/NestModel'
import { BacteriophageController, PHAGE_HIT_CENTER_Y } from '@/three/BacteriophageController'
import { SpireController, SPIRE_HIT_CENTER_Y } from '@/three/SpireController'
import { ChimeraWalkerController, CHIMERA_HIT_CENTER_Y } from '@/three/ChimeraWalkerController'
import { EnemyProjectileMeshPool } from '@/three/EnemyProjectileMeshPool'
import type { Enemy } from '@/lib/fps/enemy'

const NEST_SCALE = 5
const NEST_INTERACT_RANGE = 16
const SITE_RADIUS = FLAT_ZONE_RADIUS * 0.82
const INNER_SPAWN_CLEAR_RADIUS = 40
const COUNTDOWN_DURATION = 5
const BLAST_RADIUS = 22
const CRATER_RADIUS = 11
const CONTACT_KNOCKBACK = 10
const ENEMY_PLAYER_FAR_DISTANCE = 99999

/** Outer fireball flash — slower, bigger, longer-lived than the original. */
const EXPLOSION_FLASH_DURATION = 0.75
const EXPLOSION_FLASH_MAX_SCALE = 62
/** White-hot inner core — hits hard and decays first for a punchier flash. */
const EXPLOSION_CORE_DURATION = 0.22
const EXPLOSION_CORE_MAX_SCALE = 22
/** Ground shockwave ring — expands across {@link BLAST_RADIUS} as it fades. */
const SHOCKWAVE_DURATION = 0.6
const SHOCKWAVE_MAX_SCALE = BLAST_RADIUS * 1.6
const EXPLOSION_LIGHT_INTENSITY = 18
const EXPLOSION_LIGHT_DISTANCE = 180

/**
 * Deploy marker — radius of the pulsing ring on the ground at the nest after
 * defenders are cleared. Sits a hair outside {@link NEST_INTERACT_RANGE} so the
 * outer rim of the visual marker corresponds to "you are now in interact range".
 */
const DEPLOY_MARKER_RADIUS = NEST_INTERACT_RANGE + 0.5
/** Vertical light beam height for the deploy marker so it's visible at distance. */
const DEPLOY_MARKER_BEAM_HEIGHT = 80
/** Marker pulse frequency (Hz) — sine-modulates opacity so it reads as "active". */
const DEPLOY_MARKER_PULSE_HZ = 1.1

const craterMat = new THREE.MeshStandardMaterial({
  color: 0x120b08,
  roughness: 1,
  metalness: 0,
  transparent: true,
  opacity: 0.92,
  depthWrite: false,
})

const craterRingMat = new THREE.MeshStandardMaterial({
  color: 0x2a160c,
  roughness: 1,
  metalness: 0,
  transparent: true,
  opacity: 0.8,
  depthWrite: false,
})

const explosionFlashMat = new THREE.MeshBasicMaterial({
  color: 0xffaa55,
  transparent: true,
  opacity: 0.8,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})

/** White-hot inner core material — saturates the screen for the first frames. */
const explosionCoreMat = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 1,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})

/** Ground shockwave ring material — additive so it reads as a flash on terrain. */
const shockwaveMat = new THREE.MeshBasicMaterial({
  color: 0xffd28a,
  transparent: true,
  opacity: 0.85,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
})

/** Deploy marker ring material — yellow additive so it pops against the rust terrain. */
const deployRingMat = new THREE.MeshBasicMaterial({
  color: 0xffe066,
  transparent: true,
  opacity: 0.7,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
})

/** Deploy marker vertical beam material — same hue, lower opacity for soft column. */
const deployBeamMat = new THREE.MeshBasicMaterial({
  color: 0xffe066,
  transparent: true,
  opacity: 0.18,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
})

const craterGeo = new THREE.CircleGeometry(CRATER_RADIUS, 32)
const craterRingGeo = new THREE.RingGeometry(CRATER_RADIUS * 0.72, CRATER_RADIUS * 1.08, 32)
const explosionFlashGeo = new THREE.SphereGeometry(1, 16, 12)
const explosionCoreGeo = new THREE.SphereGeometry(1, 16, 12)
/** Thin ring centred on (0,0,0); expanded via mesh.scale during the explosion. */
const shockwaveGeo = new THREE.RingGeometry(0.92, 1, 64)
/** Marker outer ring (10–12% wider than {@link DEPLOY_MARKER_RADIUS} for a bezel). */
const deployRingGeo = new THREE.RingGeometry(
  DEPLOY_MARKER_RADIUS * 0.96,
  DEPLOY_MARKER_RADIUS * 1.04,
  64,
)
/** Marker vertical beam — narrow open cylinder, no caps, additive for a soft column. */
const deployBeamGeo = new THREE.CylinderGeometry(
  DEPLOY_MARKER_RADIUS * 0.05,
  DEPLOY_MARKER_RADIUS * 0.05,
  DEPLOY_MARKER_BEAM_HEIGHT,
  16,
  1,
  true,
)

/**
 * Exterminate minigame for a single nest site.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
export class ExterminateMinigame implements MiniGame, MiniGameEvents {
  readonly objectiveIndex: number

  private _status: MiniGameStatus = 'active'
  private _isPlayerNear = false

  private readonly _steps: MiniGameStep[] = [
    { label: 'Eliminate nest defenders', complete: false, active: true },
    { label: 'Deploy explosive charges', complete: false, active: false },
    { label: 'Evacuate blast radius', complete: false, active: false },
  ]

  private readonly objective: ConcreteObjective
  private readonly scene: THREE.Scene
  private readonly heightmap: Heightmap
  private readonly projectileSystem: ProjectileSystem
  private readonly missionDifficulty: number
  private readonly nest: NestModel
  private readonly nestPosition = new THREE.Vector3()
  private readonly enemyDirector = new EnemyDirector()
  private readonly enemyProjectileSystem = new EnemyProjectileSystem()
  private readonly groundControllers = new Map<number, BacteriophageController>()
  private readonly spireControllers = new Map<number, SpireController>()
  private readonly chimeraControllers = new Map<number, ChimeraWalkerController>()
  private readonly chimeraLaserOriginScratch = new THREE.Vector3()
  private readonly enemyProjectileMeshPool: EnemyProjectileMeshPool
  private readonly enemyTiltCache: EnemyTiltCache
  private readonly enemyLodApplier = new EnemyLodApplier()
  private readonly enemyByHandleId = new Map<number, Enemy>()
  private readonly encounterEnemies: Enemy[] = []
  private readonly craterGroup = new THREE.Group()
  private readonly explosionFlash = new THREE.Mesh(explosionFlashGeo, explosionFlashMat.clone())
  private readonly explosionCore = new THREE.Mesh(explosionCoreGeo, explosionCoreMat.clone())
  private readonly explosionLight = new THREE.PointLight(0xff8844, 0, EXPLOSION_LIGHT_DISTANCE)
  private readonly shockwave = new THREE.Mesh(shockwaveGeo, shockwaveMat.clone())
  /** Group containing the deploy marker (ring + beam). Visible when defenders dead, charges not yet armed. */
  private readonly deployMarker = new THREE.Group()
  private readonly deployMarkerRing = new THREE.Mesh(deployRingGeo, deployRingMat.clone())
  private readonly deployMarkerBeam = new THREE.Mesh(deployBeamGeo, deployBeamMat.clone())
  /** Time accumulator used to drive the deploy marker pulse (sine modulation). */
  private deployMarkerPhase = 0

  private armed = false
  private countdownRemaining = COUNTDOWN_DURATION
  private explosionFlashTimer = 0
  private explosionCoreTimer = 0
  private shockwaveTimer = 0
  /**
   * Called when the player should take direct damage.
   *
   * @param damage  - HP to deduct.
   * @param sourceX - World X of the damage source.
   * @param sourceZ - World Z of the damage source.
   * @param source  - What dealt the damage. `'projectile'` for ranged hits
   *                  fired by enemies, `'contact'` for melee/touch damage.
   *                  Lets the controller pick the right impact SFX.
   */
  onDamagePlayer:
    | ((
        damage: number,
        sourceX: number,
        sourceZ: number,
        source?: 'projectile' | 'contact',
      ) => void)
    | null = null
  /** Called when the player should be killed outright. */
  onKillPlayer: (() => void) | null = null
  /** Called when the lander is destroyed by the nest blast. */
  onDestroyLander: (() => void) | null = null
  /** Called when the nest explodes so the level can spawn VFX. */
  onExplosion: ((position: THREE.Vector3) => void) | null = null

  onPrompt: ((text: string | null) => void) | null = null
  onComplete: ((objectiveIndex: number) => void) | null = null
  onStepChange: ((objectiveIndex: number, steps: readonly MiniGameStep[]) => void) | null = null

  /** Current minigame status. */
  get status(): MiniGameStatus {
    return this._status
  }

  /** Whether the player is near the nest, or the countdown is active. */
  get isPlayerNearInteraction(): boolean {
    return this._isPlayerNear
  }

  /** No timer HUD for exterminate. */
  get timeRemaining(): number | null {
    return null
  }

  /** Number of defeated defenders. */
  get progressCurrent(): number | null {
    const total = this.encounterEnemies.length
    if (total === 0) return 0
    return total - this.liveEnemyCount()
  }

  /** Total defenders spawned at this site. */
  get progressTotal(): number | null {
    return this.encounterEnemies.length
  }

  /** Ordered steps for the mission tracker. */
  get steps(): readonly MiniGameStep[] {
    return this._steps
  }

  private constructor(
    objectiveIndex: number,
    objective: ConcreteObjective,
    scene: THREE.Scene,
    heightmap: Heightmap,
    projectileSystem: ProjectileSystem,
    missionDifficulty: number,
    nest: NestModel,
  ) {
    this.objectiveIndex = objectiveIndex
    this.objective = objective
    this.scene = scene
    this.heightmap = heightmap
    this.projectileSystem = projectileSystem
    this.missionDifficulty = missionDifficulty
    this.nest = nest
    this.enemyProjectileMeshPool = new EnemyProjectileMeshPool(scene)
    this.enemyProjectileMeshPool.prewarm()
    this.enemyTiltCache = new EnemyTiltCache(heightmap)

    const groundY = heightmap.heightAt(objective.x, objective.z)
    this.nestPosition.set(objective.x, groundY, objective.z)
    this.nest.placeAt(objective.x, groundY, objective.z)
    this.nest.setYaw(Math.random() * Math.PI * 2)
    this.scene.add(this.nest.group)

    this.buildCrater()
    this.buildExplosionFlash()
    this.buildDeployMarker()
    this.spawnEncounter()
    this.wireEnemyCallbacks()
  }

  /**
   * Create a new exterminate minigame instance.
   *
   * @param objectiveIndex - Objective index in the mission
   * @param objective - Concrete exterminate objective
   * @param scene - Scene to render into
   * @param heightmap - Terrain heightmap for placement
   * @param projectileSystem - Player projectile system for enemy collisions
   * @param missionDifficulty - Mission difficulty (1-10)
   * @returns Ready-to-run exterminate minigame
   */
  static async create(
    objectiveIndex: number,
    objective: ConcreteObjective,
    scene: THREE.Scene,
    heightmap: Heightmap,
    projectileSystem: ProjectileSystem,
    missionDifficulty: number,
  ): Promise<ExterminateMinigame> {
    const nest = await NestModel.create({ scale: NEST_SCALE })
    return new ExterminateMinigame(
      objectiveIndex,
      objective,
      scene,
      heightmap,
      projectileSystem,
      missionDifficulty,
      nest,
    )
  }

  /** @inheritdoc */
  tick(dt: number, ctx: MiniGameContext): void {
    this._isPlayerNear = this.armed

    this.syncEnemySimulation(dt, ctx)
    this.syncExplosionFlash(dt)

    if (this._status === 'completed' || this._status === 'failed') {
      return
    }

    const allDefendersDead = this.liveEnemyCount() === 0
    if (allDefendersDead) {
      this.advanceStep(0)
    }

    // Deploy marker visible only in the small window between "defenders dead"
    // and "charges armed". Once the countdown starts it's redundant with the
    // on-screen evacuate prompt, and after detonation the nest is gone.
    this.syncDeployMarker(dt, allDefendersDead && !this.armed)

    if (!allDefendersDead) {
      this.updatePromptWhileBlocked(ctx)
      return
    }

    if (!this.armed) {
      this.updateNestInteraction(ctx)
      return
    }

    this.countdownRemaining = Math.max(0, this.countdownRemaining - dt)
    const countdownText = Math.max(1, Math.ceil(this.countdownRemaining))
    this.onPrompt?.(`EVACUATE. DETONATION IN ${countdownText}`)

    if (this.countdownRemaining <= 0) {
      this.detonate(ctx)
    }
  }

  /**
   * Flash the visual controller for an enemy that just took a projectile hit.
   * Called by the level controller from `projectileSystem.onEnemyHit`. Silently
   * ignores enemies that don't belong to this minigame.
   *
   * @param enemy - Enemy domain instance that was hit by a player projectile.
   */
  notifyEnemyHit(enemy: Enemy): void {
    for (const [, ctrl] of this.groundControllers) {
      if (ctrl.enemy === enemy) {
        ctrl.flash()
        return
      }
    }
    for (const [, ctrl] of this.chimeraControllers) {
      if (ctrl.enemy === enemy) {
        ctrl.flash()
        return
      }
    }
    for (const [, ctrl] of this.spireControllers) {
      if (ctrl.enemy === enemy) {
        ctrl.flash()
        return
      }
    }
  }

  /** Clean up all resources owned by this minigame. */
  dispose(): void {
    this.clearEncounter()
    this.clearEnemyProjectiles()
    this.scene.remove(this.nest.group)
    this.nest.dispose()
    this.craterGroup.removeFromParent()
    this.explosionFlash.removeFromParent()
    this.explosionCore.removeFromParent()
    this.explosionLight.removeFromParent()
    this.shockwave.removeFromParent()
    this.deployMarker.removeFromParent()
    ;(this.explosionFlash.material as THREE.MeshBasicMaterial).dispose()
    ;(this.explosionCore.material as THREE.MeshBasicMaterial).dispose()
    ;(this.shockwave.material as THREE.MeshBasicMaterial).dispose()
    ;(this.deployMarkerRing.material as THREE.MeshBasicMaterial).dispose()
    ;(this.deployMarkerBeam.material as THREE.MeshBasicMaterial).dispose()
  }

  private buildCrater(): void {
    const crater = new THREE.Mesh(craterGeo, craterMat)
    crater.rotation.x = -Math.PI / 2
    crater.position.set(this.nestPosition.x, this.nestPosition.y + 0.08, this.nestPosition.z)
    this.craterGroup.add(crater)

    const rim = new THREE.Mesh(craterRingGeo, craterRingMat)
    rim.rotation.x = -Math.PI / 2
    rim.position.set(this.nestPosition.x, this.nestPosition.y + 0.1, this.nestPosition.z)
    this.craterGroup.add(rim)
    this.craterGroup.visible = false
    this.scene.add(this.craterGroup)
  }

  private buildExplosionFlash(): void {
    this.explosionFlash.visible = false
    this.explosionCore.visible = false
    this.explosionLight.visible = false
    this.shockwave.visible = false
    this.shockwave.rotation.x = -Math.PI / 2
    this.scene.add(this.explosionFlash)
    this.scene.add(this.explosionCore)
    this.scene.add(this.explosionLight)
    this.scene.add(this.shockwave)
  }

  /**
   * Build the deploy marker (ground ring + vertical beam), positioned at the
   * nest. Hidden until defenders are cleared so the marker appears as a
   * positive cue ("you're cleared, head here") rather than a permanent waypoint.
   */
  private buildDeployMarker(): void {
    this.deployMarkerRing.rotation.x = -Math.PI / 2
    this.deployMarkerRing.position.set(
      this.nestPosition.x,
      this.nestPosition.y + 0.12,
      this.nestPosition.z,
    )

    this.deployMarkerBeam.position.set(
      this.nestPosition.x,
      this.nestPosition.y + DEPLOY_MARKER_BEAM_HEIGHT * 0.5,
      this.nestPosition.z,
    )

    this.deployMarker.add(this.deployMarkerRing)
    this.deployMarker.add(this.deployMarkerBeam)
    this.deployMarker.visible = false
    this.scene.add(this.deployMarker)
  }

  private spawnEncounter(): void {
    const swarmSize = this.objective.swarmSize ?? 4
    const nestCount = this.objective.nestCount ?? 1
    const totalDefenders = Math.max(3, swarmSize + Math.max(0, nestCount - 1))
    const spireCount = this.objective.hasSpitters
      ? Math.min(2, Math.max(1, Math.floor((this.missionDifficulty + nestCount) / 5)))
      : 0
    const chimeraCount = Math.min(
      2,
      Math.max(0, Math.floor((this.missionDifficulty - 3) / 3) + (nestCount >= 3 ? 1 : 0)),
    )
    const phageCount = Math.max(1, totalDefenders - spireCount - chimeraCount)

    this.spawnEnemiesOfType('bacteriophage', phageCount, SITE_RADIUS * 0.75)
    this.spawnEnemiesOfType('chimera', chimeraCount, SITE_RADIUS)
    this.spawnEnemiesOfType('spire', spireCount, SITE_RADIUS * 0.85)
  }

  private spawnEnemiesOfType(type: 'bacteriophage' | 'chimera' | 'spire', count: number, radius: number): void {
    if (count <= 0) return
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.9
      const ringMin = Math.min(INNER_SPAWN_CLEAR_RADIUS, radius * 0.45)
      const ringSpan = Math.max(0.01, radius - ringMin)
      const r = ringMin + Math.sqrt(Math.random()) * ringSpan
      const x = this.objective.x + Math.cos(angle) * r
      const z = this.objective.z + Math.sin(angle) * r
      const groundY = this.heightmap.heightAt(x, z)
      const handle = this.enemyDirector.spawn(type, x, groundY, z)
      this.enemyByHandleId.set(handle.id, handle.enemy)
      this.encounterEnemies.push(handle.enemy)
      this.projectileSystem.addEnemy(handle.enemy)

      if (type === 'bacteriophage') {
        const ctrl = new BacteriophageController(handle.enemy)
        ctrl.group.position.set(x, groundY, z)
        this.scene.add(ctrl.group)
        this.groundControllers.set(handle.id, ctrl)
      } else if (type === 'chimera') {
        const ctrl = new ChimeraWalkerController(handle.enemy)
        ctrl.group.position.set(x, groundY, z)
        this.scene.add(ctrl.group)
        this.chimeraControllers.set(handle.id, ctrl)
      } else {
        const ctrl = new SpireController(handle.enemy)
        ctrl.group.position.set(x, groundY + handle.config.floatHeight, z)
        ctrl.targetPosition.set(x, groundY + handle.config.floatHeight, z)
        this.scene.add(ctrl.group)
        this.spireControllers.set(handle.id, ctrl)
      }
    }
  }

  private wireEnemyCallbacks(): void {
    this.enemyDirector.onContactDamage = (handle, damage) => {
      const enemy = this.enemyByHandleId.get(handle.id)
      if (!enemy || !enemy.alive) return
      this.onDamagePlayer?.(damage, enemy.position.x, enemy.position.z, 'contact')
    }

    this.enemyProjectileSystem.onPlayerHit = (damage, sourceX, sourceZ) => {
      this.onDamagePlayer?.(damage, sourceX, sourceZ, 'projectile')
    }

    this.enemyProjectileSystem.onProjectileMove = this.enemyProjectileMeshPool.acquire
    this.enemyProjectileSystem.onProjectileRemoved = this.enemyProjectileMeshPool.release
  }

  private syncEnemySimulation(dt: number, ctx: MiniGameContext): void {
    const player = ctx.playerPosition
    if (player) {
      this.enemyDirector.setPlayerPosition(player.x, player.y, player.z)
      this.enemyProjectileSystem.setPlayerPosition(player.x, player.y, player.z)
    } else {
      this.enemyDirector.setPlayerPosition(
        this.objective.x + ENEMY_PLAYER_FAR_DISTANCE,
        0,
        this.objective.z + ENEMY_PLAYER_FAR_DISTANCE,
      )
      this.enemyProjectileSystem.setPlayerPosition(
        this.objective.x + ENEMY_PLAYER_FAR_DISTANCE,
        0,
        this.objective.z + ENEMY_PLAYER_FAR_DISTANCE,
      )
    }

    this.enemyDirector.tick(dt)
    this.enemyProjectileSystem.tick(dt)

    // Compute distance-based geometry LOD + N-nearest light cap BEFORE
    // controller ticks run. Distance-LOD has to be set before tick() so
    // the controller's own tube-rebake branch can early-out; light caps
    // are render-time visibility flags, so timing doesn't matter for them
    // but we batch them in the same pass to avoid a second loop.
    // @see docs/superpowers/specs/2026-04-18-fps-perf-fixes-design.md (v5)
    const lodPlayerX = player?.x ?? this.objective.x + ENEMY_PLAYER_FAR_DISTANCE
    const lodPlayerZ = player?.z ?? this.objective.z + ENEMY_PLAYER_FAR_DISTANCE
    this.enemyLodApplier.begin(lodPlayerX, lodPlayerZ)
    for (const handle of this.enemyDirector.enemies) {
      this.enemyLodApplier.consider(handle, this.groundControllers.get(handle.id))
      this.enemyLodApplier.consider(handle, this.chimeraControllers.get(handle.id))
      this.enemyLodApplier.consider(handle, this.spireControllers.get(handle.id))
    }
    this.enemyLodApplier.commit()

    for (const handle of this.enemyDirector.enemies) {
      this.syncGroundController(this.groundControllers.get(handle.id), handle, dt, PHAGE_HIT_CENTER_Y)
      this.syncGroundController(this.chimeraControllers.get(handle.id), handle, dt, CHIMERA_HIT_CENTER_Y)
      this.syncSpireController(this.spireControllers.get(handle.id), handle, dt, player)
    }
  }

  private syncGroundController(
    ctrl: BacteriophageController | ChimeraWalkerController | undefined,
    handle: EnemyHandle,
    dt: number,
    hitCenterY: number,
  ): void {
    if (!ctrl) return

    if (ctrl.deathComplete) {
      ctrl.group.removeFromParent()
      ctrl.dispose()
      this.projectileSystem.removeEnemy(handle.enemy)
      this.enemyDirector.despawn(handle)
      this.groundControllers.delete(handle.id)
      this.chimeraControllers.delete(handle.id)
      this.enemyTiltCache.release(handle.id)
      return
    }

    if (handle.enemy.alive) {
      ctrl.isMoving = handle.lastOutput.isMoving
      ctrl.isAgitated = handle.lastOutput.isAgitated
      ctrl.group.position.x = handle.enemy.position.x
      ctrl.group.position.z = handle.enemy.position.z

      const groundY = this.heightmap.heightAt(handle.enemy.position.x, handle.enemy.position.z)
      ctrl.group.position.y = groundY
      handle.enemy.position.y = groundY + hitCenterY

      this.enemyTiltCache.applyTilt(
        handle.id,
        handle.enemy.position.x,
        handle.enemy.position.z,
        ctrl.group,
      )

      if (handle.type === 'chimera' && handle.lastOutput.isChasing) {
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

    if (
      handle.type === 'chimera' &&
      handle.enemy.alive &&
      handle.lastOutput.wantsToFire
    ) {
      const chim = ctrl as ChimeraWalkerController
      chim.group.updateMatrixWorld(true)
      const muzzle = this.chimeraLaserOriginScratch
      chim.getEyeLaserMuzzle(muzzle)
      const aimX = handle.lastOutput.aimTargetX
      const aimY = handle.lastOutput.aimTargetY
      const aimZ = handle.lastOutput.aimTargetZ
      const ddx = aimX - muzzle.x
      const ddy = aimY - muzzle.y
      const ddz = aimZ - muzzle.z
      const dist = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz)
      if (dist > 0.01) {
        this.enemyProjectileSystem.spawn(
          muzzle.x,
          muzzle.y,
          muzzle.z,
          ddx / dist,
          ddy / dist,
          ddz / dist,
          handle.config.projectileSpeed,
          handle.config.projectileDamage,
        )
        chim.pulseEyeLaser()
      }
    }
  }

  private syncSpireController(
    ctrl: SpireController | undefined,
    handle: EnemyHandle,
    dt: number,
    player: MiniGameContext['playerPosition'],
  ): void {
    if (!ctrl) return

    if (ctrl.deathComplete) {
      ctrl.group.removeFromParent()
      ctrl.dispose()
      this.projectileSystem.removeEnemy(handle.enemy)
      this.enemyDirector.despawn(handle)
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

      if (player && handle.lastOutput.isChasing) {
        const dx = player.x - handle.enemy.position.x
        const dz = player.z - handle.enemy.position.z
        ctrl.group.rotation.y = Math.atan2(dx, dz)
      }

      if (player && handle.lastOutput.wantsToFire) {
        const ep = handle.enemy.position
        const dx = player.x - ep.x
        const dy = player.y - ep.y
        const dz = player.z - ep.z
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (dist > 0.01) {
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
          ctrl.fireFlash(player.x, player.z)
        }
      }
    }

    ctrl.tick(dt)
  }

  private updatePromptWhileBlocked(ctx: MiniGameContext): void {
    if (ctx.levelState !== 'eva' || !ctx.playerPosition) return

    const dist = this.distanceToNest(ctx.playerPosition.x, ctx.playerPosition.z)
    if (dist <= NEST_INTERACT_RANGE) {
      this._isPlayerNear = true
      this.onPrompt?.('CLEAR THE DEFENDERS FIRST')
    }
  }

  private updateNestInteraction(ctx: MiniGameContext): void {
    if (ctx.levelState !== 'eva' || !ctx.playerPosition) {
      this.onPrompt?.(null)
      return
    }

    const dist = this.distanceToNest(ctx.playerPosition.x, ctx.playerPosition.z)
    if (dist > NEST_INTERACT_RANGE) {
      this.onPrompt?.(null)
      return
    }

    this._isPlayerNear = true
    this.onPrompt?.('[E] DEPLOY EXPLOSIVE CHARGES')
    if (ctx.terminalInteractPressed) {
      this.armCharges()
    }
  }

  private armCharges(): void {
    this.armed = true
    this.countdownRemaining = COUNTDOWN_DURATION
    this.advanceStep(1)
  }

  private detonate(ctx: MiniGameContext): void {
    this.armed = false
    this._isPlayerNear = false
    this.nest.group.visible = false
    this.scene.remove(this.nest.group)
    this.nest.dispose()

    // Deploy marker is no longer relevant once the charges fire.
    this.deployMarker.visible = false

    this.craterGroup.visible = true
    this.explosionFlashTimer = EXPLOSION_FLASH_DURATION
    this.explosionCoreTimer = EXPLOSION_CORE_DURATION
    this.shockwaveTimer = SHOCKWAVE_DURATION

    this.explosionFlash.visible = true
    this.explosionFlash.position.set(this.nestPosition.x, this.nestPosition.y + 2, this.nestPosition.z)
    this.explosionFlash.scale.setScalar(1)
    ;(this.explosionFlash.material as THREE.MeshBasicMaterial).opacity = 0.85

    this.explosionCore.visible = true
    this.explosionCore.position.set(this.nestPosition.x, this.nestPosition.y + 2, this.nestPosition.z)
    this.explosionCore.scale.setScalar(1)
    ;(this.explosionCore.material as THREE.MeshBasicMaterial).opacity = 1

    this.shockwave.visible = true
    this.shockwave.position.set(this.nestPosition.x, this.nestPosition.y + 0.18, this.nestPosition.z)
    this.shockwave.scale.setScalar(1)
    ;(this.shockwave.material as THREE.MeshBasicMaterial).opacity = 0.9

    this.explosionLight.visible = true
    this.explosionLight.position.set(this.nestPosition.x, this.nestPosition.y + 4, this.nestPosition.z)
    this.explosionLight.intensity = EXPLOSION_LIGHT_INTENSITY

    this.onExplosion?.(this.nestPosition.clone())

    const playerHit = !!ctx.playerPosition &&
      this.distanceToNest(ctx.playerPosition.x, ctx.playerPosition.z) <= BLAST_RADIUS
    const landerHit = !!ctx.landerPosition &&
      this.distanceToNest(ctx.landerPosition.x, ctx.landerPosition.z) <= BLAST_RADIUS

    if (playerHit) {
      this.onKillPlayer?.()
    }
    if (landerHit) {
      this.onDestroyLander?.()
    }
    if (playerHit || landerHit) {
      this._status = 'failed'
      this.onPrompt?.('BLAST RADIUS BREACHED')
      return
    }

    this.advanceStep(2)
    this._status = 'completed'
    this.onPrompt?.(null)
    this.clearEncounter()
    this.clearEnemyProjectiles()
    this.onComplete?.(this.objectiveIndex)
  }

  private syncExplosionFlash(dt: number): void {
    // Outer fireball + point light — long-lived, large, easeOut on opacity.
    if (this.explosionFlashTimer > 0) {
      this.explosionFlashTimer = Math.max(0, this.explosionFlashTimer - dt)
      const t = 1 - this.explosionFlashTimer / EXPLOSION_FLASH_DURATION
      this.explosionFlash.scale.setScalar(1 + t * EXPLOSION_FLASH_MAX_SCALE)
      ;(this.explosionFlash.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.85
      this.explosionLight.intensity = (1 - t) * EXPLOSION_LIGHT_INTENSITY

      if (this.explosionFlashTimer <= 0) {
        this.explosionFlash.visible = false
        this.explosionLight.visible = false
        this.explosionLight.intensity = 0
      }
    }

    // White-hot inner core — short, punchy. Decays first so the fireball
    // momentarily dominates after the saturation.
    if (this.explosionCoreTimer > 0) {
      this.explosionCoreTimer = Math.max(0, this.explosionCoreTimer - dt)
      const t = 1 - this.explosionCoreTimer / EXPLOSION_CORE_DURATION
      this.explosionCore.scale.setScalar(1 + t * EXPLOSION_CORE_MAX_SCALE)
      ;(this.explosionCore.material as THREE.MeshBasicMaterial).opacity = Math.pow(1 - t, 1.6)

      if (this.explosionCoreTimer <= 0) {
        this.explosionCore.visible = false
      }
    }

    // Ground shockwave ring — expands from radius 1 to {@link SHOCKWAVE_MAX_SCALE}
    // while fading. Provides a planar visual anchor for the blast separate from
    // the spherical fireball.
    if (this.shockwaveTimer > 0) {
      this.shockwaveTimer = Math.max(0, this.shockwaveTimer - dt)
      const t = 1 - this.shockwaveTimer / SHOCKWAVE_DURATION
      // EaseOut so the wave starts fast and slows as it expands.
      const eased = 1 - Math.pow(1 - t, 2)
      this.shockwave.scale.setScalar(1 + eased * (SHOCKWAVE_MAX_SCALE - 1))
      ;(this.shockwave.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.9

      if (this.shockwaveTimer <= 0) {
        this.shockwave.visible = false
      }
    }
  }

  /**
   * Update the deploy marker visibility + pulse. The marker pulses on a sine
   * so it reads as "active waypoint" instead of a flat overlay; opacity
   * modulation is bounded so it never fully disappears mid-pulse.
   *
   * @param dt - Frame delta in seconds.
   * @param wantVisible - Whether the marker should be shown this frame
   *   (defenders dead, charges not yet armed).
   */
  private syncDeployMarker(dt: number, wantVisible: boolean): void {
    if (this.deployMarker.visible !== wantVisible) {
      this.deployMarker.visible = wantVisible
    }
    if (!wantVisible) return

    this.deployMarkerPhase += dt * DEPLOY_MARKER_PULSE_HZ * Math.PI * 2
    const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(this.deployMarkerPhase))
    ;(this.deployMarkerRing.material as THREE.MeshBasicMaterial).opacity = pulse * 0.7
    ;(this.deployMarkerBeam.material as THREE.MeshBasicMaterial).opacity = pulse * 0.22
  }

  private clearEncounter(): void {
    for (const enemy of this.encounterEnemies) {
      this.projectileSystem.removeEnemy(enemy)
    }
    this.encounterEnemies.length = 0

    for (const ctrl of this.groundControllers.values()) {
      ctrl.group.removeFromParent()
      ctrl.dispose()
    }
    this.groundControllers.clear()

    for (const ctrl of this.chimeraControllers.values()) {
      ctrl.group.removeFromParent()
      ctrl.dispose()
    }
    this.chimeraControllers.clear()

    for (const ctrl of this.spireControllers.values()) {
      ctrl.group.removeFromParent()
      ctrl.dispose()
    }
    this.spireControllers.clear()

    this.enemyDirector.despawnAll()
    this.enemyByHandleId.clear()
    this.enemyTiltCache.clear()
  }

  private clearEnemyProjectiles(): void {
    this.enemyProjectileSystem.dispose()
    this.enemyProjectileMeshPool.disposeAll()
  }

  private advanceStep(index: number): void {
    const step = this._steps[index]
    if (!step || step.complete) return
    step.complete = true
    step.active = false

    const next = this._steps.find((candidate) => !candidate.complete)
    if (next) next.active = true
    this.onStepChange?.(this.objectiveIndex, this._steps)
  }

  private distanceToNest(x: number, z: number): number {
    const dx = x - this.nestPosition.x
    const dz = z - this.nestPosition.z
    return Math.sqrt(dx * dx + dz * dz)
  }

  private liveEnemyCount(): number {
    let count = 0
    for (const handle of this.enemyDirector.enemies) {
      if (handle.enemy.alive) count++
    }
    return count
  }
}
