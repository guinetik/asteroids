/**
 * End-to-end turret session orchestrator. Wires {@link TurretSession}'s
 * pure state machine to the live rig, belt registration, beam raycast,
 * yield coordinator, inventory commit path, input manager, and camera
 * handoff. Owns the per-session lifetime of all those collaborators.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-turret-mode-design.md
 */
import * as THREE from 'three'
import { InputManager } from '@/lib/InputManager'
import { RockYieldSystem } from '@/lib/mining/rockYieldSystem'
import { addItem } from '@/lib/inventory/inventory'
import { loadInventory, saveInventory } from '@/lib/inventory/inventoryStorage'
import { getItemDefinition } from '@/lib/inventory/catalog'
import { getCurrentUpgradeValue } from '@/lib/upgrades'
import type { ThrusterRuntimeModifiers, ShuttleThrusterName } from '@/lib/physics/thrusterSystem'
import { TurretSession, type TurretSessionTickInput, type TurretPhase } from './TurretSession'
import {
  TurretYieldCoordinator,
  type TurretInstanceHandle,
} from './TurretYieldCoordinator'
import { createTurretAimState, tickTurretAim, type TurretAimState } from './TurretAimState'
import { raycastBeam, type BeamTargetInstance } from './TurretBeamSystem'
import { pickTier } from './turretTiers'
import {
  TURRET_BEAM_DPS,
  TURRET_BEAM_MAX_RANGE,
} from './turretConstants'
import { TurretRigController } from '@/three/TurretRigController'
import { TurretTractorEmitter } from '@/three/TurretTractorEmitter'
import type { ShuttleController } from '@/three/ShuttleController'
import type { AsteroidBeltController } from '@/three/controllers/AsteroidBeltController'

/** Minimal scene host surface — mirrors {@link EvaSceneHost} pattern. */
export interface TurretSceneHost {
  /** Add an Object3D to the currently-rendered scene. */
  addToScene(object: THREE.Object3D): void
  /** Remove an Object3D from the currently-rendered scene. */
  removeFromScene(object: THREE.Object3D): void
  /** Hand render to a camera (null reverts to the default vehicle camera). */
  setActiveCamera(camera: THREE.PerspectiveCamera | null): void
  /** Renderer DOM element — used for pointer lock. */
  readonly renderer: { domElement: HTMLElement }
}

/** Constructor dependencies for the controller. */
export interface TurretSessionControllerDeps {
  /** The shuttle controller whose group owns the turret rig and whose thrusterSystem owns the turretMining group. */
  shuttleController: ShuttleController
  /** All asteroid belt controllers on the map; queried for instances + hidden on depletion. */
  beltControllers: AsteroidBeltController[]
  /** Scene host for camera hand-off and particle attach. */
  host: TurretSceneHost
  /** Called when a mineral unit is committed. HUD + audio hook. */
  onResourcePickup?: (itemId: string, quantity: number, label: string) => void
  /** Called on commit failure (inventory full). HUD toast hook. */
  onResourcePickupFailed?: (label: string, reason: string) => void
  /** Called each frame with fade opacity for the Vue fade overlay. */
  onFadeOpacity?: (opacity: number) => void
  /** Per-tick HUD state for the Vue crosshair + any future turret HUD widgets. */
  onHudState?: (state: TurretHudState) => void
}

/** State the Vue HUD needs each frame. */
export interface TurretHudState {
  /** Current session phase — HUD is visible only while `'active'`. */
  phase: TurretPhase
  /** True when the beam is hitting a registered asteroid this frame. */
  reticleValid: boolean
}

/**
 * Orchestrates the full turret session. Construct once at first entry,
 * keep alive for the page; `open()` is idempotent via the internal
 * {@link TurretSession}.
 */
export class TurretSessionController {
  private readonly deps: TurretSessionControllerDeps
  private readonly session: TurretSession
  private readonly rig: TurretRigController
  private readonly tractor: TurretTractorEmitter
  private readonly inputManager: InputManager
  private readonly coordinator: TurretYieldCoordinator
  private yieldSystem: RockYieldSystem | null = null

  private aim: TurretAimState = createTurretAimState()
  private mouseDx = 0
  private mouseDy = 0
  private firing = false
  private mouseFireHeld = false
  private readonly rayOrigin = new THREE.Vector3()
  private readonly rayDir = new THREE.Vector3()
  private readonly targetInstances: BeamTargetInstance[] = []

  /** True while session is in any non-idle phase. */
  get isActive(): boolean {
    return this.session.isActive
  }

  /** Current fade opacity. */
  get fadeOpacity(): number {
    return this.session.fadeOpacity
  }

  /** Current session phase. */
  get phase(): TurretPhase {
    return this.session.phase
  }

