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
import { DevConsole } from '@/lib/devConsole'
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
import { createLevelStateMachine, LANDER_INTERACT_RANGE, EXFIL_PROXIMITY_RANGE } from '@/lib/level/levelStateMachine'
import type { LevelState } from '@/lib/level/levelStateMachine'
import type { StateMachine } from '@/lib/stateMachine'
import { ArrivalSequence } from '@/three/ArrivalSequence'
import { LanderExplosion } from '@/three/LanderExplosion'
import { StarFieldController } from '@/three/StarFieldController'
import {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  Color,
  Vector3,
} from 'three'
import playerConfigJson from '@/data/fps/player-config.json'
import multiToolConfigJson from '@/data/fps/multitool-config.json'

// ── Scene constants ─────────────────────────────────────────────
/** Low ambient — most light comes from the distant sun. Foreboding. */
const AMBIENT_LIGHT_INTENSITY = 0.15
/** Cool-tinted ambient to simulate deep space. */
const AMBIENT_LIGHT_COLOR = 0x334466
/** Harsh directional sun — single dominant light source. */
const DIR_LIGHT_INTENSITY = 1.8
/** Slight warm tint on the sun (distant star). */
const DIR_LIGHT_COLOR = 0xffeedd
const GRID_SIZE = 12000
const TERRAIN_SEED = 42
const TERRAIN_RESOLUTION = 512
const FLAT_ZONE_COUNT = 3

const LANDER_SPAWN_HEIGHT = 600

