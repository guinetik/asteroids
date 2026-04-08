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
import { NestModel } from '@/three/NestModel'
import { BacteriophageController, PHAGE_HIT_CENTER_Y } from '@/three/BacteriophageController'
import { SpireController, SPIRE_HIT_CENTER_Y } from '@/three/SpireController'
import { ChimeraWalkerController, CHIMERA_HIT_CENTER_Y } from '@/three/ChimeraWalkerController'
import { EnemyProjectileMesh } from '@/three/EnemyProjectileMesh'
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
const EXPLOSION_FLASH_DURATION = 0.45
const EXPLOSION_FLASH_MAX_SCALE = 34
const EXPLOSION_LIGHT_INTENSITY = 6
const EXPLOSION_LIGHT_DISTANCE = 80

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

const craterGeo = new THREE.CircleGeometry(CRATER_RADIUS, 32)
const craterRingGeo = new THREE.RingGeometry(CRATER_RADIUS * 0.72, CRATER_RADIUS * 1.08, 32)
const explosionFlashGeo = new THREE.SphereGeometry(1, 16, 12)

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
  private readonly enemyProjectileMeshes = new Map<number, EnemyProjectileMesh>()
  private readonly enemyByHandleId = new Map<number, Enemy>()
  private readonly encounterEnemies: Enemy[] = []
  private readonly craterGroup = new THREE.Group()
  private readonly explosionFlash = new THREE.Mesh(explosionFlashGeo, explosionFlashMat)
  private readonly explosionLight = new THREE.PointLight(0xff8844, 0, EXPLOSION_LIGHT_DISTANCE)

  private armed = false
  private countdownRemaining = COUNTDOWN_DURATION
  private explosionFlashTimer = 0
  /** Called when the player should take direct damage. */
  onDamagePlayer: ((damage: number, sourceX: number, sourceZ: number) => void) | null = null
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

    const groundY = heightmap.heightAt(objective.x, objective.z)
    this.nestPosition.set(objective.x, groundY, objective.z)
    this.nest.placeAt(objective.x, groundY, objective.z)
    this.nest.setYaw(Math.random() * Math.PI * 2)
    this.scene.add(this.nest.group)

    this.buildCrater()
    this.buildExplosionFlash()
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

  /** Clean up all resources owned by this minigame. */
  dispose(): void {
    this.clearEncounter()
    this.clearEnemyProjectiles()
    this.scene.remove(this.nest.group)
    this.nest.dispose()
    this.craterGroup.removeFromParent()
    this.explosionFlash.removeFromParent()
    this.explosionLight.removeFromParent()
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
    this.explosionLight.visible = false
    this.scene.add(this.explosionFlash)
    this.scene.add(this.explosionLight)
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
      this.onDamagePlayer?.(damage, enemy.position.x, enemy.position.z)
    }

    this.enemyProjectileSystem.onPlayerHit = (damage, sourceX, sourceZ) => {
      this.onDamagePlayer?.(damage, sourceX, sourceZ)
    }

    this.enemyProjectileSystem.onProjectileMove = (id, x, y, z) => {
      let mesh = this.enemyProjectileMeshes.get(id)
      if (!mesh) {
        mesh = new EnemyProjectileMesh()
        this.scene.add(mesh.group)
        this.enemyProjectileMeshes.set(id, mesh)
      }
      mesh.setPosition(x, y, z)
    }

    this.enemyProjectileSystem.onProjectileRemoved = (id) => {
      const mesh = this.enemyProjectileMeshes.get(id)
      if (!mesh) return
      mesh.dispose()
      this.enemyProjectileMeshes.delete(id)
    }
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

      if (handle.lastOutput.isMoving) {
        const dir = handle.lastOutput.moveDir
        ctrl.group.rotation.y = Math.atan2(dir.x, dir.z)
      }

      const n = this.heightmap.normalAt(handle.enemy.position.x, handle.enemy.position.z)
      ctrl.group.rotation.x = Math.atan2(n.z, n.y)
      ctrl.group.rotation.z = Math.atan2(-n.x, n.y)
    }

    ctrl.tick(dt)
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

    this.craterGroup.visible = true
    this.explosionFlashTimer = EXPLOSION_FLASH_DURATION
    this.explosionFlash.visible = true
    this.explosionFlash.position.set(this.nestPosition.x, this.nestPosition.y + 2, this.nestPosition.z)
    this.explosionFlash.scale.setScalar(1)
    this.explosionLight.visible = true
    this.explosionLight.position.set(this.nestPosition.x, this.nestPosition.y + 3, this.nestPosition.z)
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
    if (this.explosionFlashTimer <= 0) return

    this.explosionFlashTimer = Math.max(0, this.explosionFlashTimer - dt)
    const t = 1 - this.explosionFlashTimer / EXPLOSION_FLASH_DURATION
    const scale = 1 + t * EXPLOSION_FLASH_MAX_SCALE
    this.explosionFlash.scale.setScalar(scale)
    const opacity = (1 - t) * 0.8
    ;(this.explosionFlash.material as THREE.MeshBasicMaterial).opacity = opacity
    this.explosionLight.intensity = (1 - t) * EXPLOSION_LIGHT_INTENSITY

    if (this.explosionFlashTimer <= 0) {
      this.explosionFlash.visible = false
      this.explosionLight.visible = false
      this.explosionLight.intensity = 0
    }
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
  }

  private clearEnemyProjectiles(): void {
    this.enemyProjectileSystem.dispose()
    for (const mesh of this.enemyProjectileMeshes.values()) {
      mesh.dispose()
    }
    this.enemyProjectileMeshes.clear()
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
