/**
 * Orchestrates the asteroid level scene — arrival cutscene,
 * lander flight, and EVA on-foot phases in a single Three.js scene.
 *
 * All systems are created once during init(). The state machine
 * enter/exit callbacks register/unregister tickables to swap modes.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
import type { Tickable } from '@/lib/Tickable'
import { GameLoop } from '@/lib/GameLoop'
import { TickHandler } from '@/lib/TickHandler'
import { InputManager } from '@/lib/InputManager'
import { LEVEL_BINDINGS } from '@/lib/defaultBindings'
import {
  TICK_PRIORITY_INPUT,
  TICK_PRIORITY_PHYSICS,
  TICK_PRIORITY_RENDER,
} from '@/lib/tickPriorities'
import { SceneManager } from '@/three/SceneManager'
import { VehicleCamera, LANDER_CAMERA_CONFIG } from '@/three/VehicleCamera'
import { LanderController } from '@/three/LanderController'
import { FpsPlayerController } from '@/three/FpsPlayerController'
import type { FpsPlayerConfig } from '@/three/FpsPlayerController'
import { FpsCamera } from '@/three/FpsCamera'
import { TerrainMesh } from '@/three/TerrainMesh'
import { generateTerrain, generateFlatZones } from '@/lib/terrain/terrainGenerator'
import type { SurfaceFeatures } from '@/lib/asteroids/types'
import { Heightmap } from '@/lib/terrain/heightmap'
import { MultiToolController } from '@/three/MultiToolController'
import { MultiToolState } from '@/lib/fps/multiToolState'
import type { MultiToolConfig } from '@/lib/fps/multiToolState'
import type { LanderTelemetry } from '@/components/LanderHud.vue'
import type { FpsTelemetry } from '@/components/FpsHud.vue'
import { ProjectileSystem } from '@/lib/fps/projectileSystem'
import { ParticleEmitter } from '@/three/ParticleEmitter'
import { createLevelStateMachine, LANDER_INTERACT_RANGE } from '@/lib/level/levelStateMachine'
import type { LevelState } from '@/lib/level/levelStateMachine'
import type { StateMachine } from '@/lib/stateMachine'
import {
  AmbientLight,
  DirectionalLight,
  PerspectiveCamera,
  Color,
  Vector3,
} from 'three'
import playerConfigJson from '@/data/fps/player-config.json'
import multiToolConfigJson from '@/data/fps/multitool-config.json'

// ── Scene constants ─────────────────────────────────────────────
const AMBIENT_LIGHT_INTENSITY = 0.6
const DIR_LIGHT_INTENSITY = 1.5
const GRID_SIZE = 6000
const TERRAIN_SEED = 42
const TERRAIN_RESOLUTION = 512
const FLAT_ZONE_COUNT = 3

const LANDER_SPAWN_HEIGHT = 300
const EVA_SPAWN_OFFSET_X = 8

/** Cinematic camera offset during arrival (wide angle, side view). */
const ARRIVAL_CAM_OFFSET = new Vector3(80, 30, 60)
const ARRIVAL_CAM_FOV = 50
const ARRIVAL_CAM_NEAR = 0.1
const ARRIVAL_CAM_FAR = 15000

/** Test surface features — will come from asteroid data later. */
const TEST_SURFACE: SurfaceFeatures = {
  craterDensity: 0.7,
  craterMaxScale: 0.3,
  boulderDensity: 0.5,
  ridgeFrequency: 0.3,
  roughness: 0.8,
  dustCoverage: 0.2,
}

