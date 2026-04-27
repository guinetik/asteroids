/**
 * Map EVA first-person multitool: pointer lock, {@link MultiToolState}, projectiles, impact
 * VFX, and HUD telemetry merge — logic pulled from {@link MapViewController} so the view
 * stays an orchestration shell.
 *
 * The facade does not own {@link EvaSession}; the host injects it via
 * {@link MapEvaMultitoolFacadeDeps}.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-05-map-shuttle-player-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { TickHandler } from '@/lib/TickHandler'
import type { FpsTelemetry } from '@/lib/ui/fpsHudTypes'
import { TICK_PRIORITY_PHYSICS, TICK_PRIORITY_RENDER } from '@/lib/tickPriorities'
import { FpsPointerLockSession } from '@/lib/fps/FpsPointerLockSession'
import { buildMultiToolConfig } from '@/lib/fps/buildMultiToolConfig'
import { MultiToolState } from '@/lib/fps/multiToolState'
import {
  type MapEvaShuttleHullHealTarget,
  type ProjectileImpactContext,
  ProjectileSystem,
} from '@/lib/fps/projectileSystem'
import { ParticleEmitter } from '@/three/ParticleEmitter'
import { MultiToolController } from '@/three/MultiToolController'
import type { EvaSession } from '@/three/EvaSession'
import type { MapSceneObjects } from '@/three/MapSceneSetup'
import multiToolConfigJson from '@/data/fps/multitool-config.json'
import { createEvaMapProjectileHeightmap } from '@/lib/map/eva/evaMapProjectileHeightmap'
import type { Heightmap } from '@/lib/terrain/heightmap'

/** Pool size for map EVA bolt impact sparks. */
const EVA_MAP_IMPACT_EMITTER_POOL = 64

/** Spark burst count on synthetic terrain impact. */
const EVA_MAP_IMPACT_SPARK_COUNT = 8
/** Sparks on science-bolt contact with the EVA-scaled shuttle hull (repair). */
const EVA_HULL_HEAL_IMPACT_SPARK_COUNT = 8
/** Muted green, distinct from the default EVA map impact amber. */
const EVA_HULL_HEAL_IMPACT_COLOR = 0x55ee99
/** Pool for hull-heal impact sparks. */
const EVA_HULL_HEAL_IMPACT_EMITTER_POOL = 48

/** deps for {@link MapEvaMultitoolFacade}. */
export interface MapEvaMultitoolFacadeDeps {
  /** Live EVA session; null before init or after dispose. */
  getEvaSession: () => EvaSession | null
  /** Compositor + scene; null only during very early init. */
  getSceneObjects: () => MapSceneObjects | null
  /** Main loop tick graph; null before {@link MapViewController.init}. */
  getTickHandler: () => TickHandler | null
  /**
   * Multitool damage upgrade — forwarded to {@link ProjectileSystem.setDamageMultiplier}.
   * Example: `getCurrentUpgradeValue('multitoolDamage')`.
   */
  getMultitoolDamageMultiplier: () => number
  /**
   * Science-bolt repair vs the tactical shuttle hull during map EVA; return null to skip
   * registration. Methods read live `evaVehicleReturnBounds` and {@link ShipHealth} each tick.
   */
  getEvaMapHullHealTarget: () => MapEvaShuttleHullHealTarget | null
}

/**
 * Science multitool + level-parity shooting for solar-map EVA.
 */
export class MapEvaMultitoolFacade {
  private deps: MapEvaMultitoolFacadeDeps | null = null
  private evaViewModel: MultiToolController | null = null
  private viewModelLoadGeneration = 0
  private readonly pointerLock = new FpsPointerLockSession()
  private multiToolState: MultiToolState | null = null
  private projectileSystem: ProjectileSystem | null = null
  private impactEmitter: ParticleEmitter | null = null
  /** Green sparks when a science bolt repairs the huge-scale shuttle hull. */
  private hullHealImpactEmitter: ParticleEmitter | null = null
  private projectileHeightmap: Heightmap | null = null
  private readonly impactVel = new THREE.Vector3()
  private readonly impactUp = new THREE.Vector3(0, 1, 0)

  /** Per-frame viewmodel + input sync; register at `TICK_PRIORITY_RENDER - 1`. */
  readonly frameSync: Tickable = { tick: (dt) => this.syncFrame(dt) }

  /**
   * Wire the facade; safe to call once after {@link MapSceneObjects} exists.
   *
   * @param deps - Pull-style access to the host controller.
   */
  attach(deps: MapEvaMultitoolFacadeDeps): void {
    this.deps = deps
  }

