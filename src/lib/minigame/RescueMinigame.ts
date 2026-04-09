/**
 * Rescue minigame — land at the outbreak, keep survivors alive, then purge the virus.
 *
 * A floating virus infestation hovers over the objective site. Landing the lander inside
 * the flat zone releases hostages and spawns a local enemy response. The player must keep
 * at least one hostage alive, eliminate the attackers, heal the survivors to full, then
 * arm charges on the virus and evacuate the blast radius.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/asteroid-lander-gdd.md
 */
import * as THREE from 'three'
import type { MiniGame, MiniGameContext, MiniGameEvents, MiniGameStatus, MiniGameStep } from './MiniGame'
import type { ConcreteObjective } from '@/lib/missions/types'
import { Timer, type TimerHandle } from '@/lib/Timer'
import type { Heightmap } from '@/lib/terrain/heightmap'
import { FLAT_ZONE_RADIUS } from '@/lib/terrain/terrainGenerator'
import type { ProjectileSystem } from '@/lib/fps/projectileSystem'
import type { Hostage } from '@/lib/fps/hostage'
import { EnemyDirector, type EnemyHandle } from '@/lib/fps/enemyDirector'
import { EnemyProjectileSystem } from '@/lib/fps/enemyProjectileSystem'
import { VirusModel } from '@/three/VirusModel'
import { FpsHostageController } from '@/three/FpsHostageController'
import { HostageModel } from '@/three/HostageModel'
import { BacteriophageController, PHAGE_HIT_CENTER_Y } from '@/three/BacteriophageController'
import { SpireController, SPIRE_HIT_CENTER_Y } from '@/three/SpireController'
import { ChimeraWalkerController, CHIMERA_HIT_CENTER_Y } from '@/three/ChimeraWalkerController'
import { EnemyProjectileMesh } from '@/three/EnemyProjectileMesh'
import type { Enemy } from '@/lib/fps/enemy'

const VIRUS_SCALE = 600
const VIRUS_FLOAT_HEIGHT = 200
const VIRUS_BOB_AMPLITUDE = 1.2
const VIRUS_BOB_SPEED = 1.5
const VIRUS_ROTATION_SPEED = 0.4
const VIRUS_INTERACT_RANGE = 18
const LANDING_SITE_RADIUS = FLAT_ZONE_RADIUS * 0.88
const HOSTAGE_RING_MIN_RADIUS = 24
const HOSTAGE_RING_MAX_RADIUS = FLAT_ZONE_RADIUS * 0.82 * 0.72
const CONTAINED_HOSTAGE_RADIUS = 26
const CONTAINED_HOSTAGE_BOB_AMPLITUDE = 5
const CONTAINED_HOSTAGE_BOB_SPEED = 1.1
const CONTAINED_HOSTAGE_SWIRL_SPEED = 0.35
const CONTAINED_HOSTAGE_VERTICAL_SPAN = 18
const GROUND_RELEASE_DELAY = 2
const COUNTDOWN_DURATION = 5
const BLAST_RADIUS = 24
const CONTACT_KNOCKBACK = 10
const ENEMY_PLAYER_FAR_DISTANCE = 99999
const EXPLOSION_FLASH_DURATION = 0.45
const EXPLOSION_FLASH_MAX_SCALE = 36
const EXPLOSION_LIGHT_INTENSITY = 6.5
const EXPLOSION_LIGHT_DISTANCE = 88

const explosionFlashMat = new THREE.MeshBasicMaterial({
  color: 0x66ffcc,
  transparent: true,
  opacity: 0.72,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})

const explosionFlashGeo = new THREE.SphereGeometry(1, 16, 12)

interface ContainedHostageVisual {
  model: HostageModel
  angleOffset: number
  verticalOffset: number
  bobPhase: number
}

export class RescueMinigame implements MiniGame, MiniGameEvents {
  readonly objectiveIndex: number

  private _status: MiniGameStatus = 'active'
  private _isPlayerNear = false

  private readonly _steps: MiniGameStep[] = [
    { label: 'Land in the outbreak zone', complete: false, active: true },
    { label: 'Eliminate the attackers', complete: false, active: false },
    { label: 'Heal the survivors', complete: false, active: false },
    { label: 'Destroy the virus infestation', complete: false, active: false },
  ]

