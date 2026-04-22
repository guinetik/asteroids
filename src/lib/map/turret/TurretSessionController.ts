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
import { getItemDefinition } from '@/lib/inventory/catalog'
import { getCurrentTurretMiningChargeMultiplier, getCurrentUpgradeValue } from '@/lib/upgrades'
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
import {
  COMPOSITION_TINT_SEED,
  getCompositionTintColor,
  getTurretBeltId,
  instanceSalt,
} from './compositionTint'
import { TurretRigController } from '@/three/TurretRigController'
import { TurretTractorEmitter } from '@/three/TurretTractorEmitter'
import { ParticleEmitter } from '@/three/ParticleEmitter'
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
  /** Commit one whole unit into the live map inventory state. */
  commitInventoryUnit: (itemId: string) => { ok: true } | { ok: false; reason: string }
  /** Called when a mineral unit is committed. HUD + audio hook. */
  onResourcePickup?: (itemId: string, quantity: number, label: string) => void
  /** Called on commit failure (inventory full). HUD toast hook. */
  onResourcePickupFailed?: (label: string, reason: string) => void
  /** Called once on the rising edge of beam activation (not every frame). */
  onBeamActivated?: () => void
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
  /** Active target details for the HUD panel; null when nothing is under the reticle. */
  target: TurretHudTarget | null
  /** Current turret charge ratio (0..1) for heat/cooldown messaging. */
  chargeRatio: number
  /** Minimum ratio required before the beam can re-arm after cooling. */
  relockRatio: number
  /** Optional status message surfaced by the turret HUD. */
  statusLabel: string | null
}

/** Extra target metadata surfaced to the Vue turret HUD. */
export interface TurretHudTarget {
  /** Human-readable label for the currently rolled mineral. */
  label: string
  /** Remaining HP of this asteroid in kg. */
  remainingKg: number
  /** Total HP of this asteroid in kg. */
  totalKg: number
  /** Composition summary for the current asteroid tier. */
  compositionLabel: string
}

/**
 * Orchestrates the full turret session. Construct once at first entry,
 * keep alive for the page; `open()` is idempotent via the internal
 * {@link TurretSession}.
 */
