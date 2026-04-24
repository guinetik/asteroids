/**
 * Bridges Vue lifecycle to the FPS demo scene.
 * Terrain grid + first-person player with O2-fueled movement.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-fps-movement-design.md
 */
import type { Tickable } from '@/lib/Tickable'
import type { FpsTelemetry } from '@/lib/ui/fpsHudTypes'
import { DevConsole } from '@/lib/devConsole'
import { GameLoop } from '@/lib/GameLoop'
import { TickHandler } from '@/lib/TickHandler'
import { InputManager } from '@/lib/InputManager'
import { FPS_BINDINGS } from '@/lib/defaultBindings'
import {
  TICK_PRIORITY_INPUT,
  TICK_PRIORITY_PHYSICS,
  TICK_PRIORITY_ANIMATION,
  TICK_PRIORITY_RENDER,
} from '@/lib/tickPriorities'
import { SceneManager } from '@/three/SceneManager'
import { FpsCamera } from '@/three/FpsCamera'
import { FpsPlayerController } from '@/three/FpsPlayerController'
import { TerrainGrid } from '@/three/TerrainGrid'
import { generateTerrain } from '@/lib/terrain/terrainGenerator'
import type { SurfaceFeatures } from '@/lib/asteroids/types'
import { AmbientLight, DirectionalLight, Color, Vector3 } from 'three'
import { Heightmap } from '@/lib/terrain/heightmap'
import { MultiToolController } from '@/three/MultiToolController'
import { MultiToolState } from '@/lib/fps/multiToolState'
import { ProjectileSystem } from '@/lib/fps/projectileSystem'
import { ParticleEmitter } from '@/three/ParticleEmitter'
import { TargetDummyController } from '@/three/TargetDummyController'
import { buildFpsPlayerConfig } from '@/lib/fps/buildFpsPlayerConfig'
import { buildMultiToolConfig } from '@/lib/fps/buildMultiToolConfig'
import { getCurrentUpgradeValue } from '@/lib/upgrades'
import { EnemyDirector } from '@/lib/fps/enemyDirector'
import { EnemyLodApplier } from '@/lib/fps/enemyLodHelper'
import { BacteriophageController, PHAGE_HIT_CENTER_Y } from '@/three/BacteriophageController'
import { EnemyProjectileSystem } from '@/lib/fps/enemyProjectileSystem'
import { EnemyTiltCache } from '@/lib/fps/enemyTiltCache'
import { SpireController, SPIRE_HIT_CENTER_Y } from '@/three/SpireController'
import { ChimeraWalkerController, CHIMERA_HIT_CENTER_Y } from '@/three/ChimeraWalkerController'
import { EnemyProjectileMeshPool } from '@/three/EnemyProjectileMeshPool'
import { FpsHostageController } from '@/three/FpsHostageController'
import { VirusModel } from '@/three/VirusModel'
import { FpsAudioDirector } from '@/audio/FpsAudioDirector'
import { FpsPointerLockSession } from '@/lib/fps/FpsPointerLockSession'
import {
  computeKnockbackAwayFromSource,
  computeRelativeDamageAngle,
  stepDamageFlash,
} from '@/lib/fps/fpsPresentation'

const AMBIENT_LIGHT_INTENSITY = 0.4
const DIR_LIGHT_INTENSITY = 1.2
const GRID_SIZE = 2000
const TERRAIN_SEED = 77
const TERRAIN_RESOLUTION = 128
const SPAWN_HEIGHT = 5
const ENEMY_SPAWN_COUNT = 8
const ENEMY_SPAWN_RADIUS = 80
const ENEMY_MIN_SPAWN_DISTANCE = 20
const DAMAGE_FLASH_DURATION = 0.3
const DAMAGE_FLINCH_STRENGTH = 80
const CONTACT_KNOCKBACK = 12
const SPIRE_SPAWN_COUNT = 4
const SPIRE_SPAWN_RADIUS = 100
const SPIRE_MIN_SPAWN_DISTANCE = 40
const CHIMERA_SPAWN_COUNT = 3
const CHIMERA_SPAWN_RADIUS = 90
const CHIMERA_MIN_SPAWN_DISTANCE = 32

/** Upper bound for `?hostages=` / `?viruses=` counts (URL safety). */
const DEBUG_PROP_SPAWN_CAP = 24
/** Default count when the query key is present without a numeric value. */
const DEBUG_HOSTAGE_SPAWN_DEFAULT = 3
const DEBUG_VIRUS_SPAWN_DEFAULT = 3
/** Ring placement for debug hostages (world units from origin). */
const DEBUG_HOSTAGE_SPAWN_RADIUS = 52
/** Ring placement for debug viruses — slightly tighter so rings read as distinct. */
const DEBUG_VIRUS_SPAWN_RADIUS = 24