/** Maximum random offset from center for lander spawn position (XZ). */
const SPAWN_POSITION_RANGE = 2000
const EVA_SPAWN_OFFSET_X = 8


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
  private arrivalSequence: ArrivalSequence | null = null

  // ── Exfil tracking ────────────────────────────────────────────
  private hasExitedVehicle = false
  private landerExplosion: LanderExplosion | null = null

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

  /** Called each frame with current state + grounded + canExfil for HUD prompts. */
  onStateInfo: ((info: { state: string; grounded: boolean; canExfil: boolean }) => void) | null = null

  /** Called each frame during lander state with lander telemetry. */
  onLanderTelemetry: ((telemetry: LanderTelemetry) => void) | null = null

  /** Called each frame during EVA state with FPS telemetry. */
  onFpsTelemetry: ((telemetry: FpsTelemetry) => void) | null = null

  /** Called each frame with death fade opacity (0 = clear, 1 = black). */
  onDeathFade: ((opacity: number) => void) | null = null

  /** Called when player dies — show death message. */
  onDeathMessage: ((visible: boolean) => void) | null = null
  /** Arrival fade to black (0 = clear, 1 = full black). */
  onArrivalFade: ((opacity: number) => void) | null = null

  /** Called to show/hide the death overlay with a cause message. */
  onDeathOverlay: ((visible: boolean, cause: string) => void) | null = null

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

    // ── Starfield — denser than map scene for atmosphere ────────
    const starField = new StarFieldController({ count: 8000, size: 4 })
    this.sceneManager.addToScene(starField.points)

    // ── Lighting — foreboding deep-space atmosphere ─────────────
    const ambient = new AmbientLight(AMBIENT_LIGHT_COLOR, AMBIENT_LIGHT_INTENSITY)
    const sun = new DirectionalLight(DIR_LIGHT_COLOR, DIR_LIGHT_INTENSITY)
    sun.position.set(100, 200, 50)
    // Hemisphere fill: cold blue from below, warm from sky
    const hemi = new HemisphereLight(0x445566, 0x111122, 0.2)
    this.sceneManager.addToScene(ambient)
    this.sceneManager.addToScene(sun)
    this.sceneManager.addToScene(hemi)

    // ── Lander (created once, stays in scene) ───────────────────
    this.landerController = new LanderController(this.inputManager)
    this.landerController.setHeightmap(this.heightmap)
    await this.landerController.load()
    const spawnX = (Math.random() - 0.5) * 2 * SPAWN_POSITION_RANGE
    const spawnZ = (Math.random() - 0.5) * 2 * SPAWN_POSITION_RANGE
    this.landerController.group.position.set(spawnX, LANDER_SPAWN_HEIGHT, spawnZ)

    this.landerController.onCrash = (_damage, impactSpeed) => {
      this.landerExplosion!.explode(this.landerController!.group.position.clone(), impactSpeed)
    }

    this.landerController.onDeath = () => {
      this.landerExplosion!.explode(this.landerController!.group.position.clone(), 20)
      this.landerController!.group.visible = false
      // Keep the camera running so the player sees the explosion
      this.onDeathOverlay?.(true, 'Lander Destroyed')
    }

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

    // ── Cinematic arrival sequence ─────────────────────────────
    const landerSpawn = new Vector3(spawnX, LANDER_SPAWN_HEIGHT, spawnZ)
    this.arrivalSequence = new ArrivalSequence(landerSpawn)
    await this.arrivalSequence.load()
    this.sceneManager.scene.add(this.arrivalSequence.shuttleGroup)

    this.arrivalSequence.onLanderDetach = (position) => {
      if (this.landerController) {
        this.landerController.group.position.copy(position)
      }
    }

    this.arrivalSequence.onFadeOut = (opacity) => {
      this.onArrivalFade?.(opacity)
    }

    this.arrivalSequence.onComplete = () => {
      // Park the shuttle hovering above the landing zone (visible from ground)
      this.arrivalSequence?.parkShuttle()
      // Show the gameplay lander at the spawn height (it will fall with physics)
      if (this.landerController) {
        this.landerController.group.visible = true
      }
      // Clear the fade
      this.onArrivalFade?.(0)
    }

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

    // ── Lander explosion VFX ───────────────────────────────────────
    this.landerExplosion = new LanderExplosion()
    this.sceneManager.addToScene(this.landerExplosion.fireEmitter.points)
    this.sceneManager.addToScene(this.landerExplosion.debrisEmitter.points)

    // ── State machine ───────────────────────────────────────────
    this.stateMachine = createLevelStateMachine({
      onStateChange: (current, previous) => this.onStateTransition(current, previous),
      isLanderGrounded: () => this.landerController?.body.grounded ?? false,
      isPlayerNearLander: () => this.isPlayerNearLander(),
      isLanderNearShuttle: () => this.isLanderNearShuttle(),
      hasCompletedEva: () => this.hasExitedVehicle,
    })

    // ── Always-active tickables ─────────────────────────────────
    this.tickHandler.register(this.stateMachine, TICK_PRIORITY_INPUT + 1)
    this.tickHandler.register(this, TICK_PRIORITY_RENDER - 1)
    this.tickHandler.register(this.sceneManager, TICK_PRIORITY_RENDER)

    // ── Arrival state starts with lander physics + cinematic cam ─
    this.enterArrival()

    // ── Dev tools ────────────────────────────────────────────────
    DevConsole.register('LevelView', {
      takeDamage: (amount = 10) => this.playerController?.takeDamage(amount),
      heal: () => this.playerController?.replenish(),
      kill: () => this.playerController?.takeDamage(999),
      landerDamage: (amount = 20) => this.landerController?.takeDamage(amount),
      landerDestroy: () => this.landerController?.takeDamage(999),
      exfil: () => {
        this.hasExitedVehicle = true
        this.stateMachine?.setState('exfil' as LevelState)
      },
    })

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
      case 'exfil':
        this.enterExfil()
        break
      case 'complete':
        this.enterComplete()
        break
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Arrival state
  // ═══════════════════════════════════════════════════════════════

  private enterArrival(): void {
    // Hide the gameplay lander — the shuttle's cargo lander is visible during the cinematic
    if (this.landerController) {
      this.landerController.group.visible = false
    }

    // Use the arrival sequence camera
    if (this.arrivalSequence) {
      this.sceneManager!.setActiveCamera(this.arrivalSequence.camera)
    }

    // Disable orbit controls during arrival
    this.vehicleCamera!.controls.enabled = false

    // Letterbox
    this.onLetterbox?.(true)
  }

  private exitArrival(): void {
    // Show the lander for gameplay
    if (this.landerController) {
      this.landerController.group.visible = true
    }

    // Letterbox starts closing
    this.onLetterbox?.(false)
  }

  // ═══════════════════════════════════════════════════════════════
  // Lander state
  // ═══════════════════════════════════════════════════════════════

  private enterLander(): void {
    this.tickHandler!.register(this.landerController!, TICK_PRIORITY_PHYSICS)
    this.tickHandler!.register(this.vehicleCamera!, TICK_PRIORITY_RENDER - 2)
    this.tickHandler!.register(this.landerExplosion!, TICK_PRIORITY_PHYSICS + 3)
    this.vehicleCamera!.controls.enabled = true
    this.sceneManager!.setCamera(this.vehicleCamera!)
    this.sceneManager!.setActiveCamera(null)
  }

  private exitLander(): void {
    this.tickHandler!.unregister(this.landerController!)
    this.tickHandler!.unregister(this.vehicleCamera!)
    this.tickHandler!.unregister(this.landerExplosion!)
    this.vehicleCamera!.controls.enabled = false
  }

  // ═══════════════════════════════════════════════════════════════
  // EVA state
  // ═══════════════════════════════════════════════════════════════

  private enterEva(): void {
    this.hasExitedVehicle = true
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

  /** Called from the death overlay restart button. */
  restart(): void {
    this.onDeathOverlay?.(false, '')
    import('@/router').then(({ default: router }) => {
      router.push('/')
    })
  }

  // ═══════════════════════════════════════════════════════════════
  // Exfil / Complete states
  // ═══════════════════════════════════════════════════════════════

  private enterExfil(): void {
    // Unregister lander tickables
    this.tickHandler!.unregister(this.landerController!)
    this.tickHandler!.unregister(this.vehicleCamera!)
    this.vehicleCamera!.controls.enabled = false

    // Hide the gameplay lander
    this.landerController!.group.visible = false

    // Letterbox for cinematic framing
    this.onLetterbox?.(true)

    // Switch to cinematic camera
    this.sceneManager!.setActiveCamera(this.arrivalSequence!.camera)
    this.sceneManager!.setCamera(null)

    // Start reverse cutscene
    this.arrivalSequence!.playExfil(this.landerController!.group.position)

    this.arrivalSequence!.onFadeOut = (opacity) => {
      this.onArrivalFade?.(opacity)
    }
  }

  private enterComplete(): void {
    // Navigate to star map
    import('@/router').then(({ default: router }) => {
      router.push('/map')
    })
  }

  // ═══════════════════════════════════════════════════════════════
  // Per-frame tick
  // ═══════════════════════════════════════════════════════════════

  /** Per-frame update — dispatches F key triggers and mode-specific logic. */
  tick(dt: number): void {
    // Tick arrival sequence if active
    if (this.arrivalSequence) {
      this.arrivalSequence.tick(dt)
    }

    // ESC → skip arrival cinematic
    if (this.inputManager?.wasActionPressed('skipCinematic') && this.stateMachine?.is('arrival')) {
      this.arrivalSequence?.parkShuttle()
      if (this.landerController) {
        this.landerController.group.visible = true
      }
      this.onArrivalFade?.(0)
      this.stateMachine.setState('lander' as LevelState)
    }

    // F key → state triggers (only one can succeed per press)
    if (this.inputManager?.wasActionPressed('interact') && this.stateMachine) {
      if (!this.stateMachine.trigger('exfiltrate')) {
        if (!this.stateMachine.trigger('exitVehicle')) {
          this.stateMachine.trigger('enterVehicle')
        }
      }
    }

    // EVA: feed inputs to tool + camera
    if (this.stateMachine?.is('eva')) {
      this.tickEva(dt)

      // Hypoxia visual — fade + pulse when O2 is empty and HP is draining
      const o2Empty = this.playerController!.o2Level <= 0
      const hpRatio = this.playerController!.hp / this.playerController!.maxHp
      if (o2Empty) {
        // Base fade from HP loss (0% HP → 0.7 opacity, 100% HP → 0)
        const baseFade = (1 - hpRatio) * 0.7
        // Breathing pulse that gets faster as HP drops
        const pulseSpeed = 2 + (1 - hpRatio) * 4 // 2 Hz at full HP → 6 Hz near death
        const pulse = Math.sin(performance.now() * 0.001 * pulseSpeed * Math.PI * 2)
        const pulseAmount = 0.08 + (1 - hpRatio) * 0.12 // subtle at first, stronger near death
        this.onDeathFade?.(Math.min(1, baseFade + pulse * pulseAmount))
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

      const canExfil =
        currentState === 'lander' &&
        this.hasExitedVehicle &&
        this.isLanderNearShuttle()

      this.onStateInfo?.({ state: currentState, grounded, canExfil })

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
          hp: this.landerController.hp,
          maxHp: this.landerController.maxHp,
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
          modeCharge: this.multiToolState?.modeCharge ?? 0,
          modeCapacity: this.multiToolState?.modeChargeCapacity ?? 1,
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
      this.multiTool.setModeChargeLevel(this.multiToolState.modeCharge / this.multiToolState.modeChargeCapacity)
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

  /** Check if the lander is within exfil range of the parked shuttle. */
  private isLanderNearShuttle(): boolean {
    if (!this.landerController || !this.arrivalSequence) return false
    const landerY = this.landerController.position.y
    const shuttleY = this.arrivalSequence.shuttleGroup.position.y
    return Math.abs(landerY - shuttleY) <= EXFIL_PROXIMITY_RANGE
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
    DevConsole.unregister('LevelView')
    this.gameLoop?.stop()
    this.teardownPointerLock()
    this.projectileSystem?.dispose()
    this.impactEmitter?.dispose()
    this.multiTool?.dispose()
    this.playerController?.dispose()
    this.fpsCamera?.dispose()
    this.arrivalSequence?.dispose()
    this.landerExplosion?.dispose()
    this.landerController?.dispose()
    this.terrainMesh?.dispose()
    this.vehicleCamera?.dispose()
    this.sceneManager?.dispose()
    this.inputManager?.dispose()
  }
}
