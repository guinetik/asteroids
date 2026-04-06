/**
 * Bridges Vue lifecycle to the FPS demo scene.
 * Terrain grid + first-person player with O2-fueled movement.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-fps-movement-design.md
 */
import type { Tickable } from '@/lib/Tickable'
import type { FpsTelemetry } from '@/components/FpsHud.vue'
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
import type { FpsPlayerConfig } from '@/three/FpsPlayerController'
import { TerrainGrid } from '@/three/TerrainGrid'
import { generateTerrain } from '@/lib/terrain/terrainGenerator'
import type { SurfaceFeatures } from '@/lib/asteroids/types'
import { AmbientLight, DirectionalLight, Color, Vector3 } from 'three'
import { Heightmap } from '@/lib/terrain/heightmap'
import { MultiToolController } from '@/three/MultiToolController'
import { MultiToolState } from '@/lib/fps/multiToolState'
import type { MultiToolConfig } from '@/lib/fps/multiToolState'
import { ProjectileSystem } from '@/lib/fps/projectileSystem'
import { ParticleEmitter } from '@/three/ParticleEmitter'
import { TargetDummyController } from '@/three/TargetDummyController'
import playerConfigJson from '@/data/fps/player-config.json'
import multiToolConfigJson from '@/data/fps/multitool-config.json'
import { EnemyDirector } from '@/lib/fps/enemyDirector'
import { BacteriophageController, PHAGE_HIT_CENTER_Y } from '@/three/BacteriophageController'
import { EnemyProjectileSystem } from '@/lib/fps/enemyProjectileSystem'
import { SpireController, SPIRE_HIT_CENTER_Y } from '@/three/SpireController'
import { EnemyProjectileMesh } from '@/three/EnemyProjectileMesh'

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
  private readonly enemyProjectileMeshes = new Map<number, EnemyProjectileMesh>()
  private leftMouseDown = false
  private leftMouseJustPressed = false
  private rightMouseDown = false

  /** Called each frame with player telemetry for HUD display. */
  onTelemetry: ((telemetry: FpsTelemetry) => void) | null = null

  /** Called when pointer lock state changes. */
  onPointerLockChange: ((locked: boolean) => void) | null = null

  /** Called each frame with damage flash opacity (0 = clear, >0 = red vignette). */
  onDamageFlash: ((opacity: number) => void) | null = null

  /** Called on contact damage with screen-space angle (radians, 0 = top). */
  onDamageDirection: ((angle: number) => void) | null = null

  private damageFlashTimer = 0

  async init(container: HTMLElement): Promise<void> {
    const config = playerConfigJson as FpsPlayerConfig

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
    this.multiToolState = new MultiToolState(multiToolConfigJson as MultiToolConfig)

    // Projectile system + impact particles
    this.projectileSystem = new ProjectileSystem(this.sceneManager.scene, heightmap)
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
      const up = new Vector3(0, 1, 0)
      for (let i = 0; i < 8; i++) {
        this.impactEmitter!.emit(pos, up.clone().multiplyScalar(5))
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

    // Enemy hit → flash + particles
    this.projectileSystem.onEnemyHit = (enemy, pos) => {
      const dummy = this.targetDummies.find((d) => d.enemy === enemy)
      dummy?.flash()
      const up = new Vector3(0, 1, 0)
      for (let i = 0; i < 12; i++) {
        this.impactEmitter!.emit(pos, up.clone().multiplyScalar(8))
      }
    }

    // Enemies — ?enemies=true spawns bacteriophages around the player
    if (params.has('enemies')) {
      this.enemyDirector = new EnemyDirector()
      this.enemyDirector.onContactDamage = (handle, damage) => {
        this.playerController?.takeDamage(damage)
        this.damageFlashTimer = DAMAGE_FLASH_DURATION

        const pp = this.playerController!.group.position
        const ep = handle.enemy.position

        // Knockback — push player away from enemy
        const dx = pp.x - ep.x
        const dz = pp.z - ep.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist > 0.01) {
          this.playerController!.applyLateralImpulse(
            (dx / dist) * CONTACT_KNOCKBACK,
            (dz / dist) * CONTACT_KNOCKBACK,
          )
        }

        // Camera flinch — random pitch/yaw jolt
        if (this.fpsCamera) {
          this.fpsCamera.applyMouseDelta(
            (Math.random() - 0.5) * DAMAGE_FLINCH_STRENGTH,
            -Math.random() * DAMAGE_FLINCH_STRENGTH,
          )
          // Directional indicator
          const worldAngle = Math.atan2(ep.x - pp.x, ep.z - pp.z)
          const relAngle = worldAngle - this.fpsCamera.yaw
          this.onDamageDirection?.(relAngle)
        }
      }
      this.tickHandler.register(this.enemyDirector, TICK_PRIORITY_PHYSICS + 4)

      // Enemy projectile system
      this.enemyProjectileSystem = new EnemyProjectileSystem()
      this.tickHandler.register(this.enemyProjectileSystem, TICK_PRIORITY_PHYSICS + 5)

      this.enemyProjectileSystem.onPlayerHit = (damage, sourceX, sourceZ) => {
        this.playerController?.takeDamage(damage)
        this.damageFlashTimer = DAMAGE_FLASH_DURATION
        const pp = this.playerController!.group.position
        // Knockback away from projectile source
        const dx = pp.x - sourceX
        const dz = pp.z - sourceZ
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist > 0.01) {
          this.playerController!.applyLateralImpulse(
            (dx / dist) * CONTACT_KNOCKBACK,
            (dz / dist) * CONTACT_KNOCKBACK,
          )
        }
        // Directional indicator
        if (this.fpsCamera) {
          this.fpsCamera.applyMouseDelta(
            (Math.random() - 0.5) * DAMAGE_FLINCH_STRENGTH,
            -Math.random() * DAMAGE_FLINCH_STRENGTH,
          )
          const worldAngle = Math.atan2(sourceX - pp.x, sourceZ - pp.z)
          const relAngle = worldAngle - this.fpsCamera.yaw
          this.onDamageDirection?.(relAngle)
        }
      }

      // Visual mesh lifecycle for enemy projectiles
      this.enemyProjectileSystem.onProjectileMove = (id, x, y, z) => {
        let mesh = this.enemyProjectileMeshes.get(id)
        if (!mesh) {
          mesh = new EnemyProjectileMesh()
          this.sceneManager!.addToScene(mesh.group)
          this.enemyProjectileMeshes.set(id, mesh)
        }
        mesh.setPosition(x, y, z)
      }

      this.enemyProjectileSystem.onProjectileRemoved = (id) => {
        const mesh = this.enemyProjectileMeshes.get(id)
        if (mesh) {
          mesh.dispose()
          this.enemyProjectileMeshes.delete(id)
        }
      }

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
    }

    // Death handler — reset scene
    this.playerController.onDeath = () => {
      window.location.reload()
    }

    // Register tick order
    this.tickHandler.register(this.playerController, TICK_PRIORITY_PHYSICS)
    this.tickHandler.register(this.multiToolState, TICK_PRIORITY_PHYSICS + 1)
    this.tickHandler.register(this.projectileSystem, TICK_PRIORITY_PHYSICS + 2)
    this.tickHandler.register(this.impactEmitter, TICK_PRIORITY_PHYSICS + 3)
    this.tickHandler.register(this.fpsCamera, TICK_PRIORITY_RENDER - 2)
    this.tickHandler.register(this.multiTool, TICK_PRIORITY_RENDER - 2)
    this.tickHandler.register(this, TICK_PRIORITY_RENDER - 1)
    this.tickHandler.register(this.sceneManager, TICK_PRIORITY_RENDER)

    // Pointer lock
    this.setupPointerLock()

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
      this.multiToolState.setAiming(this.rightMouseDown)
      this.multiToolState.setInput(this.leftMouseDown, this.leftMouseJustPressed)
      this.multiToolState.setSpeed(this.playerController?.speed ?? 0)
      this.leftMouseJustPressed = false
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
        this.inputManager!.isActionActive('sprint'),
        this.playerController.grounded,
      )
    }

    // --- Enemy sync ---
    if (this.enemyDirector && this.playerController) {
      const pp = this.playerController.group.position
      this.enemyDirector.setPlayerPosition(pp.x, pp.y, pp.z)

      for (const handle of this.enemyDirector.enemies) {
        const ctrl = this.enemyControllers.get(handle.id)
        if (!ctrl) continue

        // Clean up controllers that finished their death animation
        if (ctrl.deathComplete) {
          this.tickHandler!.unregister(ctrl)
          this.enemyControllers.delete(handle.id)
          this.enemyDirector!.despawn(handle)
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

        // Face player
        if (handle.lastOutput.isChasing) {
          const dx = pp.x - handle.enemy.position.x
          const dz = pp.z - handle.enemy.position.z
          ctrl.group.rotation.y = Math.atan2(dx, dz)
        }

        // Fire projectile
        if (handle.lastOutput.wantsToFire && this.enemyProjectileSystem) {
          const ep = handle.enemy.position
          const dx = pp.x - ep.x
          const dy = pp.y - ep.y
          const dz = pp.z - ep.z
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (dist > 0.01) {
            this.enemyProjectileSystem.spawn(
              ep.x, ep.y, ep.z,
              dx / dist, dy / dist, dz / dist,
              handle.config.projectileSpeed,
              handle.config.projectileDamage,
            )
            ctrl.fireFlash(pp.x, pp.z)
          }
        }
      }

      // Feed player position to enemy projectile system
      this.enemyProjectileSystem?.setPlayerPosition(pp.x, pp.y, pp.z)
    }

    // --- Damage flash decay ---
    if (this.damageFlashTimer > 0) {
      this.damageFlashTimer -= _dt
      this.onDamageFlash?.(Math.max(0, this.damageFlashTimer / DAMAGE_FLASH_DURATION))
    } else {
      this.onDamageFlash?.(0)
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
      })
    }
  }

  /** Request pointer lock on the renderer canvas. */
  requestPointerLock(): void {
    this.sceneManager?.renderer.domElement.requestPointerLock()
  }

  private setupPointerLock(): void {
    const canvas = this.sceneManager!.renderer.domElement

    // Mouse move → camera look
    const onMouseMove = (e: MouseEvent): void => {
      if (document.pointerLockElement === canvas) {
        this.fpsCamera?.applyMouseDelta(e.movementX, e.movementY)
      }
    }
    document.addEventListener('mousemove', onMouseMove)

    // Mouse buttons → tool state
    const onMouseDown = (e: MouseEvent): void => {
      if (document.pointerLockElement !== canvas) return
      if (e.button === 0) {
        this.leftMouseDown = true
        this.leftMouseJustPressed = true
      }
      if (e.button === 2) this.rightMouseDown = true
    }
    const onMouseUp = (e: MouseEvent): void => {
      if (e.button === 0) this.leftMouseDown = false
      if (e.button === 2) this.rightMouseDown = false
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mouseup', onMouseUp)

    // Prevent context menu on right-click
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())

    // Pointer lock change — reset mouse state on unlock
    const onLockChange = (): void => {
      const locked = document.pointerLockElement === canvas
      if (!locked) {
        this.leftMouseDown = false
        this.leftMouseJustPressed = false
        this.rightMouseDown = false
      }
      this.onPointerLockChange?.(locked)
    }
    document.addEventListener('pointerlockchange', onLockChange)

    // Click to lock
    canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock()
      }
    })

    // Auto-lock
    canvas.requestPointerLock()
  }

  dispose(): void {
    this.gameLoop?.stop()
    for (const dummy of this.targetDummies) dummy.dispose()
    for (const ctrl of this.spireControllers.values()) ctrl.dispose()
    this.spireControllers.clear()
    for (const mesh of this.enemyProjectileMeshes.values()) mesh.dispose()
    this.enemyProjectileMeshes.clear()
    this.enemyProjectileSystem?.dispose()
    for (const ctrl of this.enemyControllers.values()) ctrl.dispose()
    this.enemyControllers.clear()
    this.enemyDirector?.despawnAll()
    this.projectileSystem?.dispose()
    this.impactEmitter?.dispose()
    this.multiTool?.dispose()
    this.playerController?.dispose()
    this.fpsCamera?.dispose()
    this.terrainGrid?.dispose()
    this.sceneManager?.dispose()
    this.inputManager?.dispose()
  }
}