/**
 * Read an optional non-negative spawn count from the URL (`?key`, `?key=true`, or `?key=12`).
 *
 * @param params - Current location search params
 * @param key - Query key (e.g. `hostages`)
 * @param defaultWhenPresent - Count when the flag is set but not numeric
 * @returns `undefined` if the key is absent; otherwise a clamped integer
 */
function parseDebugPropCount(
  params: URLSearchParams,
  key: string,
  defaultWhenPresent: number,
): number | undefined {
  if (!params.has(key)) return undefined
  const raw = params.get(key)
  if (raw === null || raw === '' || raw.toLowerCase() === 'true') {
    return Math.min(defaultWhenPresent, DEBUG_PROP_SPAWN_CAP)
  }
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 0) {
    return Math.min(defaultWhenPresent, DEBUG_PROP_SPAWN_CAP)
  }
  return Math.min(n, DEBUG_PROP_SPAWN_CAP)
}

const TEST_SURFACE: SurfaceFeatures = {
  craterDensity: 0.5,
  craterMaxScale: 0.2,
  boulderDensity: 0.4,
  ridgeFrequency: 0.4,
  roughness: 0.6,
  dustCoverage: 0.3,
}

/**
 * FPS demo scene — terrain grid with first-person player movement.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-fps-movement-design.md
 */
export class FpsViewController implements Tickable {
  private gameLoop: GameLoop | null = null
  private tickHandler: TickHandler | null = null
  private inputManager: InputManager | null = null
  private sceneManager: SceneManager | null = null
  private fpsCamera: FpsCamera | null = null
  private playerController: FpsPlayerController | null = null
  private terrainGrid: TerrainGrid | null = null
  private heightmap: Heightmap | null = null
  private multiTool: MultiToolController | null = null
  private multiToolState: MultiToolState | null = null
  private projectileSystem: ProjectileSystem | null = null
  private impactEmitter: ParticleEmitter | null = null
  private readonly targetDummies: TargetDummyController[] = []
  private enemyDirector: EnemyDirector | null = null
  private readonly enemyControllers = new Map<number, BacteriophageController>()
  private enemyProjectileSystem: EnemyProjectileSystem | null = null
  private readonly spireControllers = new Map<number, SpireController>()
  private readonly chimeraControllers = new Map<number, ChimeraWalkerController>()
  private readonly chimeraLaserOriginScratch = new Vector3()
  /** Reused (0,1,0) seed for impact/explosion bursts. Treat as immutable. */
  private readonly _impactUp = new Vector3(0, 1, 0)
  /** Reused velocity scratch passed to `ParticleEmitter.emit` (which copies). */
  private readonly _impactVel = new Vector3()
  /** Reused scratch position used when the source position is constructed inline. */
  private readonly _impactPos = new Vector3()
  private enemyProjectileMeshPool: EnemyProjectileMeshPool | null = null
  private enemyTiltCache: EnemyTiltCache | null = null
  private readonly enemyLodApplier = new EnemyLodApplier()
  /** Rescue NPCs when `?hostages` is set — HP, bars, projectile registration. */
  private fpsHostageController: FpsHostageController | null = null
  /** GLB props from `?viruses` — disposed on teardown. */
  private readonly debugVirusModels: VirusModel[] = []
  private readonly pointerLock = new FpsPointerLockSession()

  /** Called each frame with player telemetry for HUD display. */
  onTelemetry: ((telemetry: FpsTelemetry) => void) | null = null

  /** Called when pointer lock state changes. */
  onPointerLockChange: ((locked: boolean) => void) | null = null

  /** Called each frame with damage flash opacity (0 = clear, >0 = red vignette). */
  onDamageFlash: ((opacity: number) => void) | null = null

  /** Called on contact damage with screen-space angle (radians, 0 = top). */
  onDamageDirection: ((angle: number) => void) | null = null

  private damageFlashTimer = 0

  /**
   * Single owner for all FPS player-movement audio (breathing, floating,
   * contact-damage loop, ranged-damage composite). Shared with
   * {@link LevelViewController} so feedback in the sandbox matches the
   * full game.
   */
  private readonly fpsAudio = new FpsAudioDirector()