  /**
   * Merges suit telemetry from the session with multi-tool state for the `evaMap` FPS HUD.
   *
   * @param base - Payload from {@link EvaSession} before tool overlay.
   * @returns HUD telemetry with tool RTG, mode charge, ADS, and firing.
   */
  mergeToolTelemetry(base: FpsTelemetry): FpsTelemetry {
    const mt = this.multiToolState
    const session = this.deps?.getEvaSession() ?? null
    if (!session?.isActive || !mt) {
      return base
    }
    return {
      ...base,
      activeMode: 'science',
      aiming: mt.aiming,
      isFiring: mt.isFiring,
      rtgLevel: mt.rtgLevel,
      rtgCapacity: mt.rtgCapacity,
      modeCharge: mt.modeCharge,
      modeCapacity: mt.modeChargeCapacity,
    }
  }

  /**
   * Creates pointer-lock, multitool state, projectiles, and impact VFX. Idempotent while
   * resources already exist.
   */
  setupEvaFiring(): void {
    const d = this.deps
    if (!d) return
    const scene = d.getSceneObjects()?.scene
    const th = d.getTickHandler()
    if (!scene || !th) {
      return
    }

    if (!this.projectileHeightmap) {
      this.projectileHeightmap = createEvaMapProjectileHeightmap()
    }
    if (!this.multiToolState) {
      this.multiToolState = new MultiToolState(buildMultiToolConfig())
      this.multiToolState.setMode('science')
      th.register(this.multiToolState, TICK_PRIORITY_PHYSICS + 1)
    }

    if (!this.impactEmitter) {
      this.impactEmitter = new ParticleEmitter({
        poolSize: EVA_MAP_IMPACT_EMITTER_POOL,
        color: new THREE.Color(0xffaa44),
        size: 6.5,
        lifetime: 0.6,
        spread: 12,
        opacity: 1,
        soft: true,
        sizeGrowth: 1.55,
      })
      scene.add(this.impactEmitter.points)
      th.register(this.impactEmitter, TICK_PRIORITY_PHYSICS + 3)
    }

    if (!this.hullHealImpactEmitter) {
      this.hullHealImpactEmitter = new ParticleEmitter({
        poolSize: EVA_HULL_HEAL_IMPACT_EMITTER_POOL,
        color: new THREE.Color(EVA_HULL_HEAL_IMPACT_COLOR),
        size: 6.5,
        lifetime: 0.55,
        spread: 12,
        opacity: 1,
        soft: true,
        sizeGrowth: 1.4,
      })
      scene.add(this.hullHealImpactEmitter.points)
      th.register(this.hullHealImpactEmitter, TICK_PRIORITY_PHYSICS + 3)
    }

    if (!this.projectileSystem) {
      this.projectileSystem = new ProjectileSystem(scene, this.projectileHeightmap)
      this.projectileSystem.setDamageMultiplier(d.getMultitoolDamageMultiplier())
      this.projectileSystem.setMapEvaShuttleHullHeal(d.getEvaMapHullHealTarget())
      this.projectileSystem.prewarmPool()
      this.projectileSystem.onImpact = (pos, context: ProjectileImpactContext) => {
        if (context.kind === 'shuttle_hull') {
          for (let i = 0; i < EVA_HULL_HEAL_IMPACT_SPARK_COUNT; i += 1) {
            this.impactVel.copy(this.impactUp).multiplyScalar(5)
            this.hullHealImpactEmitter?.emit(pos, this.impactVel)
          }
        } else {
          for (let i = 0; i < EVA_MAP_IMPACT_SPARK_COUNT; i += 1) {
            this.impactVel.copy(this.impactUp).multiplyScalar(5)
            this.impactEmitter?.emit(pos, this.impactVel)
          }
        }
      }
      th.register(this.projectileSystem, TICK_PRIORITY_PHYSICS + 2)
    } else {
      this.projectileSystem.setMapEvaShuttleHullHeal(d.getEvaMapHullHealTarget())
    }

    const canvas = d.getSceneObjects()?.renderer.domElement
    if (canvas) {
      this.pointerLock.attach(canvas, {})
    }
  }