  /** @param deps - Collaborators this session reaches into — shuttle, belts, host, HUD callbacks. */
  constructor(deps: TurretSessionControllerDeps) {
    this.deps = deps
    this.rig = new TurretRigController(deps.shuttleController.group)
    this.tractor = new TurretTractorEmitter()
    this.inputManager = new InputManager({
      // turretFire is driven by mouse button, not keyboard.
      exitTurret: ['Escape', 'KeyT'],
    })

    this.coordinator = new TurretYieldCoordinator({
      commitOneUnit: (itemId) => this.commitOneUnit(itemId),
      onInstanceConsumed: (handle) => this.onInstanceConsumed(handle),
      onPickupFailed: (itemId, reason) => {
        const def = getItemDefinition(itemId)
        deps.onResourcePickupFailed?.(def?.label ?? itemId, reason)
      },
    })

    this.session = new TurretSession({
      onOpen: () => this.handleOpen(),
      onClose: () => this.handleClose(),
      tickActive: (input, dt) => this.handleActiveTick(input, dt),
      shuttleIsDead: () => deps.shuttleController.dead,
    })

    // Mouse delta tracking — only relevant while active.
    this.attachMouseListener()
  }

  /** Idempotent entry. */
  open(): void {
    this.session.open()
  }

  /** Call once per frame from MapViewController while `isActive`. */
  tick(dt: number): void {
    const input: TurretSessionTickInput = {
      exitPressed: this.inputManager.wasActionPressed('exitTurret'),
    }
    this.inputManager.tick(dt)
    this.session.tick(dt, input)
    this.deps.onFadeOpacity?.(this.session.fadeOpacity)
    // Emit phase for the Vue HUD during opening/closing too; handleActiveTick
    // emits its own hud state with reticleValid while firing.
    if (this.session.phase !== 'active') {
      this.deps.onHudState?.({ phase: this.session.phase, reticleValid: false })
    }
  }

  /** Dispose on shutdown. */
  dispose(): void {
    this.rig.dispose()
    this.tractor.dispose()
    this.inputManager.dispose()
    this.detachMouseListener()
  }

  // ----- internals -----

  private handleOpen(): void {
    // Disable shuttle input so the player can't steer from inside the turret,
    // but DO NOT freeze physics — the ship should coast with whatever velocity
    // it had (typically matched to the belt's rotation) so asteroids stay
    // roughly stationary relative to the camera.
    this.deps.shuttleController.setInputEnabled(false)

    // Visual setup, so even if mining registration throws we still show the
    // turret view instead of silently reverting to the map view.
    this.aim = createTurretAimState()
    this.rig.attach()
    this.rig.applyAim(this.aim)
    this.deps.host.addToScene(this.tractor.points)
    this.tractor.setTarget(this.rig.turretBase)
    this.deps.host.setActiveCamera(this.rig.camera)
    this.requestPointerLock()

    // Register belt asteroids for mining. If any step fails we log
    // and continue — beam won't hit anything but the FP view still works.
    try {
      this.yieldSystem = new RockYieldSystem({
        composition: [],
        seed: Date.now() | 0,
      })
      this.yieldSystem.onConsume = (spawnIndex) => {
        this.coordinator.notifyDepleted(spawnIndex)
      }
      this.yieldSystem.onMineralExtracted = (itemId, kg, spawnIndex) => {
        this.coordinator.acceptYield(itemId, kg, spawnIndex)
      }

      for (let beltIndex = 0; beltIndex < this.deps.beltControllers.length; beltIndex++) {
        const belt = this.deps.beltControllers[beltIndex]!
        for (const snap of belt.enumerateInstances()) {
          const tier = pickTier(snap.radius)
          const handle: TurretInstanceHandle = {
            beltIndex,
            beltMeshIndex: snap.beltMeshIndex,
            localIndex: snap.localIndex,
            localPosition: snap.localPosition.clone(),
            worldPosition: snap.worldPosition.clone(),
            radius: snap.radius,
            tierId: tier.id,
          }
          const spawnIndex = this.coordinator.register(handle)
          this.yieldSystem.registerRock({
            spawnIndex,
            diameter: snap.radius * 2,
            compositionOverride: tier.composition,
            totalKgOverride: tier.hpKg,
          })
        }
      }
      this.rebuildTargetList()
    } catch (err) {
      console.error('[TurretSession] belt registration failed:', err)
    }
  }

  private handleClose(): void {
    this.exitPointerLock()
    this.deps.host.setActiveCamera(null)
    this.deps.host.removeFromScene(this.tractor.points)
    this.rig.detach()
    this.coordinator.clear()
    this.targetInstances.length = 0
    this.yieldSystem = null
    this.firing = false
    this.mouseFireHeld = false
    // Restore shuttle input; we never froze physics so there's nothing to unfreeze.
    this.deps.shuttleController.setInputEnabled(true)
  }