  async init(container: HTMLElement): Promise<void> {
    const config = buildFpsPlayerConfig()

    // Input
    this.inputManager = new InputManager(FPS_BINDINGS)
    this.tickHandler = new TickHandler()
    this.tickHandler.register(this.inputManager, TICK_PRIORITY_INPUT)

    // Scene
    this.sceneManager = new SceneManager()
    this.sceneManager.mount(container)

    // Terrain — ?flat=true for a flat testing surface
    const flat = new URLSearchParams(window.location.search).has('flat')
    const heightmap = flat
      ? new Heightmap(TERRAIN_RESOLUTION, GRID_SIZE)
      : generateTerrain(TEST_SURFACE, {
          seed: TERRAIN_SEED,
          resolution: TERRAIN_RESOLUTION,
          worldSize: GRID_SIZE,
        })
    this.heightmap = heightmap
    this.terrainGrid = new TerrainGrid(heightmap)
    this.sceneManager.addToScene(this.terrainGrid.mesh)

    // Lighting
    const ambient = new AmbientLight(0xffffff, AMBIENT_LIGHT_INTENSITY)
    const sun = new DirectionalLight(0xffffee, DIR_LIGHT_INTENSITY)
    sun.position.set(100, 200, 50)
    this.sceneManager.addToScene(ambient)
    this.sceneManager.addToScene(sun)

    // FPS Camera
    this.fpsCamera = new FpsCamera(config.camera)

    // Player
    this.playerController = new FpsPlayerController(
      this.inputManager,
      this.fpsCamera,
      config,
      heightmap,
    )
    this.playerController.group.position.set(0, SPAWN_HEIGHT, 0)
    this.sceneManager.addToScene(this.playerController.group)
    this.fpsCamera.setTarget(this.playerController.group)

    // Use FpsCamera's perspective camera for rendering
    this.sceneManager.setActiveCamera(this.fpsCamera.camera)

    // Multi-tool — FPS weapon fixture on camera
    this.multiTool = new MultiToolController()
    await this.multiTool.load(this.fpsCamera.camera, this.sceneManager.scene)

    // Multi-tool state
    this.multiToolState = new MultiToolState(buildMultiToolConfig())

    this.enemyTiltCache = new EnemyTiltCache(heightmap)

    this.projectileSystem = new ProjectileSystem(this.sceneManager.scene, heightmap)
    this.projectileSystem.setDamageMultiplier(getCurrentUpgradeValue('multitoolDamage'))
    this.impactEmitter = new ParticleEmitter({
      poolSize: 64,
      color: new Color(0xffaa44),
      size: 3,
      lifetime: 0.4,
      spread: 15,
      opacity: 0.8,
    })
    this.sceneManager.addToScene(this.impactEmitter.points)
    this.projectileSystem.onImpact = (pos) => {
      for (let i = 0; i < 8; i++) {
        this._impactVel.copy(this._impactUp).multiplyScalar(5)
        this.impactEmitter!.emit(pos, this._impactVel)
      }
    }
    this.multiTool.setProjectileSystem(this.projectileSystem)

    // Target dummies — ?targets=true spawns 10 around the player
    const params = new URLSearchParams(window.location.search)
    if (params.has('targets')) {
      const count = 10
      const radius = 30
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2
        const x = Math.cos(angle) * radius
        const z = Math.sin(angle) * radius
        const y = heightmap.heightAt(x, z)
        const dummy = new TargetDummyController(new Vector3(x, y, z))
        dummy.group.lookAt(0, y, 0) // face center
        this.targetDummies.push(dummy)
        this.sceneManager.addToScene(dummy.group)
        this.projectileSystem.addEnemy(dummy.enemy)
        this.tickHandler.register(dummy, TICK_PRIORITY_ANIMATION)
      }
    }

    // Debug props — ?hostages[=n] and/or ?viruses[=n] (default counts when flag only)
    const hostageSpawnCount = parseDebugPropCount(
      params,
      'hostages',
      DEBUG_HOSTAGE_SPAWN_DEFAULT,
    )
    const virusSpawnCount = parseDebugPropCount(params, 'viruses', DEBUG_VIRUS_SPAWN_DEFAULT)
    const wantHostages = hostageSpawnCount !== undefined && hostageSpawnCount > 0
    const wantViruses = virusSpawnCount !== undefined && virusSpawnCount > 0
    if (wantViruses) {
      await VirusModel.preload()
    }
    if (wantHostages && hostageSpawnCount !== undefined) {
      this.fpsHostageController = new FpsHostageController(
        this.sceneManager.scene,
        heightmap,
      )
      this.fpsHostageController.setProjectileSystem(this.projectileSystem)
      await this.fpsHostageController.spawnRing(hostageSpawnCount, DEBUG_HOSTAGE_SPAWN_RADIUS)
    }
    if (wantViruses && virusSpawnCount !== undefined) {
      for (let i = 0; i < virusSpawnCount; i++) {
        const angle = (i / virusSpawnCount) * Math.PI * 2 + Math.PI / virusSpawnCount
        const x = Math.cos(angle) * DEBUG_VIRUS_SPAWN_RADIUS
        const z = Math.sin(angle) * DEBUG_VIRUS_SPAWN_RADIUS
        const y = heightmap.heightAt(x, z)
        const virus = await VirusModel.create()
        virus.placeAt(x, y, z)
        virus.setYaw(Math.atan2(-x, -z))
        this.debugVirusModels.push(virus)
        this.sceneManager.addToScene(virus.group)
      }
    }