export class TurretSessionController {
  private static readonly IMPACT_SPARK_INTERVAL_SEC = 1 / 24
  private static readonly RELOCK_RATIO = 0.5
  private readonly deps: TurretSessionControllerDeps
  private readonly session: TurretSession
  private readonly rig: TurretRigController
  private readonly tractor: TurretTractorEmitter
  private readonly impactEmitter: ParticleEmitter
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
  private readonly impactPos = new THREE.Vector3()
  private readonly impactVel = new THREE.Vector3()
  private readonly impactRight = new THREE.Vector3()
  private readonly impactUp = new THREE.Vector3()
  private sparkBurstCooldown = 0
  private beamLatched = false
  private overheatLocked = false
  private prevBeamActive = false

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
    this.impactEmitter = new ParticleEmitter({
      poolSize: 180,
      color: new THREE.Color(0xffbf7a),
      size: 8.5,
      lifetime: 0.38,
      spread: 3.8,
      opacity: 0.95,
      soft: true,
      sizeAttenuation: false,
      sizeGrowth: 0.55,
    })
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
      this.deps.onHudState?.({
        phase: this.session.phase,
        reticleValid: false,
        target: null,
        chargeRatio: 0,
        relockRatio: TurretSessionController.RELOCK_RATIO,
        statusLabel: null,
      })
    }
  }

  /** Dispose on shutdown. */
  dispose(): void {
    this.rig.dispose()
    this.tractor.dispose()
    this.impactEmitter.dispose()
    this.inputManager.dispose()
    this.detachMouseListener()
  }

  // ----- internals -----

  private handleOpen(): void {
    // Pause everything — ship physics, orrery simulation (belts/planets/sun),
    // time. The whole world stops until the player exits turret mode. Keeps
    // aiming predictable: rocks stay where they are.
    this.deps.shuttleController.setInputEnabled(false)
    this.deps.shuttleController.freeze()

    // Visual setup, so even if mining registration throws we still show the
    // turret view instead of silently reverting to the map view.
    this.aim = createTurretAimState()
    this.rig.attach()
    this.rig.applyAim(this.aim)
    this.deps.host.addToScene(this.tractor.points)
    this.deps.host.addToScene(this.impactEmitter.points)
    this.tractor.setTarget(this.rig.turretBase)
    this.impactEmitter.reset()
    this.sparkBurstCooldown = 0
    this.beamLatched = false
    this.overheatLocked = false
    this.prevBeamActive = false
    this.deps.host.setActiveCamera(this.rig.camera)
    this.requestPointerLock()

    // Register belt asteroids for mining. If any step fails we log
    // and continue — beam won't hit anything but the FP view still works.
    try {
      this.yieldSystem = new RockYieldSystem({
        composition: [],
        seed: COMPOSITION_TINT_SEED,
      })
      this.yieldSystem.onConsume = (spawnIndex) => {
        this.coordinator.notifyDepleted(spawnIndex)
      }
      this.yieldSystem.onMineralExtracted = (itemId, kg, spawnIndex) => {
        this.coordinator.acceptYield(itemId, kg, spawnIndex)
      }

      for (let beltIndex = 0; beltIndex < this.deps.beltControllers.length; beltIndex++) {
        const belt = this.deps.beltControllers[beltIndex]!
        // Belts without a turret tier table (decorative belts, if any) are
        // skipped so neither the beam nor the HUD tries to interpret them.
        const turretBeltId = getTurretBeltId(belt)
        if (!turretBeltId) continue
        for (const snap of belt.enumerateInstances()) {
          const tier = pickTier(snap.radius, turretBeltId)
          const handle: TurretInstanceHandle = {
            beltIndex,
            beltMeshIndex: snap.beltMeshIndex,
            localIndex: snap.localIndex,
            localPosition: snap.localPosition.clone(),
            worldPosition: snap.worldPosition.clone(),
            radius: snap.radius,
            tierId: tier.id,
            compositionLabel: this.formatCompositionLabel(tier.composition),
          }
          // Stable salt shared with the map-init tint pass so the mineral this
          // session rolls matches the tint the player already saw on approach.
          const spawnIndex = this.coordinator.register(
            instanceSalt(beltIndex, snap.beltMeshIndex, snap.localIndex),
            handle,
          )
          this.yieldSystem.registerRock({
            spawnIndex,
            diameter: snap.radius * 2,
            compositionOverride: tier.composition,
            totalKgOverride: tier.hpKg,
          })
          const roll = this.yieldSystem.peekRock(spawnIndex)
          if (roll) {
            belt.setInstanceBaseTint(
              snap.beltMeshIndex,
              snap.localIndex,
              getCompositionTintColor(roll.itemId),
            )
          }
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
    this.deps.host.removeFromScene(this.impactEmitter.points)
    this.rig.detach()
    this.coordinator.clear()
    this.targetInstances.length = 0
    this.yieldSystem = null
    this.firing = false
    this.mouseFireHeld = false
    this.beamLatched = false
    this.overheatLocked = false
    this.prevBeamActive = false
    this.impactEmitter.reset()
    this.sparkBurstCooldown = 0
    this.deps.shuttleController.unfreeze()
    this.deps.shuttleController.setInputEnabled(true)
  }

  private handleActiveTick(_input: TurretSessionTickInput, dt: number): void {
    this.sparkBurstCooldown = Math.max(0, this.sparkBurstCooldown - dt)
    for (const belt of this.deps.beltControllers) belt.tickMiningFeedback(dt)

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
    let target: TurretHudTarget | null = null
    if (hit && this.yieldSystem) {
      const roll = this.yieldSystem.peekRock(hit.spawnIndex)
      const handle = this.coordinator.resolveInstance(hit.spawnIndex)
      if (roll && handle) {
        const def = getItemDefinition(roll.itemId)
        target = {
          label: def?.label ?? roll.itemId,
          remainingKg: roll.remainingKg,
          totalKg: roll.totalKg,
          compositionLabel: handle.compositionLabel,
        }
      }
    }

    this.firing = this.mouseFireHeld
    const thrusterSystem = this.deps.shuttleController.thrusterSystem
    const modifiers = this.buildThrusterModifiers()
    const turretState = thrusterSystem.getState('turretMining' as ShuttleThrusterName)
    const chargeRatio =
      turretState.capacity > 0 ? turretState.charge / turretState.capacity : 0
    if (this.overheatLocked && chargeRatio >= TurretSessionController.RELOCK_RATIO) {
      this.overheatLocked = false
    }
    const canFire = thrusterSystem.canFire('turretMining' as ShuttleThrusterName, modifiers)
    const thresholdReady = chargeRatio >= TurretSessionController.RELOCK_RATIO

    if (!this.firing) {
      this.beamLatched = false
      if (chargeRatio < TurretSessionController.RELOCK_RATIO) {
        this.overheatLocked = true
      }
    } else if (!this.beamLatched && !this.overheatLocked && thresholdReady && canFire) {
      this.beamLatched = true
    }

    const beamActive = this.firing && this.beamLatched && canFire

    if (beamActive && !this.prevBeamActive) {
      this.deps.onBeamActivated?.()
    }
    this.prevBeamActive = beamActive

    if (beamActive) {
      const length = hit?.distance ?? TURRET_BEAM_MAX_RANGE
      const impactInset = hit
        ? Math.min(
          Math.max((this.coordinator.resolveInstance(hit.spawnIndex)?.radius ?? 0) * 0.35, 0.12),
          0.75,
        )
        : 0
      this.rig.showBeam(length, impactInset)
      if (hit && this.yieldSystem) {
        const handle = this.coordinator.resolveInstance(hit.spawnIndex)
        if (handle) {
          this.deps.beltControllers[handle.beltIndex]?.flashMiningHit(
            handle.beltMeshIndex,
            handle.localIndex,
          )
        }
        this.spawnImpactSparks(length, impactInset)
        const yieldMult = getCurrentUpgradeValue('turretMiningYield')
        const kg = TURRET_BEAM_DPS * dt * yieldMult
        this.yieldSystem.mineRock(hit.spawnIndex, kg)
      }
    } else {
      this.rig.hideBeam()
    }
    if (this.beamLatched && !beamActive) {
      this.beamLatched = false
      if (chargeRatio < TurretSessionController.RELOCK_RATIO) {
        this.overheatLocked = true
      }
    }

    const statusLabel = this.overheatLocked
      ? `OVERHEATED - COOL TO ${Math.round(TurretSessionController.RELOCK_RATIO * 100)}%`
      : !this.beamLatched && this.firing && !thresholdReady
        ? `CHARGE ${Math.round(chargeRatio * 100)}% / ${Math.round(
          TurretSessionController.RELOCK_RATIO * 100,
        )}%`
        : null
    this.deps.onHudState?.({
      phase: this.session.phase,
      reticleValid,
      target,
      chargeRatio,
      relockRatio: TurretSessionController.RELOCK_RATIO,
      statusLabel,
    })

    const activeRecord: Record<ShuttleThrusterName, boolean> = {
      thrust: false,
      brake: false,
      rcs: false,
      turretMining: beamActive,
    }
    thrusterSystem.tick(dt, activeRecord, modifiers)

    this.tractor.tick(dt)
    this.impactEmitter.tick(dt)
  }

  private buildThrusterModifiers(): ThrusterRuntimeModifiers<ShuttleThrusterName> {
    const efficiency = getCurrentUpgradeValue('turretMiningEfficiency')
    const recharge = getCurrentTurretMiningChargeMultiplier()
    return {
      fuelCostMultiplier: { turretMining: efficiency },
      rechargeRateMultiplier: { turretMining: recharge },
    }
  }

  /** Build a compact composition string for the HUD from the registered loot table. */
  private formatCompositionLabel(
    composition: readonly { name: string; percentage: number }[],
  ): string {
    return composition
      .slice()
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 3)
      .map((entry) => `${entry.name} ${Math.round(entry.percentage)}%`)
      .join(' • ')
  }

  /** Emit a tiny spark spray at the beam contact point, matching FPS mining impacts. */
  private spawnImpactSparks(length: number, impactInset: number): void {
    if (this.sparkBurstCooldown > 0) return
    this.sparkBurstCooldown = TurretSessionController.IMPACT_SPARK_INTERVAL_SEC

    this.impactPos.copy(this.rayDir).multiplyScalar(length + impactInset).add(this.rayOrigin)
    this.impactRight.crossVectors(this.rayDir, THREE.Object3D.DEFAULT_UP)
    if (this.impactRight.lengthSq() < 1e-4) {
      this.impactRight.set(1, 0, 0)
    } else {
      this.impactRight.normalize()
    }
    this.impactUp.crossVectors(this.impactRight, this.rayDir).normalize()

    for (let i = 0; i < 10; i++) {
      const lateral = (Math.random() - 0.5) * 3.8
      const vertical = Math.random() * 3.2
      const rebound = 4.6 + Math.random() * 4.4
      this.impactVel.copy(this.rayDir).multiplyScalar(-rebound)
      this.impactVel.addScaledVector(this.impactRight, lateral)
      this.impactVel.addScaledVector(this.impactUp, vertical)
      this.impactEmitter.emit(this.impactPos, this.impactVel)
    }
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
    const result = this.deps.commitInventoryUnit(itemId)
    if (!result.ok) return result
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
