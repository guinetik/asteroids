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

const AMBIENT_LIGHT_INTENSITY = 0.4
const DIR_LIGHT_INTENSITY = 1.2
const GRID_SIZE = 2000
const TERRAIN_SEED = 77
const TERRAIN_RESOLUTION = 128
const SPAWN_HEIGHT = 5

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
  private leftMouseDown = false
  private leftMouseJustPressed = false
  private rightMouseDown = false

  /** Called each frame with player telemetry for HUD display. */
  onTelemetry: ((telemetry: FpsTelemetry) => void) | null = null

  /** Called when pointer lock state changes. */
  onPointerLockChange: ((locked: boolean) => void) | null = null

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

    if (this.playerController && this.onTelemetry) {
      const ts = this.playerController.thrusterSystem
      this.onTelemetry({
        o2Level: this.playerController.o2Level,
        o2Capacity: this.playerController.o2Capacity,
        sprintCharge: ts.getState('sprint').charge,
        sprintCapacity: ts.getState('sprint').capacity,
        speed: this.playerController.speed,
        grounded: this.playerController.grounded,
        deathTimer: this.playerController.deathTimer,
        activeMode: this.multiToolState?.mode ?? 'drill',
        aiming: this.multiToolState?.aiming ?? false,
        isFiring: this.multiToolState?.isFiring ?? false,
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