    // Enemy hit → flash + particles
    this.projectileSystem.onEnemyHit = (enemy, pos) => {
      const dummy = this.targetDummies.find((d) => d.enemy === enemy)
      dummy?.flash()
      for (let i = 0; i < 12; i++) {
        this._impactVel.copy(this._impactUp).multiplyScalar(8)
        this.impactEmitter!.emit(pos, this._impactVel)
      }
    }

    this.projectileSystem.onHostageBolt = (hostage, pos, effect) => {
      if (effect === 'heal') {
        this.fpsHostageController?.notifyHealed(hostage)
        for (let i = 0; i < 10; i++) {
          this._impactVel.copy(this._impactUp).multiplyScalar(6)
          this.impactEmitter!.emit(pos, this._impactVel)
        }
      } else {
        this.fpsHostageController?.notifyDamaged(hostage)
        for (let i = 0; i < 8; i++) {
          this._impactVel.copy(this._impactUp).multiplyScalar(7)
          this.impactEmitter!.emit(pos, this._impactVel)
        }
      }
    }

    // Enemies — ?enemies=true spawns bacteriophages around the player
    if (params.has('enemies')) {
      this.enemyDirector = new EnemyDirector()
      this.enemyDirector.setHostageTargets(
        this.fpsHostageController?.getHostageEntitiesForDirector() ?? [],
      )

      this.enemyDirector.onHostageContactDamage = (_handle, hostage, _damage) => {
        this.fpsHostageController?.notifyDamaged(hostage)
      }
      this.enemyDirector.onContactDamage = (handle, damage) => {
        this.playerController?.takeDamage(damage)
        this.damageFlashTimer = DAMAGE_FLASH_DURATION
        this.fpsAudio.notifyContactDamage()

        const pp = this.playerController!.group.position
        const ep = handle.enemy.position

        const knockback = computeKnockbackAwayFromSource(
          pp.x,
          pp.z,
          ep.x,
          ep.z,
          CONTACT_KNOCKBACK,
        )
        if (knockback) {
          this.playerController!.applyLateralImpulse(
            knockback.x,
            knockback.z,
          )
        }

        // Camera flinch — random pitch/yaw jolt
        if (this.fpsCamera) {
          this.fpsCamera.applyMouseDelta(
            (Math.random() - 0.5) * DAMAGE_FLINCH_STRENGTH,
            -Math.random() * DAMAGE_FLINCH_STRENGTH,
          )
          // Directional indicator
          const relAngle = computeRelativeDamageAngle(pp.x, pp.z, ep.x, ep.z, this.fpsCamera.yaw)
          this.onDamageDirection?.(relAngle)
        }
      }
      this.tickHandler.register(this.enemyDirector, TICK_PRIORITY_PHYSICS + 4)

      // Enemy projectile system
      this.enemyProjectileSystem = new EnemyProjectileSystem()
      this.tickHandler.register(this.enemyProjectileSystem, TICK_PRIORITY_PHYSICS + 5)

      this.fpsHostageController?.setEnemyProjectileSystem(this.enemyProjectileSystem)

      this.enemyProjectileSystem.onHostageHit = (hostage, _damage, _sourceX, _sourceZ) => {
        this.fpsHostageController?.notifyDamaged(hostage)
        this._impactPos.set(hostage.position.x, hostage.hitCenterWorldY, hostage.position.z)
        for (let i = 0; i < 8; i++) {
          this._impactVel.copy(this._impactUp).multiplyScalar(5)
          this.impactEmitter!.emit(this._impactPos, this._impactVel)
        }
      }

      this.enemyProjectileSystem.onPlayerHit = (damage, sourceX, sourceZ) => {
        this.playerController?.takeDamage(damage)
        this.damageFlashTimer = DAMAGE_FLASH_DURATION
        this.fpsAudio.notifyProjectileDamage()
        const pp = this.playerController!.group.position
        const knockback = computeKnockbackAwayFromSource(
          pp.x,
          pp.z,
          sourceX,
          sourceZ,
          CONTACT_KNOCKBACK,
        )
        if (knockback) {
          this.playerController!.applyLateralImpulse(
            knockback.x,
            knockback.z,
          )
        }
        // Directional indicator
        if (this.fpsCamera) {
          this.fpsCamera.applyMouseDelta(
            (Math.random() - 0.5) * DAMAGE_FLINCH_STRENGTH,
            -Math.random() * DAMAGE_FLINCH_STRENGTH,
          )
          const relAngle = computeRelativeDamageAngle(
            pp.x,
            pp.z,
            sourceX,
            sourceZ,
            this.fpsCamera.yaw,
          )
          this.onDamageDirection?.(relAngle)
        }
      }

      this.enemyProjectileMeshPool = new EnemyProjectileMeshPool(this.sceneManager.scene)
      this.enemyProjectileMeshPool.prewarm()
      this.enemyProjectileSystem.onProjectileMove = this.enemyProjectileMeshPool.acquire
      this.enemyProjectileSystem.onProjectileRemoved = this.enemyProjectileMeshPool.release

      for (let i = 0; i < ENEMY_SPAWN_COUNT; i++) {
        const angle = (i / ENEMY_SPAWN_COUNT) * Math.PI * 2
        const radius = ENEMY_MIN_SPAWN_DISTANCE + Math.random() * (ENEMY_SPAWN_RADIUS - ENEMY_MIN_SPAWN_DISTANCE)
        const x = Math.cos(angle) * radius
        const z = Math.sin(angle) * radius
        const y = heightmap.heightAt(x, z)

        const handle = this.enemyDirector.spawn('bacteriophage', x, y, z)
        const controller = new BacteriophageController(handle.enemy)
        controller.group.position.set(x, y, z)
        this.sceneManager.addToScene(controller.group)
        this.projectileSystem!.addEnemy(handle.enemy)
        this.tickHandler.register(controller, TICK_PRIORITY_ANIMATION)
        this.enemyControllers.set(handle.id, controller)
      }

      // Enemy hit → flash + particles (extend existing onEnemyHit)
      const existingOnEnemyHit = this.projectileSystem!.onEnemyHit
      this.projectileSystem!.onEnemyHit = (enemy, pos) => {
        existingOnEnemyHit?.call(this.projectileSystem, enemy, pos)
        // Find matching controller and flash it
        for (const [, ctrl] of this.enemyControllers) {
          if (ctrl.enemy === enemy) {
            ctrl.flash()
            if (!enemy.alive) {
              // Stop further projectile hits — death anim handles cleanup
              this.projectileSystem!.removeEnemy(enemy)
            }
            break
          }
        }
        // Check spire controllers
        for (const [, ctrl] of this.spireControllers) {
          if (ctrl.enemy === enemy) {
            ctrl.flash()
            if (!enemy.alive) {
              this.projectileSystem!.removeEnemy(enemy)
            }
            break
          }
        }
        for (const [, ctrl] of this.chimeraControllers) {
          if (ctrl.enemy === enemy) {
            ctrl.flash()
            if (!enemy.alive) {
              this.projectileSystem!.removeEnemy(enemy)
            }
            break
          }
        }
      }

      // Spawn spires
      for (let i = 0; i < SPIRE_SPAWN_COUNT; i++) {
        const angle = (i / SPIRE_SPAWN_COUNT) * Math.PI * 2 + Math.PI / 4
        const radius = SPIRE_MIN_SPAWN_DISTANCE + Math.random() * (SPIRE_SPAWN_RADIUS - SPIRE_MIN_SPAWN_DISTANCE)
        const x = Math.cos(angle) * radius
        const z = Math.sin(angle) * radius
        const groundY = heightmap.heightAt(x, z)

        const handle = this.enemyDirector.spawn('spire', x, groundY, z)
        const controller = new SpireController(handle.enemy)
        controller.group.position.set(x, groundY + handle.config.floatHeight, z)
        this.sceneManager.addToScene(controller.group)
        this.projectileSystem!.addEnemy(handle.enemy)
        this.tickHandler.register(controller, TICK_PRIORITY_ANIMATION)
        this.spireControllers.set(handle.id, controller)
      }

      // Spawn chimera walkers
      for (let i = 0; i < CHIMERA_SPAWN_COUNT; i++) {
        const angle = (i / CHIMERA_SPAWN_COUNT) * Math.PI * 2 + Math.PI / 6
        const radius = CHIMERA_MIN_SPAWN_DISTANCE + Math.random() * (CHIMERA_SPAWN_RADIUS - CHIMERA_MIN_SPAWN_DISTANCE)
        const x = Math.cos(angle) * radius
        const z = Math.sin(angle) * radius
        const groundY = heightmap.heightAt(x, z)

        const handle = this.enemyDirector.spawn('chimera', x, groundY, z)
        const controller = new ChimeraWalkerController(handle.enemy)
        controller.group.position.set(x, groundY, z)
        this.sceneManager.addToScene(controller.group)
        this.projectileSystem!.addEnemy(handle.enemy)
        this.tickHandler.register(controller, TICK_PRIORITY_ANIMATION)
        this.chimeraControllers.set(handle.id, controller)
      }
    }