  private handleActiveTick(_input: TurretSessionTickInput, dt: number): void {
    this.aim = tickTurretAim(this.aim, { mouseDx: this.mouseDx, mouseDy: this.mouseDy })
    this.mouseDx = 0
    this.mouseDy = 0
    this.rig.applyAim(this.aim)

    // Refresh asteroid world positions — the belt rotates while turret is
    // active, so cached snapshots drift each frame. Then raycast.
    this.refreshTargetWorldPositions()
    // Crosshair reflects target validity whether or not we're firing (FPS
    // convention).
    this.rig.camera.getWorldPosition(this.rayOrigin)
    this.rig.camera.getWorldDirection(this.rayDir)
    const hit = raycastBeam(
      this.rayOrigin,
      this.rayDir,
      TURRET_BEAM_MAX_RANGE,
      this.targetInstances,
    )
    const reticleValid = hit !== null

    this.firing = this.mouseFireHeld
    const thrusterSystem = this.deps.shuttleController.thrusterSystem
    const modifiers = this.buildThrusterModifiers()
    const canFire = thrusterSystem.canFire('turretMining' as ShuttleThrusterName, modifiers)
    const beamActive = this.firing && canFire

    if (beamActive) {
      const length = hit?.distance ?? TURRET_BEAM_MAX_RANGE
      this.rig.showBeam(length)
      if (hit && this.yieldSystem) {
        const yieldMult = getCurrentUpgradeValue('turretMiningYield')
        const kg = TURRET_BEAM_DPS * dt * yieldMult
        this.yieldSystem.mineRock(hit.spawnIndex, kg)
      }
    } else {
      this.rig.hideBeam()
    }
    this.deps.onHudState?.({ phase: this.session.phase, reticleValid })

    const activeRecord: Record<ShuttleThrusterName, boolean> = {
      thrust: false,
      brake: false,
      rcs: false,
      turretMining: beamActive,
    }
    thrusterSystem.tick(dt, activeRecord, modifiers)

    this.tractor.tick(dt)
  }

  private buildThrusterModifiers(): ThrusterRuntimeModifiers<ShuttleThrusterName> {
    const efficiency = getCurrentUpgradeValue('turretMiningEfficiency')
    return { fuelCostMultiplier: { turretMining: efficiency } }
  }

  /** Rebuild `targetInstances` from the coordinator — called after registration or depletion. */
  private rebuildTargetList(): void {
    this.targetInstances.length = 0
    for (const { spawnIndex, handle } of this.coordinator.listInstances()) {
      this.targetInstances.push({
        spawnIndex,
        worldPosition: handle.worldPosition,
        radius: handle.radius,
      })
    }
  }

  /**
   * Refresh every registered asteroid's `worldPosition` from its stored
   * belt-local position via the belt group's current matrix. Called each
   * active tick so the raycast tracks belt rotation while the ship coasts.
   */
  private refreshTargetWorldPositions(): void {
    for (const { handle } of this.coordinator.listInstances()) {
      const belt = this.deps.beltControllers[handle.beltIndex]
      if (!belt) continue
      belt.projectInstanceToWorld(handle.localPosition, handle.worldPosition)
    }
  }

  private onInstanceConsumed(handle: TurretInstanceHandle): void {
    const belt = this.deps.beltControllers[handle.beltIndex]
    belt?.hideInstance(handle.beltMeshIndex, handle.localIndex)
    this.tractor.spawnBurst(handle.worldPosition)
    this.rebuildTargetList()
  }

  // ----- commit path -----

  private commitOneUnit(itemId: string): { ok: true } | { ok: false; reason: string } {
    const inventory = loadInventory()
    if (!inventory) return { ok: false, reason: 'Inventory unavailable' }
    const result = addItem(inventory, itemId, 1)
    if (!result.ok) return { ok: false, reason: result.reason ?? 'Inventory full' }
    saveInventory(result.inventory)
    const def = getItemDefinition(itemId)
    this.deps.onResourcePickup?.(itemId, 1, def?.label ?? itemId)
    return { ok: true }
  }

  // ----- mouse + pointer lock plumbing -----

  private mouseMoveHandler = (event: MouseEvent): void => {
    if (!this.session.isActive || this.session.phase !== 'active') return
    if (document.pointerLockElement !== this.deps.host.renderer.domElement) return
    this.mouseDx += event.movementX
    this.mouseDy += event.movementY
  }

  private mouseDownHandler = (event: MouseEvent): void => {
    if (event.button !== 0) return
    if (!this.session.isActive || this.session.phase !== 'active') return
    this.mouseFireHeld = true
  }

  private mouseUpHandler = (event: MouseEvent): void => {
    if (event.button !== 0) return
    this.mouseFireHeld = false
  }

  private attachMouseListener(): void {
    // Use document-level listeners with capture so page UI (buttons, overlays)
    // can't swallow the click before the turret sees it.
    document.addEventListener('mousemove', this.mouseMoveHandler, true)
    document.addEventListener('mousedown', this.mouseDownHandler, true)
    document.addEventListener('mouseup', this.mouseUpHandler, true)
  }

  private detachMouseListener(): void {
    document.removeEventListener('mousemove', this.mouseMoveHandler, true)
    document.removeEventListener('mousedown', this.mouseDownHandler, true)
    document.removeEventListener('mouseup', this.mouseUpHandler, true)
    this.mouseFireHeld = false
  }

  private requestPointerLock(): void {
    this.deps.host.renderer.domElement.requestPointerLock?.()
  }

  private exitPointerLock(): void {
    if (document.pointerLockElement === this.deps.host.renderer.domElement) {
      document.exitPointerLock?.()
    }
  }
}