/**
 * Asteroid level scene controller.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export class LevelViewController implements Tickable {
  // ── Core ─────────────────────────────────────────────────────
  private gameLoop: GameLoop | null = null
  private tickHandler: TickHandler | null = null
  private inputManager: InputManager | null = null
  private sceneManager: SceneManager | null = null
  private heightmap: Heightmap | null = null
  private terrainMesh: TerrainMesh | null = null
  private stateMachine: StateMachine<LevelState> | null = null

  // ── Lander ───────────────────────────────────────────────────
  private landerController: LanderController | null = null
  private vehicleCamera: VehicleCamera | null = null

  // ── EVA ──────────────────────────────────────────────────────
  private fpsCamera: FpsCamera | null = null
  private playerController: FpsPlayerController | null = null
  private multiTool: MultiToolController | null = null
  private multiToolState: MultiToolState | null = null
  private projectileSystem: ProjectileSystem | null = null
  private impactEmitter: ParticleEmitter | null = null

  // ── Arrival ──────────────────────────────────────────────────
  private arrivalCamera: PerspectiveCamera | null = null

  // ── Mouse state (EVA) ────────────────────────────────────────
  private leftMouseDown = false
  private leftMouseJustPressed = false
  private rightMouseDown = false

  // ── Pointer lock listeners (stored for cleanup) ───────────────
  private boundOnMouseMove: ((e: MouseEvent) => void) | null = null
  private boundOnMouseDown: ((e: MouseEvent) => void) | null = null
  private boundOnMouseUp: ((e: MouseEvent) => void) | null = null
  private boundOnLockChange: (() => void) | null = null

  /** Called when letterbox visibility should change. */
  onLetterbox: ((visible: boolean) => void) | null = null

  /** Called each frame with current state + grounded for HUD prompts. */
  onStateInfo: ((info: { state: string; grounded: boolean }) => void) | null = null

  /** Called each frame during lander state with lander telemetry. */
  onLanderTelemetry: ((telemetry: LanderTelemetry) => void) | null = null

  /** Called each frame during EVA state with FPS telemetry. */
  onFpsTelemetry: ((telemetry: FpsTelemetry) => void) | null = null

  /** Called each frame with death fade opacity (0 = clear, 1 = black). */
  onDeathFade: ((opacity: number) => void) | null = null

  /** Called when player dies — show death message. */
  onDeathMessage: ((visible: boolean) => void) | null = null

  /** Initialise all systems and start the game loop. */
  async init(container: HTMLElement): Promise<void> {
    const playerConfig = playerConfigJson as FpsPlayerConfig

    // ── Input + tick handler ────────────────────────────────────
    this.inputManager = new InputManager(LEVEL_BINDINGS)
    this.tickHandler = new TickHandler()
    this.tickHandler.register(this.inputManager, TICK_PRIORITY_INPUT)

    // ── Scene ───────────────────────────────────────────────────
    this.sceneManager = new SceneManager()
    this.sceneManager.mount(container)

    // ── Terrain ─────────────────────────────────────────────────
    const flat = new URLSearchParams(window.location.search).has('flat')
    const flatZones = generateFlatZones(FLAT_ZONE_COUNT, GRID_SIZE, TERRAIN_SEED)
    this.heightmap = flat
      ? new Heightmap(TERRAIN_RESOLUTION, GRID_SIZE)
      : generateTerrain(TEST_SURFACE, {
          seed: TERRAIN_SEED,
          resolution: TERRAIN_RESOLUTION,
          worldSize: GRID_SIZE,
          flatZones,
        })
    this.terrainMesh = new TerrainMesh(this.heightmap)
    this.sceneManager.addToScene(this.terrainMesh.mesh)

    // ── Lighting ────────────────────────────────────────────────
    const ambient = new AmbientLight(0xffffff, AMBIENT_LIGHT_INTENSITY)
    const sun = new DirectionalLight(0xffffee, DIR_LIGHT_INTENSITY)
    sun.position.set(100, 200, 50)
    this.sceneManager.addToScene(ambient)
    this.sceneManager.addToScene(sun)

    // ── Lander (created once, stays in scene) ───────────────────
    this.landerController = new LanderController(this.inputManager)
    this.landerController.setHeightmap(this.heightmap)
    await this.landerController.load()
    this.landerController.group.position.set(0, LANDER_SPAWN_HEIGHT, 0)
    this.sceneManager.addToScene(this.landerController.group)
    this.sceneManager.addToScene(this.landerController.flameEmitter.points)
    for (const emitter of this.landerController.rcsEmitters.values()) {
      this.sceneManager.addToScene(emitter.points)
    }

    // ── Vehicle camera (lander 3rd person) ──────────────────────
    this.vehicleCamera = new VehicleCamera(
      LANDER_CAMERA_CONFIG,
      this.sceneManager.renderer.domElement,
    )
    this.vehicleCamera.setTarget(this.landerController.group)

    // ── Arrival camera (cinematic) ──────────────────────────────
    const aspect = container.clientWidth / container.clientHeight
    this.arrivalCamera = new PerspectiveCamera(
      ARRIVAL_CAM_FOV, aspect, ARRIVAL_CAM_NEAR, ARRIVAL_CAM_FAR,
    )

    // ── FPS camera ──────────────────────────────────────────────
    this.fpsCamera = new FpsCamera(playerConfig.camera)

    // ── FPS player controller ───────────────────────────────────
    this.playerController = new FpsPlayerController(
      this.inputManager,
      this.fpsCamera,
      playerConfig,
      this.heightmap,
    )
    this.playerController.group.visible = false
    this.playerController.onDeath = () => {
      this.stateMachine?.trigger('die')
    }
    this.sceneManager.addToScene(this.playerController.group)

    // ── Multi-tool ──────────────────────────────────────────────
    this.multiTool = new MultiToolController()
    await this.multiTool.load(this.fpsCamera.camera, this.sceneManager.scene)
    this.multiTool.setVisible(false)
    this.multiToolState = new MultiToolState(multiToolConfigJson as MultiToolConfig)

    // ── Projectile system + particles ───────────────────────────
    this.projectileSystem = new ProjectileSystem(this.sceneManager.scene, this.heightmap)
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

    // ── State machine ───────────────────────────────────────────
    this.stateMachine = createLevelStateMachine({
      onStateChange: (current, previous) => this.onStateTransition(current, previous),
      isLanderGrounded: () => this.landerController?.body.grounded ?? false,
      isPlayerNearLander: () => this.isPlayerNearLander(),
    })

    // ── Always-active tickables ─────────────────────────────────
    this.tickHandler.register(this.stateMachine, TICK_PRIORITY_INPUT + 1)
    this.tickHandler.register(this, TICK_PRIORITY_RENDER - 1)
    this.tickHandler.register(this.sceneManager, TICK_PRIORITY_RENDER)

    // ── Arrival state starts with lander physics + cinematic cam ─
    this.enterArrival()

    // ── Dev tools ────────────────────────────────────────────────
    ;(window as unknown as Record<string, unknown>).AsteroidDev = {
      takeDamage: (amount = 10) => this.playerController?.takeDamage(amount),
      heal: () => {
        this.playerController?.replenish()
      },
      kill: () => this.playerController?.takeDamage(999),
    }

    // ── Start ───────────────────────────────────────────────────
    this.gameLoop = new GameLoop(this.tickHandler)
    this.gameLoop.start()
  }

  // ═══════════════════════════════════════════════════════════════
  // State transition dispatcher
  // ═══════════════════════════════════════════════════════════════

  private onStateTransition(current: LevelState, _previous: LevelState | null): void {
    switch (_previous) {
      case 'arrival':
        this.exitArrival()
        break
      case 'lander':
        this.exitLander()
        break
      case 'eva':
        // Don't run normal exitEva when dying — enterDead handles its own cleanup
        if (current !== 'dead') this.exitEva()
        break
    }

    switch (current) {
      case 'lander':
        this.enterLander()
        break
      case 'eva':
        this.enterEva()
        break
      case 'dead':
        this.enterDead()
        break
      case 'failed':
        this.enterFailed()
        break
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Arrival state
  // ═══════════════════════════════════════════════════════════════

  private enterArrival(): void {
    // Lander physics active (gravity pulls it down) but no player input
    this.tickHandler!.register(this.landerController!, TICK_PRIORITY_PHYSICS)

    // Cinematic camera
    this.sceneManager!.setActiveCamera(this.arrivalCamera!)
    this.updateArrivalCamera()

    // Disable orbit controls during arrival
    this.vehicleCamera!.controls.enabled = false

    // Letterbox
    this.onLetterbox?.(true)
  }

  private exitArrival(): void {
    // Unregister lander from tick — enterLander will re-register it
    this.tickHandler!.unregister(this.landerController!)

    // Letterbox starts closing (CSS transition handles animation)
    this.onLetterbox?.(false)
  }

  /** Position the arrival camera to look at the lander from a cinematic angle. */
  private updateArrivalCamera(): void {
    if (!this.arrivalCamera || !this.landerController) return
    const landerPos = this.landerController.group.position
    this.arrivalCamera.position.copy(landerPos).add(ARRIVAL_CAM_OFFSET)
    this.arrivalCamera.lookAt(landerPos)
  }

  // ═══════════════════════════════════════════════════════════════
  // Lander state
  // ═══════════════════════════════════════════════════════════════

  private enterLander(): void {
    this.tickHandler!.register(this.landerController!, TICK_PRIORITY_PHYSICS)
    this.tickHandler!.register(this.vehicleCamera!, TICK_PRIORITY_RENDER - 2)
    this.vehicleCamera!.controls.enabled = true
    this.sceneManager!.setCamera(this.vehicleCamera!)
    this.sceneManager!.setActiveCamera(null)
  }

  private exitLander(): void {
    this.tickHandler!.unregister(this.landerController!)
    this.tickHandler!.unregister(this.vehicleCamera!)
    this.vehicleCamera!.controls.enabled = false
  }

  // ═══════════════════════════════════════════════════════════════
  // EVA state
  // ═══════════════════════════════════════════════════════════════

  private enterEva(): void {
    // Position player at lander + offset
    const landerPos = this.landerController!.group.position
    this.playerController!.group.position.set(
      landerPos.x + EVA_SPAWN_OFFSET_X,
      landerPos.y,
      landerPos.z,
    )

    // Show EVA visuals
    this.playerController!.group.visible = true
    this.multiTool!.setVisible(true)

    // Register EVA tickables
    this.tickHandler!.register(this.playerController!, TICK_PRIORITY_PHYSICS)
    this.tickHandler!.register(this.multiToolState!, TICK_PRIORITY_PHYSICS + 1)
    this.tickHandler!.register(this.projectileSystem!, TICK_PRIORITY_PHYSICS + 2)
    this.tickHandler!.register(this.impactEmitter!, TICK_PRIORITY_PHYSICS + 3)
    this.tickHandler!.register(this.fpsCamera!, TICK_PRIORITY_RENDER - 2)
    this.tickHandler!.register(this.multiTool!, TICK_PRIORITY_RENDER - 2)

    // FPS camera
    this.fpsCamera!.setTarget(this.playerController!.group)
    this.sceneManager!.setActiveCamera(this.fpsCamera!.camera)
    this.sceneManager!.setCamera(null)

    // Pointer lock
    this.setupPointerLock()
    this.sceneManager!.renderer.domElement.requestPointerLock()
  }

  private exitEva(): void {
    // Replenish O2 and stamina (back in lander, connected to life support)
    this.playerController!.replenish()

    // Hide EVA visuals
    this.playerController!.group.visible = false
    this.multiTool!.setVisible(false)

    // Unregister EVA tickables
    this.tickHandler!.unregister(this.playerController!)
    this.tickHandler!.unregister(this.multiToolState!)
    this.tickHandler!.unregister(this.projectileSystem!)
    this.tickHandler!.unregister(this.impactEmitter!)
    this.tickHandler!.unregister(this.fpsCamera!)
    this.tickHandler!.unregister(this.multiTool!)

    // Release pointer lock
    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
    this.teardownPointerLock()

    // Reset mouse state
    this.leftMouseDown = false
    this.leftMouseJustPressed = false
    this.rightMouseDown = false
  }

  // ═══════════════════════════════════════════════════════════════
  // Dead / Failed states
  // ═══════════════════════════════════════════════════════════════

  private enterDead(): void {
    // Stop player movement but keep fpsCamera ticking for the death pitch-down
    this.tickHandler!.unregister(this.playerController!)
    this.tickHandler!.unregister(this.multiToolState!)
    this.tickHandler!.unregister(this.projectileSystem!)
    this.tickHandler!.unregister(this.impactEmitter!)
    this.tickHandler!.unregister(this.multiTool!)
    // NOTE: fpsCamera stays registered — it renders the death camera drop

    // Hide the gun
    this.multiTool!.setVisible(false)

    // Release pointer lock
    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
    this.teardownPointerLock()
    this.leftMouseDown = false
    this.leftMouseJustPressed = false
    this.rightMouseDown = false

    // Fade + message are driven by the dead state tick, not set here
  }

  private enterFailed(): void {
    // Clean up remaining EVA systems
    this.tickHandler!.unregister(this.fpsCamera!)
    this.playerController!.group.visible = false

    // Navigate home
    import('@/router').then(({ default: router }) => {
      router.push('/')
    })
  }

  // ═══════════════════════════════════════════════════════════════
  // Per-frame tick
  // ═══════════════════════════════════════════════════════════════

  /** Per-frame update — dispatches F key triggers and mode-specific logic. */
  tick(dt: number): void {
    // F key → state triggers (only one can succeed per press)
    if (this.inputManager?.wasActionPressed('interact') && this.stateMachine) {
      if (!this.stateMachine.trigger('exitVehicle')) {
        this.stateMachine.trigger('enterVehicle')
      }
    }

    // Arrival: track lander with cinematic camera
    if (this.stateMachine?.is('arrival')) {
      this.updateArrivalCamera()
    }

    // EVA: feed inputs to tool + camera
    if (this.stateMachine?.is('eva')) {
      this.tickEva(dt)

      // Death fade — opacity ramps as HP drops (starts fading below 50% HP)
      const hpRatio = this.playerController!.hp / this.playerController!.maxHp
      if (hpRatio < 0.5) {
        // Map 0.5→0 HP ratio to 0→1 opacity
        this.onDeathFade?.(1 - hpRatio * 2)
      } else {
        this.onDeathFade?.(0)
      }
    }

    // Dead: camera drops, screen fades, message appears
    if (this.stateMachine?.is('dead') && this.fpsCamera) {
      const DEATH_PITCH_SPEED = 1.2
      const DEATH_PITCH_TARGET = -1.4 // ~80 degrees down
      const FADE_DURATION = 2.0 // seconds to full black
      const MESSAGE_DELAY = 1.5 // seconds before showing YOU DIED

      // Camera drops
      if (this.fpsCamera.pitch > DEATH_PITCH_TARGET) {
        this.fpsCamera.pitch -= DEATH_PITCH_SPEED * dt
      }

      // Gradual fade to black
      const elapsed = this.stateMachine.stateTime
      const fadeProgress = Math.min(1, elapsed / FADE_DURATION)
      this.onDeathFade?.(fadeProgress)

      // Show message after delay
      if (elapsed >= MESSAGE_DELAY) {
        this.onDeathMessage?.(true)
      }
    }

    // Broadcast state info for HUD
    if (this.stateMachine) {
      const currentState = this.stateMachine.state ?? ''
      const grounded = this.landerController?.body.grounded ?? false

      this.onStateInfo?.({ state: currentState, grounded })

      // Lander telemetry
      if (currentState === 'lander' && this.onLanderTelemetry && this.landerController) {
        const ts = this.landerController.thrusterSystem
        this.onLanderTelemetry({
          altitude: this.landerController.position.y,
          velocityY: this.landerController.body.velocityY,
          posX: this.landerController.position.x,
          posZ: this.landerController.position.z,
          fuelLevel: ts.fuelLevel,
          fuelCapacity: ts.fuelCapacity,
          mainEngineCharge: ts.getState('mainEngine').charge,
          mainEngineCapacity: ts.getState('mainEngine').capacity,
          rcsCharge: ts.getState('rcs').charge,
          rcsCapacity: ts.getState('rcs').capacity,
        })
      }

      // FPS telemetry
      if (currentState === 'eva' && this.onFpsTelemetry && this.playerController) {
        const ts = this.playerController.thrusterSystem
        this.onFpsTelemetry({
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
        })
      }
    }
  }

  /** Per-frame EVA logic — tool input, camera bob, aiming. */
  private tickEva(_dt: number): void {
    // Tool keybinds
    if (this.inputManager && this.multiToolState) {
      if (this.inputManager.wasActionPressed('toolDrill')) this.multiToolState.setMode('drill')
      if (this.inputManager.wasActionPressed('toolWeapon')) this.multiToolState.setMode('weapon')
      if (this.inputManager.wasActionPressed('toolHeal')) this.multiToolState.setMode('heal')

      this.multiToolState.setAiming(this.rightMouseDown)
      this.multiToolState.setInput(this.leftMouseDown, this.leftMouseJustPressed)
      this.multiToolState.setSpeed(this.playerController?.speed ?? 0)
      this.leftMouseJustPressed = false
    }

    // Sync tool visuals
    if (this.multiToolState && this.multiTool) {
      this.multiTool.setMode(this.multiToolState.modeConfig.color, this.multiToolState.mode)
      this.multiTool.setAiming(this.multiToolState.aiming)
      this.multiTool.setRtgLevel(this.multiToolState.rtgLevel / this.multiToolState.rtgCapacity)
      this.playerController?.setAiming(this.multiToolState.aiming)
      if (this.multiToolState.isFiring) {
        this.multiTool.fire()
      }
    }

    // ADS camera zoom
    if (this.multiToolState && this.fpsCamera) {
      const ads = this.multiToolState.adsConfig
      this.fpsCamera.setAiming(
        this.multiToolState.aiming,
        ads.fovMultiplier,
        ads.zoomSpeed,
      )
    }

    // Camera bob from velocity
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
  }

  // ═══════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════

  /** Check if the FPS player is within interact range of the lander. */
  private isPlayerNearLander(): boolean {
    if (!this.playerController || !this.landerController) return false
    const playerPos = this.playerController.group.position
    const landerPos = this.landerController.group.position
    const dx = playerPos.x - landerPos.x
    const dz = playerPos.z - landerPos.z
    return Math.sqrt(dx * dx + dz * dz) <= LANDER_INTERACT_RANGE
  }

  // ═══════════════════════════════════════════════════════════════
  // Pointer lock (EVA only)
  // ═══════════════════════════════════════════════════════════════

  private setupPointerLock(): void {
    const canvas = this.sceneManager!.renderer.domElement

    this.boundOnMouseMove = (e: MouseEvent): void => {
      if (document.pointerLockElement === canvas) {
        this.fpsCamera?.applyMouseDelta(e.movementX, e.movementY)
      }
    }

    this.boundOnMouseDown = (e: MouseEvent): void => {
      if (document.pointerLockElement !== canvas) return
      if (e.button === 0) {
        this.leftMouseDown = true
        this.leftMouseJustPressed = true
      }
      if (e.button === 2) this.rightMouseDown = true
    }

    this.boundOnMouseUp = (e: MouseEvent): void => {
      if (e.button === 0) this.leftMouseDown = false
      if (e.button === 2) this.rightMouseDown = false
    }

    this.boundOnLockChange = (): void => {
      const locked = document.pointerLockElement === canvas
      if (!locked) {
        this.leftMouseDown = false
        this.leftMouseJustPressed = false
        this.rightMouseDown = false
      }
    }

    document.addEventListener('mousemove', this.boundOnMouseMove)
    document.addEventListener('mousedown', this.boundOnMouseDown)
    document.addEventListener('mouseup', this.boundOnMouseUp)
    document.addEventListener('pointerlockchange', this.boundOnLockChange)
    canvas.addEventListener('contextmenu', this.preventContextMenu)
    canvas.addEventListener('click', this.requestLockOnClick)
  }

  private teardownPointerLock(): void {
    if (this.boundOnMouseMove) document.removeEventListener('mousemove', this.boundOnMouseMove)
    if (this.boundOnMouseDown) document.removeEventListener('mousedown', this.boundOnMouseDown)
    if (this.boundOnMouseUp) document.removeEventListener('mouseup', this.boundOnMouseUp)
    if (this.boundOnLockChange) document.removeEventListener('pointerlockchange', this.boundOnLockChange)

    const canvas = this.sceneManager?.renderer.domElement
    if (canvas) {
      canvas.removeEventListener('contextmenu', this.preventContextMenu)
      canvas.removeEventListener('click', this.requestLockOnClick)
    }

    this.boundOnMouseMove = null
    this.boundOnMouseDown = null
    this.boundOnMouseUp = null
    this.boundOnLockChange = null
  }

  private preventContextMenu = (e: Event): void => {
    e.preventDefault()
  }

  private requestLockOnClick = (): void => {
    const canvas = this.sceneManager?.renderer.domElement
    if (canvas && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock()
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Dispose
  // ═══════════════════════════════════════════════════════════════

  /** Tear down all systems and stop the game loop. */
  dispose(): void {
    this.gameLoop?.stop()
    this.teardownPointerLock()
    this.projectileSystem?.dispose()
    this.impactEmitter?.dispose()
    this.multiTool?.dispose()
    this.playerController?.dispose()
    this.fpsCamera?.dispose()
    this.landerController?.dispose()
    this.terrainMesh?.dispose()
    this.vehicleCamera?.dispose()
    this.sceneManager?.dispose()
    this.inputManager?.dispose()
  }
}