    // Death handler — reset scene
    this.playerController.onDeath = () => {
      window.location.reload()
    }

    // Register tick order
    this.tickHandler.register(this.playerController, TICK_PRIORITY_PHYSICS)
    if (this.fpsHostageController) {
      this.tickHandler.register(this.fpsHostageController, TICK_PRIORITY_PHYSICS + 3)
    }
    this.tickHandler.register(this.multiToolState, TICK_PRIORITY_PHYSICS + 1)
    this.tickHandler.register(this.projectileSystem, TICK_PRIORITY_PHYSICS + 2)
    this.tickHandler.register(this.impactEmitter, TICK_PRIORITY_PHYSICS + 3)
    this.tickHandler.register(this.fpsCamera, TICK_PRIORITY_RENDER - 2)
    this.tickHandler.register(this.multiTool, TICK_PRIORITY_RENDER - 2)
    this.tickHandler.register(this, TICK_PRIORITY_RENDER - 1)
    this.tickHandler.register(this.sceneManager, TICK_PRIORITY_RENDER)

    // Pointer lock
    this.setupPointerLock()

    // --- Dev tools ---
    DevConsole.register('FpsView', {
      takeDamage: (amount = 10) => this.playerController?.takeDamage(amount),
      heal: () => this.playerController?.replenish(),
      kill: () => this.playerController?.takeDamage(999),
    })