  /**
   * Tears down firing subsystems and the 3D viewmodel; idempotent.
   */
  disposeEvaFiring(): void {
    this.pointerLock.releaseLock()
    this.pointerLock.detach()
    const d = this.deps
    const th = d?.getTickHandler() ?? null
    if (th) {
      if (this.multiToolState) {
        th.unregister(this.multiToolState)
        this.multiToolState = null
      }
      if (this.projectileSystem) {
        this.projectileSystem.setMapEvaShuttleHullHeal(null)
        this.projectileSystem.onImpact = null
        th.unregister(this.projectileSystem)
        this.projectileSystem.dispose()
        this.projectileSystem = null
      }
      if (this.impactEmitter) {
        th.unregister(this.impactEmitter)
        const so = d?.getSceneObjects()
        if (so?.scene) {
          so.scene.remove(this.impactEmitter.points)
        }
        this.impactEmitter.dispose()
        this.impactEmitter = null
      }
      if (this.hullHealImpactEmitter) {
        th.unregister(this.hullHealImpactEmitter)
        const so = d?.getSceneObjects()
        if (so?.scene) {
          so.scene.remove(this.hullHealImpactEmitter.points)
        }
        this.hullHealImpactEmitter.dispose()
        this.hullHealImpactEmitter = null
      }
    }
    this.disposeViewModel()
  }

  /**
   * Loads the GLTF multitool; stale async loads self-dispose. Call after
   * {@link setupEvaFiring} so the projectile system can be attached.
   */
  async loadViewModel(): Promise<void> {
    const d = this.deps
    if (!d) return
    const session = d.getEvaSession()
    const scene = d.getSceneObjects()?.scene
    if (!session || !scene) return
    const camera = session.getEvaFpsCamera()
    if (!camera) return
    const loadId = ++this.viewModelLoadGeneration
    if (this.evaViewModel) {
      this.evaViewModel.dispose()
      this.evaViewModel = null
    }
    const tool = new MultiToolController()
    await tool.load(camera, scene)
    if (loadId !== this.viewModelLoadGeneration) {
      tool.dispose()
      return
    }
    const scienceColor = (multiToolConfigJson as { modes: { science: { color: string } } }).modes
      .science.color
    tool.setMode(scienceColor, 'science')
    tool.setAiming(false)
    tool.setRtgLevel(1)
    tool.setModeChargeLevel(1)
    tool.setState(0, false, false)
    if (this.projectileSystem) {
      tool.setProjectileSystem(this.projectileSystem)
    }
    this.evaViewModel = tool
  }

  /**
   * Drives input, viewmodel, ADS on the EVA {@link FpsCamera}, and muzzle fire.
   *
   * @param dt - Frame delta in seconds.
   */
  private syncFrame(dt: number): void {
    const d = this.deps
    if (!d) return
    const session = d.getEvaSession()
    const pl = this.pointerLock
    const mt = this.multiToolState
    if (!session?.isActive || !mt) {
      return
    }

    if (session.isMinigameOpen) {
      mt.setAiming(false)
      mt.setInput(false, pl.consumeLeftMouseJustPressed())
      mt.setSpeed(session.getEvaPlayerSpeed())
      this.evaViewModel?.setVisible(false)
      return
    }

    mt.setMode('science')
    mt.setAiming(pl.isRightMouseDown)
    mt.setInput(pl.isLeftMouseDown, pl.consumeLeftMouseJustPressed())
    mt.setSpeed(session.getEvaPlayerSpeed())

    const tool = this.evaViewModel
    if (!tool) {
      return
    }

    tool.setVisible(true)
    const scienceColor = (multiToolConfigJson as { modes: { science: { color: string } } }).modes
      .science.color
    tool.setMode(scienceColor, mt.mode)
    tool.setAiming(mt.aiming)
    tool.setRtgLevel(mt.rtgLevel / mt.rtgCapacity)
    tool.setModeChargeLevel(mt.modeCharge / mt.modeChargeCapacity)
    if (mt.isFiring) {
      tool.fire()
    }

    const rig = session.getEvaFpsRig()
    if (rig) {
      const ads = mt.adsConfig
      rig.setAiming(mt.aiming, ads.fovMultiplier, ads.zoomSpeed)
    }

    tool.setState(session.getEvaPlayerSpeed(), false, false)
    tool.tick(dt)
  }

  /**
   * Unregisters the 3D viewmodel and cancels in-flight async loads.
   */
  private disposeViewModel(): void {
    this.viewModelLoadGeneration += 1
    if (this.evaViewModel) {
      this.evaViewModel.dispose()
      this.evaViewModel = null
    }
  }
}

/**
 * Register {@link MapEvaMultitoolFacade.frameSync} at this priority (after EVA camera tick).
 */
export const EVA_MAP_MULTITOOL_FRAME_SYNC_PRIORITY = TICK_PRIORITY_RENDER - 1
