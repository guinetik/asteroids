/**
 * Portable EVA session orchestrator.
 *
 * Owns the full EVA state machine (idle → opening → active → idle), the
 * pointer-lock glue, the "world feels huge" scale swap, and the shuttle↔EVA
 * camera hand-off. Scene-specific knowledge (which POI, which objects to
 * enlarge) is injected via {@link EvaSessionConfig} so the exact same session
 * can run inside `ShuttleViewController`, `MapViewController`, or any future
 * view that wants an orbital EVA loop.
 *
 * @author guinetik
 * @date 2026-04-18
 * @spec docs/superpowers/specs/2026-04-18-visit-relay-mission-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { InputManager } from '@/lib/InputManager'
import type { TickHandler } from '@/lib/TickHandler'
import type { FpsTelemetry } from '@/components/FpsHud.vue'
import { TICK_PRIORITY_PHYSICS, TICK_PRIORITY_RENDER } from '@/lib/tickPriorities'
import type { SceneManager } from './SceneManager'
import { EvaTetherController } from './EvaTetherController'

/** Distance (world units) at which the player can initiate EVA near the POI. */
const EVA_TRIGGER_RANGE = 25

/** Distance (world units) at which the EVA player can re-enter the vehicle. */
const EVA_RETURN_RANGE = 18

/** Vehicle must be slower than this (world units / s) to initiate EVA. */
const EVA_MAX_VEHICLE_SPEED = 0.5

/** Door open progress (0..1) at which EVA egress is allowed. */
const EVA_DOOR_OPEN_THRESHOLD = 0.98

/** Local offset (vehicle space) where the EVA player appears on exit. */
const EVA_SPAWN_OFFSET = new THREE.Vector3(0, 2.5, 6)

/** Stub HP for the FPS HUD while the EVA flow doesn't track real damage. */
const EVA_STUB_HP = 100

/**
 * Minimal vehicle contract the EVA session depends on. {@link ShuttleController}
 * satisfies this naturally; any future player vehicle can opt in by exposing the
 * same surface.
 */
export interface EvaSessionVehicle {
  /** Scene graph root for positioning and tether anchoring. */
  group: THREE.Object3D
  /** Current speed magnitude (world units / s). */
  speed: number
  /** Heading angle (radians) used to seed the initial EVA camera yaw. */
  heading: number
  /** Freeze vehicle physics (no movement, no gravity effects). */
  freeze(): void
  /** Resume vehicle physics. */
  unfreeze(): void
  /** Enable/disable the vehicle's input reads. */
  setInputEnabled(enabled: boolean): void
  /** Begin opening cargo-bay doors (idempotent if already open). */
  openDoors(): void
  /** Begin closing cargo-bay doors (idempotent if already closed). */
  closeDoors(): void
  /** Door animation progress in [0,1]. */
  doorOpenProgress: number
}

/** A scene object + scale multiplier pair for the "world feels huge" swap. */
export interface EvaHugeScaleTarget {
  object: THREE.Object3D
  factor: number
}

/** Dependencies + callbacks wired to the host view. */
export interface EvaSessionConfig {
  sceneManager: SceneManager
  tickHandler: TickHandler
  inputManager: InputManager
  /** Resolve the player vehicle. Returning null is treated as "no EVA possible". */
  getVehicle: () => EvaSessionVehicle | null
  /** World-space POI position for the proximity check (null = no POI active). */
  getPoi: () => THREE.Vector3 | null
  /** Objects to scale up during EVA. Read once at session enter. */
  getHugeScaleTargets: () => EvaHugeScaleTarget[]
  /** Multiplier applied to the spawn offset so the player emerges outside the scaled vehicle. */
  spawnOffsetScale: number
  /** Fired true when EVA becomes active, false when it ends. */
  onEvaModeChange?: (active: boolean) => void
  /** Per-frame FPS HUD telemetry while EVA is active. */
  onEvaTelemetry?: (telemetry: FpsTelemetry) => void
  /** Prompt text for the view-level HUD ("EVA [E]", "Return to Shuttle [E]", etc.). */
  onActionPrompt?: (prompt: string | null) => void
}

/**
 * Self-contained EVA session. Register as a {@link Tickable}; call {@link dispose}
 * on teardown. Exposes {@link isActive} for the host view to switch HUD variants.
 */
export class EvaSession implements Tickable {
  private readonly config: EvaSessionConfig
  private mode: 'idle' | 'opening' | 'active' = 'idle'
  private controller: EvaTetherController | null = null
  private preEvaScales: { object: THREE.Object3D; scale: number }[] = []
  private lastPrompt: string | null = null
  private boundOnMouseMove: ((e: MouseEvent) => void) | null = null
  private boundOnCanvasClick: (() => void) | null = null

  constructor(config: EvaSessionConfig) {
    this.config = config
  }

  /** True while the player is out on EVA (post-door-open, pre-return). */
  get isActive(): boolean {
    return this.mode === 'active'
  }

  tick(_dt: number): void {
    const vehicle = this.config.getVehicle()
    if (!vehicle) {
      this.setPrompt(null)
      return
    }

    if (this.mode === 'opening') {
      this.setPrompt('OPENING BAY…')
      if (vehicle.doorOpenProgress >= EVA_DOOR_OPEN_THRESHOLD) {
        this.startSession(vehicle)
      }
      return
    }

    if (this.mode === 'idle') {
      const poi = this.config.getPoi()
      if (!poi) {
        this.setPrompt(null)
        return
      }
      const distToPoi = vehicle.group.position.distanceTo(poi)
      if (distToPoi >= EVA_TRIGGER_RANGE) {
        this.setPrompt(null)
        return
      }
      if (vehicle.speed > EVA_MAX_VEHICLE_SPEED) {
        this.setPrompt('STOP SHIP TO EVA')
        return
      }
      this.setPrompt('EVA [E]')
      if (this.config.inputManager.wasActionPressed('evaToggle')) {
        this.beginOpening(vehicle)
      }
      return
    }

    if (!this.controller) return
    const distToVehicle = this.controller.group.position.distanceTo(vehicle.group.position)
    if (distToVehicle < EVA_RETURN_RANGE) {
      this.setPrompt('Return to Shuttle [E]')
      if (this.config.inputManager.wasActionPressed('evaToggle')) {
        this.endSession(vehicle)
        return
      }
    } else {
      this.setPrompt(null)
    }
    this.emitTelemetry()
  }