    // Hand FPS player audio (breathing, floating, contact-damage loop,
    // ranged-damage composite) to the shared director. This is the same
    // path LevelViewController uses, so the sandbox now hears the full
    // bed of cues instead of just the contact loop + per-hit thud.
    this.fpsAudio.start()

    // Start
    this.gameLoop = new GameLoop(this.tickHandler)
    this.gameLoop.start()
  }

  tick(_dt: number): void {
    // --- Tool keybinds ---
    if (this.inputManager && this.multiToolState) {
      if (this.inputManager.wasActionPressed('toolDrill')) this.multiToolState.setMode('drill')
      if (this.inputManager.wasActionPressed('toolWeapon')) this.multiToolState.setMode('weapon')
      if (this.inputManager.wasActionPressed('toolHeal')) this.multiToolState.setMode('heal')

      // Feed mouse state + speed to tool
      this.multiToolState.setAiming(this.pointerLock.isRightMouseDown)
      this.multiToolState.setInput(
        this.pointerLock.isLeftMouseDown,
        this.pointerLock.consumeLeftMouseJustPressed(),
      )
      this.multiToolState.setSpeed(this.playerController?.speed ?? 0)
    }

    // --- Sync tool visuals ---
    if (this.multiToolState && this.multiTool) {
      this.multiTool.setMode(this.multiToolState.modeConfig.color, this.multiToolState.mode)
      this.multiTool.setAiming(this.multiToolState.aiming)
      this.multiTool.setRtgLevel(this.multiToolState.rtgLevel / this.multiToolState.rtgCapacity)
      this.multiTool.setModeChargeLevel(this.multiToolState.modeCharge / this.multiToolState.modeChargeCapacity)
      this.playerController?.setAiming(this.multiToolState.aiming)
      if (this.multiToolState.isFiring) {
        this.multiTool.fire()
      }
    }

    // --- ADS camera zoom ---
    if (this.multiToolState && this.fpsCamera) {
      const ads = this.multiToolState.adsConfig
      this.fpsCamera.setAiming(
        this.multiToolState.aiming,
        ads.fovMultiplier,
        ads.zoomSpeed,
      )
    }

    // Feed player velocity to camera and multi-tool for bob/wobble
    if (this.playerController && this.fpsCamera) {
      const pos = this.playerController.group.position
      const slope = this.heightmap?.slopeAt(pos.x, pos.z) ?? 0
      this.fpsCamera.setVelocity(
        this.playerController.speed,
        this.playerController.body.velocityY,
        slope,
      )
      this.multiTool?.setState(
        this.playerController.speed,
        this.playerController.isSprinting,
        this.playerController.grounded,
      )
    }

    // --- Enemy sync ---
    if (this.enemyDirector && this.playerController) {
      const pp = this.playerController.group.position
      this.enemyDirector.setPlayerPosition(pp.x, pp.y, pp.z)

      // v5: apply distance-based geometry LOD + N-nearest light cap once
      // per frame, before any controller's tick observes `lodSkipGeometry`.
      this.enemyLodApplier.begin(pp.x, pp.z)
      for (const handle of this.enemyDirector.enemies) {
        this.enemyLodApplier.consider(handle, this.enemyControllers.get(handle.id))
        this.enemyLodApplier.consider(handle, this.chimeraControllers.get(handle.id))
        this.enemyLodApplier.consider(handle, this.spireControllers.get(handle.id))
      }
      this.enemyLodApplier.commit()

      for (const handle of this.enemyDirector.enemies) {
        const ctrl = this.enemyControllers.get(handle.id)
        if (!ctrl) continue

        // Clean up controllers that finished their death animation
        if (ctrl.deathComplete) {
          this.tickHandler!.unregister(ctrl)
          this.enemyControllers.delete(handle.id)
          this.enemyDirector!.despawn(handle)
          this.enemyTiltCache?.release(handle.id)
          continue
        }

        // Dead enemies keep ticking (death anim) but don't sync position
        if (!handle.enemy.alive) continue

        // Sync visual state from behavior
        ctrl.isMoving = handle.lastOutput.isMoving
        ctrl.isAgitated = handle.lastOutput.isAgitated

        // Sync position from domain → visual
        ctrl.group.position.x = handle.enemy.position.x
        ctrl.group.position.z = handle.enemy.position.z

        // Clamp Y to terrain — hit sphere centered at body, not ground
        const groundY = this.heightmap?.heightAt(
          handle.enemy.position.x,
          handle.enemy.position.z,
        ) ?? 0
        ctrl.group.position.y = groundY
        handle.enemy.position.y = groundY + PHAGE_HIT_CENTER_Y

        // Face movement direction
        if (handle.lastOutput.isMoving) {
          const dir = handle.lastOutput.moveDir
          ctrl.group.rotation.y = Math.atan2(dir.x, dir.z)
        }

        // Tilt body to match terrain slope (throttled per-enemy resampling)
        this.enemyTiltCache?.applyTilt(
          handle.id,
          handle.enemy.position.x,
          handle.enemy.position.z,
          ctrl.group,
        )
      }

      // Spire sync
      for (const handle of this.enemyDirector.enemies) {
        const ctrl = this.spireControllers.get(handle.id)
        if (!ctrl) continue

        // Clean up dead spires
        if (ctrl.deathComplete) {
          this.tickHandler!.unregister(ctrl)
          this.spireControllers.delete(handle.id)
          this.enemyDirector!.despawn(handle)
          continue
        }

        if (!handle.enemy.alive) continue

        ctrl.isMoving = handle.lastOutput.isMoving
        ctrl.isAgitated = handle.lastOutput.isAgitated

        // Set target position — controller drifts toward it smoothly
        const groundY = this.heightmap?.heightAt(
          handle.enemy.position.x,
          handle.enemy.position.z,
        ) ?? 0
        ctrl.targetPosition.set(
          handle.enemy.position.x,
          groundY + handle.config.floatHeight,
          handle.enemy.position.z,
        )
        handle.enemy.position.y = ctrl.group.position.y + SPIRE_HIT_CENTER_Y

        const aimX = handle.lastOutput.aimTargetX
        const aimY = handle.lastOutput.aimTargetY
        const aimZ = handle.lastOutput.aimTargetZ

        // Face aim target (player or hostage)
        if (handle.lastOutput.isChasing) {
          const dx = aimX - handle.enemy.position.x
          const dz = aimZ - handle.enemy.position.z
          ctrl.group.rotation.y = Math.atan2(dx, dz)
        }

        // Fire projectile
        if (handle.lastOutput.wantsToFire && this.enemyProjectileSystem) {
          const ep = handle.enemy.position
          const dx = aimX - ep.x
          const dy = aimY - ep.y
          const dz = aimZ - ep.z
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (dist > 0.01) {
            this.enemyProjectileSystem.spawn(
              ep.x, ep.y, ep.z,
              dx / dist, dy / dist, dz / dist,
              handle.config.projectileSpeed,
              handle.config.projectileDamage,
            )
            ctrl.fireFlash(aimX, aimZ)
          }
        }
      }

      // Feed player position to enemy projectile system
      this.enemyProjectileSystem?.setPlayerPosition(pp.x, pp.y, pp.z)

      // Chimera sync
      for (const handle of this.enemyDirector.enemies) {
        const ctrl = this.chimeraControllers.get(handle.id)
        if (!ctrl) continue

        if (ctrl.deathComplete) {
          this.tickHandler!.unregister(ctrl)
          this.chimeraControllers.delete(handle.id)
          this.enemyDirector!.despawn(handle)
          this.enemyTiltCache?.release(handle.id)
          continue
        }

        if (!handle.enemy.alive) continue

        ctrl.isMoving = handle.lastOutput.isMoving
        ctrl.isAgitated = handle.lastOutput.isAgitated

        ctrl.group.position.x = handle.enemy.position.x
        ctrl.group.position.z = handle.enemy.position.z

        const groundY = this.heightmap?.heightAt(
          handle.enemy.position.x,
          handle.enemy.position.z,
        ) ?? 0
        ctrl.group.position.y = groundY
        handle.enemy.position.y = groundY + CHIMERA_HIT_CENTER_Y

        const aimX = handle.lastOutput.aimTargetX
        const aimY = handle.lastOutput.aimTargetY
        const aimZ = handle.lastOutput.aimTargetZ

        if (handle.lastOutput.isChasing) {
          const dx = aimX - handle.enemy.position.x
          const dz = aimZ - handle.enemy.position.z
          ctrl.group.rotation.y = Math.atan2(dx, dz)
        } else if (handle.lastOutput.isMoving) {
          const dir = handle.lastOutput.moveDir
          ctrl.group.rotation.y = Math.atan2(dir.x, dir.z)
        }

        this.enemyTiltCache?.applyTilt(
          handle.id,
          handle.enemy.position.x,
          handle.enemy.position.z,
          ctrl.group,
        )

        if (handle.lastOutput.wantsToFire && this.enemyProjectileSystem) {
          ctrl.group.updateMatrixWorld(true)
          const muzzle = this.chimeraLaserOriginScratch
          ctrl.getEyeLaserMuzzle(muzzle)
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
            ctrl.pulseEyeLaser()
          }
        }
      }
    }

    // --- Damage flash decay ---
    const flash = stepDamageFlash(this.damageFlashTimer, _dt, DAMAGE_FLASH_DURATION)
    this.damageFlashTimer = flash.timer
    this.onDamageFlash?.(flash.opacity)

    // FPS player audio (footsteps, breathing crossfade, floating onset,
    // contact-damage loop decay) is owned by the director. Reading
    // `isSprinting` from the controller honours the sprint lockout so the
    // run-breath loop doesn't chatter while the player holds Shift through
    // stamina exhaustion.
    if (this.playerController) {
      this.fpsAudio.update(_dt, {
        grounded: this.playerController.grounded,
        sprinting: this.playerController.isSprinting,
        speed: this.playerController.speed,
        hovering: this.playerController.isHovering,
        o2Level: this.playerController.o2Level,
        o2Capacity: this.playerController.o2Capacity,
      })
    }

    if (this.playerController && this.onTelemetry) {
      const ts = this.playerController.thrusterSystem
      this.onTelemetry({
        hp: this.playerController.hp,
        maxHp: this.playerController.maxHp,
        o2Level: this.playerController.o2Level,
        o2Capacity: this.playerController.o2Capacity,
        sprintCharge: ts.getState('sprint').charge,
        sprintCapacity: ts.getState('sprint').capacity,
        speed: this.playerController.speed,
        grounded: this.playerController.grounded,
        activeMode: this.multiToolState?.mode ?? 'drill',
        aiming: this.multiToolState?.aiming ?? false,
        isFiring: this.multiToolState?.isFiring ?? false,
        rtgLevel: this.multiToolState?.rtgLevel ?? 0,
        rtgCapacity: this.multiToolState?.rtgCapacity ?? 1,
        modeCharge: this.multiToolState?.modeCharge ?? 0,
        modeCapacity: this.multiToolState?.modeChargeCapacity ?? 1,
        headingRad: this.fpsCamera?.camera.rotation.y ?? 0,
        objectives: [],
      })
    }
  }

  /** Request pointer lock on the renderer canvas. */
  requestPointerLock(): void {
    this.pointerLock.requestLock()
  }

  private setupPointerLock(): void {
    const canvas = this.sceneManager!.renderer.domElement
    this.pointerLock.attach(canvas, {
      onMouseDelta: (movementX, movementY) => {
        this.fpsCamera?.applyMouseDelta(movementX, movementY)
      },
      onLockChange: (locked) => {
        this.onPointerLockChange?.(locked)
      },
    })
    this.pointerLock.requestLock()
  }

  dispose(): void {
    DevConsole.unregister('FpsView')
    this.gameLoop?.stop()
    for (const dummy of this.targetDummies) dummy.dispose()
    this.fpsHostageController?.dispose()
    this.fpsHostageController = null
    for (const m of this.debugVirusModels) m.dispose()
    this.debugVirusModels.length = 0
    for (const ctrl of this.spireControllers.values()) ctrl.dispose()
    this.spireControllers.clear()
    for (const ctrl of this.chimeraControllers.values()) ctrl.dispose()
    this.chimeraControllers.clear()
    this.enemyProjectileMeshPool?.disposeAll()
    this.enemyProjectileMeshPool = null
    this.enemyProjectileSystem?.dispose()
    for (const ctrl of this.enemyControllers.values()) ctrl.dispose()
    this.enemyControllers.clear()
    this.enemyDirector?.despawnAll()
    this.enemyTiltCache?.clear()
    this.enemyTiltCache = null
    this.projectileSystem?.dispose()
    this.impactEmitter?.dispose()
    this.multiTool?.dispose()
    this.playerController?.dispose()
    this.fpsCamera?.dispose()
    this.terrainGrid?.dispose()
    this.pointerLock.releaseLock()
    this.pointerLock.detach()
    this.sceneManager?.dispose()
    this.inputManager?.dispose()
    this.fpsAudio.dispose()
  }
}