  private readonly objective: ConcreteObjective
  private readonly scene: THREE.Scene
  private readonly heightmap: Heightmap
  private readonly projectileSystem: ProjectileSystem
  private readonly missionDifficulty: number
  private readonly virus: VirusModel
  private readonly virusPosition = new THREE.Vector3()
  private readonly enemyDirector = new EnemyDirector()
  private readonly enemyProjectileSystem = new EnemyProjectileSystem()
  private readonly hostages: FpsHostageController
  private readonly groundControllers = new Map<number, BacteriophageController>()
  private readonly spireControllers = new Map<number, SpireController>()
  private readonly chimeraControllers = new Map<number, ChimeraWalkerController>()
  private readonly enemyProjectileMeshes = new Map<number, EnemyProjectileMesh>()
  private readonly enemyByHandleId = new Map<number, Enemy>()
  private readonly encounterEnemies: Enemy[] = []
  private readonly containedHostages: ContainedHostageVisual[] = []
  private readonly explosionFlash = new THREE.Mesh(explosionFlashGeo, explosionFlashMat)
  private readonly explosionLight = new THREE.PointLight(0x66ffcc, 0, EXPLOSION_LIGHT_DISTANCE)
  private readonly previousHostageBoltHandler: ProjectileSystem['onHostageBolt']

  private activated = false
  private activationPending = false
  private hostagesReleased = false
  private encounterStarted = false
  private armed = false
  private releaseTimerHandle: TimerHandle | null = null
  private countdownRemaining = COUNTDOWN_DURATION
  private explosionFlashTimer = 0
  private virusBaseY = 0
  private virusAnimTime = 0

  onDamagePlayer: ((damage: number, sourceX: number, sourceZ: number) => void) | null = null
  onKillPlayer: (() => void) | null = null
  onDestroyLander: (() => void) | null = null
  onExplosion: ((position: THREE.Vector3) => void) | null = null
  onFail: ((objectiveIndex: number, cause: string) => void) | null = null

  onPrompt: ((text: string | null) => void) | null = null
  onComplete: ((objectiveIndex: number) => void) | null = null
  onStepChange: ((objectiveIndex: number, steps: readonly MiniGameStep[]) => void) | null = null

  get status(): MiniGameStatus {
    return this._status
  }

  get isPlayerNearInteraction(): boolean {
    return this._isPlayerNear
  }

  get timeRemaining(): number | null {
    return null
  }

  get progressCurrent(): number | null {
    if (!this.activated) return 0
    const total = this.encounterEnemies.length
    if (total === 0) return 0
    return total - this.liveEnemyCount()
  }