  private beginOpening(vehicle: EvaSessionVehicle): void {
    this.mode = 'opening'
    vehicle.openDoors()
    vehicle.setInputEnabled(false)
  }

  private startSession(vehicle: EvaSessionVehicle): void {
    const { sceneManager, tickHandler, inputManager } = this.config
    this.mode = 'active'
    vehicle.freeze()
    this.applyHugeScales()

    const controller = new EvaTetherController()
    controller.setInput(inputManager)
    controller.setAnchor(vehicle.group)
    controller.refillLifeSupport()

    const spawn = EVA_SPAWN_OFFSET.clone()
      .multiplyScalar(this.config.spawnOffsetScale)
      .applyQuaternion(vehicle.group.quaternion)
    controller.setPosition(
      new THREE.Vector3().copy(vehicle.group.position).add(spawn),
    )
    controller.fpsCamera.yaw = vehicle.heading
    controller.fpsCamera.pitch = 0

    sceneManager.addToScene(controller.group)
    sceneManager.addToScene(controller.tetherLine)
    sceneManager.addToScene(controller.fpsCamera.helmetLightRig)
    controller.fpsCamera.helmetLightRig.visible = true

    tickHandler.register(controller, TICK_PRIORITY_PHYSICS)
    tickHandler.register(controller.fpsCamera, TICK_PRIORITY_RENDER - 1)
    sceneManager.setActiveCamera(controller.fpsCamera.camera)

    this.controller = controller
    this.attachPointerLock()
    this.config.onEvaModeChange?.(true)
  }

  private endSession(vehicle: EvaSessionVehicle): void {
    const { sceneManager, tickHandler } = this.config
    this.mode = 'idle'
    this.detachPointerLock()
    sceneManager.setActiveCamera(null)
    if (this.controller) {
      tickHandler.unregister(this.controller)
      tickHandler.unregister(this.controller.fpsCamera)
      sceneManager.removeFromScene(this.controller.group)
      sceneManager.removeFromScene(this.controller.tetherLine)
      sceneManager.removeFromScene(this.controller.fpsCamera.helmetLightRig)
      this.controller.dispose()
      this.controller = null
    }
    this.restoreHugeScales()
    vehicle.setInputEnabled(true)
    vehicle.unfreeze()
    vehicle.closeDoors()
    this.config.onEvaModeChange?.(false)
    this.setPrompt(null)
  }

  private applyHugeScales(): void {
    this.preEvaScales = []
    for (const { object, factor } of this.config.getHugeScaleTargets()) {
      this.preEvaScales.push({ object, scale: object.scale.x })
      object.scale.multiplyScalar(factor)
    }
  }

  private restoreHugeScales(): void {
    for (const entry of this.preEvaScales) {
      entry.object.scale.setScalar(entry.scale)
    }
    this.preEvaScales = []
  }

  private emitTelemetry(): void {
    if (!this.config.onEvaTelemetry || !this.controller) return
    this.config.onEvaTelemetry({
      hp: EVA_STUB_HP,
      maxHp: EVA_STUB_HP,
      o2Level: this.controller.o2Level,
      o2Capacity: this.controller.o2Capacity,
      sprintCharge: 0,
      sprintCapacity: 0,
      speed: this.controller.speed,
      grounded: false,
      activeMode: 'drill',
      aiming: false,
      isFiring: false,
      rtgLevel: this.controller.rtgLevel,
      rtgCapacity: this.controller.rtgCapacity,
      modeCharge: 0,
      modeCapacity: 0,
      headingRad: this.controller.headingRad,
      objectives: [],
    })
  }

  private setPrompt(prompt: string | null): void {
    if (this.lastPrompt === prompt) return
    this.lastPrompt = prompt
    this.config.onActionPrompt?.(prompt)
  }

  private attachPointerLock(): void {
    const canvas = this.config.sceneManager.renderer.domElement
    this.boundOnMouseMove = (e: MouseEvent): void => {
      if (document.pointerLockElement === canvas) {
        this.controller?.applyMouseDelta(e.movementX, e.movementY)
      }
    }
    this.boundOnCanvasClick = (): void => {
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock()
      }
    }
    document.addEventListener('mousemove', this.boundOnMouseMove)
    canvas.addEventListener('click', this.boundOnCanvasClick)
    canvas.requestPointerLock()
  }

  private detachPointerLock(): void {
    if (this.boundOnMouseMove) {
      document.removeEventListener('mousemove', this.boundOnMouseMove)
      this.boundOnMouseMove = null
    }
    if (this.boundOnCanvasClick) {
      const canvas = this.config.sceneManager.renderer.domElement
      canvas.removeEventListener('click', this.boundOnCanvasClick)
      this.boundOnCanvasClick = null
    }
    if (document.pointerLockElement) document.exitPointerLock()
  }

  dispose(): void {
    if (this.mode === 'idle') return
    const vehicle = this.config.getVehicle()
    if (vehicle) {
      this.endSession(vehicle)
    } else {
      this.mode = 'idle'
      this.detachPointerLock()
      this.restoreHugeScales()
    }
  }
}