  get progressTotal(): number | null {
    return this.encounterEnemies.length
  }

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
    virus: VirusModel,
  ) {
    this.objectiveIndex = objectiveIndex
    this.objective = objective
    this.scene = scene
    this.heightmap = heightmap
    this.projectileSystem = projectileSystem
    this.missionDifficulty = missionDifficulty
    this.virus = virus
    this.previousHostageBoltHandler = projectileSystem.onHostageBolt
    this.hostages = new FpsHostageController(scene, heightmap)
    this.hostages.setProjectileSystem(projectileSystem)
    this.hostages.setEnemyProjectileSystem(this.enemyProjectileSystem)

    const groundY = heightmap.heightAt(objective.x, objective.z)
    this.virusBaseY = groundY + VIRUS_FLOAT_HEIGHT
    this.virusPosition.set(objective.x, groundY, objective.z)
    this.virus.placeAt(objective.x, this.virusBaseY, objective.z)
    this.virus.setYaw(Math.random() * Math.PI * 2)
    this.scene.add(this.virus.group)

    this.buildExplosionFlash()
    this.wireCallbacks()
  }

  static async create(
    objectiveIndex: number,
    objective: ConcreteObjective,
    scene: THREE.Scene,
    heightmap: Heightmap,
    projectileSystem: ProjectileSystem,
    missionDifficulty: number,
  ): Promise<RescueMinigame> {
    await HostageModel.preload()
    const virus = await VirusModel.create({ scale: VIRUS_SCALE })
    const minigame = new RescueMinigame(
      objectiveIndex,
      objective,
      scene,
      heightmap,
      projectileSystem,
      missionDifficulty,
      virus,
    )
    await minigame.createContainedHostageVisuals()
    return minigame
  }

  tick(dt: number, ctx: MiniGameContext): void {
    this._isPlayerNear = this.armed
    this.hostages.tick(dt)
    this.syncVirusVisual(dt)
    this.syncEnemySimulation(dt, ctx)
    this.syncExplosionFlash(dt)

    if (this._status === 'completed' || this._status === 'failed') {
      return
    }

    if (!this.activated) {
      this.updateLandingStep(ctx)
      return
    }

    if (this.activationPending) {
      return
    }

    if (!this.encounterStarted) {
      this.updatePreEncounterPrompt(ctx)
      if (ctx.levelState === 'eva') {
        this.startEnemyEncounter()
      }
      return
    }

    if (this.hostages.getAliveCount() === 0) {
      this.fail('All Survivors Lost')
      return
    }

    const allEnemiesDead = this.liveEnemyCount() === 0
    if (allEnemiesDead) {
      this.advanceStep(1)
    }

    if (!allEnemiesDead) {
      this.updateCombatPrompt(ctx)
      return
    }

    const survivorsStable = this.hostages.areAllLivingHostagesAtFullHealth()
    if (!survivorsStable) {
      this.updateHealPrompt(ctx)
      return
    }
    this.advanceStep(2)

    if (!this.armed) {
      this.updateVirusInteraction(ctx)
      return
    }

    this.countdownRemaining = Math.max(0, this.countdownRemaining - dt)
    const countdownText = Math.max(1, Math.ceil(this.countdownRemaining))
    this.onPrompt?.(`EVACUATE. DETONATION IN ${countdownText}`)

    if (this.countdownRemaining <= 0) {
      this.detonate(ctx)
    }
  }

  dispose(): void {
    if (this.releaseTimerHandle !== null) {
      Timer.cancel(this.releaseTimerHandle)
      this.releaseTimerHandle = null
    }
    this.clearEncounter()
    this.clearEnemyProjectiles()
    this.clearContainedHostageVisuals()
    this.hostages.dispose()
    this.scene.remove(this.virus.group)
    this.virus.dispose()
    this.explosionFlash.removeFromParent()
    this.explosionLight.removeFromParent()
  }

  private buildExplosionFlash(): void {
    this.explosionFlash.visible = false
    this.explosionLight.visible = false
    this.scene.add(this.explosionFlash)
    this.scene.add(this.explosionLight)
  }

  private wireCallbacks(): void {
    this.enemyDirector.onContactDamage = (handle, damage) => {
      const enemy = this.enemyByHandleId.get(handle.id)
      if (!enemy || !enemy.alive) return
      this.onDamagePlayer?.(damage, enemy.position.x, enemy.position.z)
    }

    this.enemyDirector.onHostageContactDamage = (_handle, hostage) => {
      this.hostages.notifyDamaged(hostage)
    }

    this.enemyProjectileSystem.onPlayerHit = (damage, sourceX, sourceZ) => {
      this.onDamagePlayer?.(damage, sourceX, sourceZ)
    }

    this.enemyProjectileSystem.onHostageHit = (hostage) => {
      this.hostages.notifyDamaged(hostage)
    }

    this.projectileSystem.onHostageBolt = (hostage, pos, effect) => {
      this.previousHostageBoltHandler?.(hostage, pos, effect)
      if (!this.ownsHostage(hostage)) return
      if (effect === 'heal') {
        this.hostages.notifyHealed(hostage)
      } else {
        this.hostages.notifyDamaged(hostage)
      }
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

  private syncVirusVisual(dt: number): void {
    this.virusAnimTime += dt
    const virusY =
      this.virusBaseY + Math.sin(this.virusAnimTime * VIRUS_BOB_SPEED) * VIRUS_BOB_AMPLITUDE
    this.virus.group.position.set(
      this.virusPosition.x,
      virusY,
      this.virusPosition.z,
    )
    this.virus.group.rotation.y += dt * VIRUS_ROTATION_SPEED

    for (const visual of this.containedHostages) {
      const orbit = this.virusAnimTime * CONTAINED_HOSTAGE_SWIRL_SPEED + visual.angleOffset
      const bob = Math.sin(this.virusAnimTime * CONTAINED_HOSTAGE_BOB_SPEED + visual.bobPhase)
      visual.model.group.position.set(
        this.virusPosition.x + Math.cos(orbit) * CONTAINED_HOSTAGE_RADIUS,
        virusY + visual.verticalOffset + bob * CONTAINED_HOSTAGE_BOB_AMPLITUDE,
        this.virusPosition.z + Math.sin(orbit) * CONTAINED_HOSTAGE_RADIUS,
      )
      visual.model.group.rotation.y = -orbit + Math.PI
    }
  }

  private updateLandingStep(ctx: MiniGameContext): void {
    if (ctx.levelState === 'lander' && ctx.landerPosition && this.isLanderInsideSite(ctx)) {
      this.onPrompt?.('LAND TO RELEASE THE SURVIVORS')
      if (ctx.landerGrounded) {
        void this.activateEncounter()
      }
      return
    }

    if (ctx.levelState === 'eva' && ctx.playerPosition) {
      const dist = this.distanceToVirus(ctx.playerPosition.x, ctx.playerPosition.z)
      if (dist <= LANDING_SITE_RADIUS) {
        this._isPlayerNear = true
        this.onPrompt?.('LAND THE LANDER INSIDE THE OUTBREAK ZONE')
      } else {
        this.onPrompt?.(null)
      }
      return
    }

    this.onPrompt?.(null)
  }

  private async activateEncounter(): Promise<void> {
    if (this.activated || this._status !== 'active') return
    this.activationPending = true
    this.activated = true
    this.advanceStep(0)
    try {
      this.hideContainedHostageVisuals()
      this.onPrompt?.('RELEASING SURVIVORS')
      this.releaseTimerHandle = Timer.after(GROUND_RELEASE_DELAY, () => {
        this.releaseTimerHandle = null
        void this.releaseHostagesToGround()
      })
    } finally {
      this.activationPending = false
    }
  }

  private startEnemyEncounter(): void {
    if (!this.hostagesReleased || this.encounterStarted || this._status !== 'active') return
    this.encounterStarted = true
    this.spawnEncounter()
    this.enemyDirector.setHostageTargets(this.hostages.getHostageEntitiesForDirector())
    this.onPrompt?.('HOSTILES INBOUND. PROTECT THE SURVIVORS')
  }

  private async releaseHostagesToGround(): Promise<void> {
    if (this._status !== 'active' || this.hostagesReleased) return
    await this.spawnHostages()
    this.hostagesReleased = true
    this.onPrompt?.('SURVIVORS RELEASED. EXIT THE LANDER')
  }

  private async spawnHostages(): Promise<void> {
    const colonistCount = Math.max(
      2,
      this.objective.colonistCount ?? Math.min(6, 2 + Math.floor(this.missionDifficulty / 2)),
    )
    const positions: Array<{ x: number; z: number; yaw: number }> = []
    for (let i = 0; i < colonistCount; i++) {
      const angle = (i / colonistCount) * Math.PI * 2 + Math.random() * 0.7
      const minR = Math.min(HOSTAGE_RING_MIN_RADIUS, HOSTAGE_RING_MAX_RADIUS * 0.55)
      const span = Math.max(0.01, HOSTAGE_RING_MAX_RADIUS - minR)
      const r = minR + Math.sqrt(Math.random()) * span
      const x = this.objective.x + Math.cos(angle) * r
      const z = this.objective.z + Math.sin(angle) * r
      positions.push({
        x,
        z,
        yaw: Math.atan2(this.objective.x - x, this.objective.z - z),
      })
    }
    await this.hostages.spawnAtPositions(positions)
  }

  private async createContainedHostageVisuals(): Promise<void> {
    const colonistCount = Math.max(
      2,
      this.objective.colonistCount ?? Math.min(6, 2 + Math.floor(this.missionDifficulty / 2)),
    )
    for (let i = 0; i < colonistCount; i++) {
      const model = await HostageModel.create({
        scale: 0.8,
        castShadow: false,
        receiveShadow: false,
      })
      this.scene.add(model.group)
      this.containedHostages.push({
        model,
        angleOffset: (i / colonistCount) * Math.PI * 2,
        verticalOffset: ((i / Math.max(1, colonistCount - 1)) - 0.5) * CONTAINED_HOSTAGE_VERTICAL_SPAN,
        bobPhase: Math.random() * Math.PI * 2,
      })
    }
  }

  private hideContainedHostageVisuals(): void {
    for (const visual of this.containedHostages) {
      visual.model.group.visible = false
    }
  }

  private clearContainedHostageVisuals(): void {
    for (const visual of this.containedHostages) {
      visual.model.group.removeFromParent()
      visual.model.dispose()
    }
    this.containedHostages.length = 0
  }

  private spawnEncounter(): void {
    const colonistCount = this.objective.colonistCount ?? this.hostages.getTotalCount()
    const guardedBonus = this.objective.isGuarded ? 1 : 0
    const spireCount = Math.min(
      2,
      Math.max(0, Math.floor((this.missionDifficulty - 3) / 3) + guardedBonus),
    )
    const chimeraCount = Math.min(
      2,
      Math.max(0, Math.floor((this.missionDifficulty - 4) / 3)),
    )
    const phageCount = Math.max(
      3,
      Math.floor(this.missionDifficulty / 2) + Math.ceil(colonistCount / 2) + guardedBonus,
    )

    this.spawnEnemiesOfType('bacteriophage', phageCount)
    this.spawnEnemiesOfType('chimera', chimeraCount)
    this.spawnEnemiesOfType('spire', spireCount)
  }

  private spawnEnemiesOfType(type: 'bacteriophage' | 'chimera' | 'spire', count: number): void {
    if (count <= 0) return
    for (let i = 0; i < count; i++) {
      const x = this.objective.x
      const z = this.objective.z
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

  private syncEnemySimulation(dt: number, ctx: MiniGameContext): void {
    if (!this.activated) return

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

    this.enemyDirector.setHostageTargets(this.hostages.getHostageEntitiesForDirector())
    this.enemyDirector.tick(dt)
    this.enemyProjectileSystem.tick(dt)

    for (const handle of this.enemyDirector.enemies) {
      this.syncGroundController(this.groundControllers.get(handle.id), handle, dt, PHAGE_HIT_CENTER_Y)
      this.syncGroundController(this.chimeraControllers.get(handle.id), handle, dt, CHIMERA_HIT_CENTER_Y)
      this.syncSpireController(this.spireControllers.get(handle.id), handle, dt)
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
          ctrl.fireFlash(aimX, aimZ)
        }
      }
    }

    ctrl.tick(dt)
  }

  private updateCombatPrompt(ctx: MiniGameContext): void {
    if (ctx.levelState !== 'eva' || !ctx.playerPosition) return

    const dist = this.distanceToVirus(ctx.playerPosition.x, ctx.playerPosition.z)
    if (dist <= VIRUS_INTERACT_RANGE) {
      this._isPlayerNear = true
      this.onPrompt?.('PROTECT THE SURVIVORS. ELIMINATE THE ATTACKERS')
    }
  }

  private updatePreEncounterPrompt(ctx: MiniGameContext): void {
    if (!this.hostagesReleased) return

    if (ctx.levelState === 'lander') {
      this.onPrompt?.('SURVIVORS RELEASED. EXIT THE LANDER')
      return
    }

    if (ctx.levelState === 'eva') {
      this.onPrompt?.('HOSTILES INBOUND')
      return
    }

    this.onPrompt?.(null)
  }

  private updateHealPrompt(ctx: MiniGameContext): void {
    if (ctx.levelState !== 'eva' || !ctx.playerPosition) {
      this.onPrompt?.(null)
      return
    }

    const dist = this.distanceToVirus(ctx.playerPosition.x, ctx.playerPosition.z)
    if (dist <= VIRUS_INTERACT_RANGE) {
      this._isPlayerNear = true
      this.onPrompt?.('HEAL THE SURVIVORS TO FULL HEALTH')
    } else {
      this.onPrompt?.(null)
    }
  }

  private updateVirusInteraction(ctx: MiniGameContext): void {
    if (ctx.levelState !== 'eva' || !ctx.playerPosition) {
      this.onPrompt?.(null)
      return
    }

    const dist = this.distanceToVirus(ctx.playerPosition.x, ctx.playerPosition.z)
    if (dist > VIRUS_INTERACT_RANGE) {
      this.onPrompt?.(null)
      return
    }

    this._isPlayerNear = true
    this.onPrompt?.('[E] PLANT CHARGES ON THE VIRUS')
    if (ctx.terminalInteractPressed) {
      this.armCharges()
    }
  }

  private armCharges(): void {
    this.armed = true
    this.countdownRemaining = COUNTDOWN_DURATION
    this.advanceStep(3)
  }

  private detonate(ctx: MiniGameContext): void {
    this.armed = false
    this._isPlayerNear = false
    this.scene.remove(this.virus.group)
    this.virus.dispose()

    this.explosionFlashTimer = EXPLOSION_FLASH_DURATION
    this.explosionFlash.visible = true
    this.explosionFlash.position.set(this.virusPosition.x, this.virusBaseY - 6, this.virusPosition.z)
    this.explosionFlash.scale.setScalar(1)
    this.explosionLight.visible = true
    this.explosionLight.position.set(this.virusPosition.x, this.virusBaseY - 4, this.virusPosition.z)
    this.explosionLight.intensity = EXPLOSION_LIGHT_INTENSITY
    this.onExplosion?.(this.virusPosition.clone())

    const playerHit = !!ctx.playerPosition &&
      this.distanceToVirus(ctx.playerPosition.x, ctx.playerPosition.z) <= BLAST_RADIUS
    const landerHit = !!ctx.landerPosition &&
      this.distanceToVirus(ctx.landerPosition.x, ctx.landerPosition.z) <= BLAST_RADIUS

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

    this._status = 'completed'
    this.onPrompt?.(null)
    this.clearEncounter()
    this.clearEnemyProjectiles()
    this.hostages.clear()
    this.onComplete?.(this.objectiveIndex)
  }

  private syncExplosionFlash(dt: number): void {
    if (this.explosionFlashTimer <= 0) return

    this.explosionFlashTimer = Math.max(0, this.explosionFlashTimer - dt)
    const t = 1 - this.explosionFlashTimer / EXPLOSION_FLASH_DURATION
    const scale = 1 + t * EXPLOSION_FLASH_MAX_SCALE
    this.explosionFlash.scale.setScalar(scale)
    const opacity = (1 - t) * 0.72
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
    this.enemyDirector.setHostageTargets([])
  }

  private clearEnemyProjectiles(): void {
    this.enemyProjectileSystem.dispose()
    for (const mesh of this.enemyProjectileMeshes.values()) {
      mesh.dispose()
    }
    this.enemyProjectileMeshes.clear()
  }

  private fail(cause: string): void {
    if (this._status === 'failed' || this._status === 'completed') return
    this._status = 'failed'
    if (this.releaseTimerHandle !== null) {
      Timer.cancel(this.releaseTimerHandle)
      this.releaseTimerHandle = null
    }
    this.onPrompt?.(cause.toUpperCase())
    this.clearEncounter()
    this.clearEnemyProjectiles()
    this.clearContainedHostageVisuals()
    this.hostages.clear()
    this.onFail?.(this.objectiveIndex, cause)
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

  private distanceToVirus(x: number, z: number): number {
    const dx = x - this.virusPosition.x
    const dz = z - this.virusPosition.z
    return Math.sqrt(dx * dx + dz * dz)
  }

  private isLanderInsideSite(ctx: MiniGameContext): boolean {
    if (!ctx.landerPosition) return false
    return this.distanceToVirus(ctx.landerPosition.x, ctx.landerPosition.z) <= LANDING_SITE_RADIUS
  }

  private ownsHostage(hostage: Hostage): boolean {
    return this.hostages.getHostageEntitiesForDirector().includes(hostage)
  }

  private liveEnemyCount(): number {
    let count = 0
    for (const handle of this.enemyDirector.enemies) {
      if (handle.enemy.alive) count++
    }
    return count
  }
}
