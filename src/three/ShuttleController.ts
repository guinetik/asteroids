// src/three/ShuttleController.ts
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import type { Tickable } from '@/lib/Tickable'
import type { InputManager } from '@/lib/InputManager'
import type { SpaceTimeGrid } from './SpaceTimeGrid'
import { checkEventHorizon, type GravitySource, type GravityConfig } from '@/lib/physics/gravity'
import { ThrusterSystem, buildBuffedShuttleConfig } from '@/lib/physics/thrusterSystem'
import type { ShuttleThrusterName, ThrusterRuntimeModifiers } from '@/lib/physics/thrusterSystem'
import { applyShuttleBuffs } from '@/lib/shuttle/buffs'
import { loadProfile } from '@/lib/player/profile'
import { loadGLB } from './loadGLB'
import { FuelTank } from './FuelTank'
import { HabitatModule } from './HabitatModule'
import type { PortalVehicle } from './PortalArrivalSequence'
import shuttlePhysicsData from '@/data/shuttle/shuttle-physics.json'
import orbitConfig from '@/data/shuttle/orbit-capture.json'
import { getSlingshotSettleSpeed } from '@/lib/slingshotBurstProfile'
import { getSlingshotAutoAlignYaw, getVelocityHeading } from '@/lib/slingshotAutoAlign'
import {
  getCurrentShuttleThrusterEfficiencyModifiers,
  getCurrentShuttleThrusterChargeModifiers,
  getCurrentShuttleSlingshotCruiseSpeedMultiplier,
  getCurrentUpgradeValue,
} from '@/lib/upgrades'
import { findCosmeticOptionById } from '@/lib/cosmetics/catalog'
import { getPlayerCosmetics } from '@/lib/cosmetics/profileCosmetics'
import type {
  CosmeticFinishChannel,
  CosmeticFinishProfile,
  CosmeticRim,
} from '@/lib/cosmetics/types'
import type { PlayerProfile } from '@/lib/player/types'
import {
  applyLanderPaintMaterialsFromProfile,
  cloneAndCollectLanderPaintMaterials,
  type LanderPaintMaterialTarget,
} from '@/three/cosmetics/landerPaintMaterials'
import {
  applyPaintRampShader,
  buildPaintRampTexture,
  computeMeshToVehicleLocal,
  computePaintRampBounds,
  setPaintRampRim,
  setPaintRampStrength,
  updatePaintRampTexture,
  type PaintRampBounds,
} from '@/three/cosmetics/paintRampShader'
/** Any object that can exert gravity on the shuttle */
export interface GravityWell {
  getGravityAt(position: THREE.Vector3): THREE.Vector3
}

/** Tuning knobs for shuttle flight physics. Loaded from shuttle-physics.json. */
export interface ShuttlePhysicsConfig {
  /** Forward acceleration per second */
  thrustForce: number
  /** Velocity multiplier while braking (0–1, lower = stronger brake) */
  brakeFactor: number
  /** Brake effectiveness lost per unit of gravity well depth */
  brakeDepthPenalty: number
  /** Angular acceleration (rad/s²) */
  yawTorque: number
  /** Lateral RCS push force */
  yawLateralForce: number
  /** Maximum angular velocity (rad/s) */
  yawMaxSpeed: number
  /** Angular velocity damping per frame (0–1) */
  yawDamping: number
  /**
   * Reference speed for slingshot decay / protection — not a hard cap while thrusting.
   */
  maxThrustSpeed: number
  /** Absolute speed cap (gravity can exceed thrust cap up to this) */
  maxGravitySpeed: number
  /**
   * Main-engine thrust multiplier when velocity is perpendicular to the nose on the XZ plane
   * (or backward) — penalizes turn-and-burn. Near-stationary uses max multiplier instead.
   */
  thrustAlignMinMultiplier: number
  /**
   * Main-engine thrust multiplier when velocity aligns with nose forward (drift angle 0).
   * Values above 1 give a small on-heading boost.
   */
  thrustAlignMaxMultiplier: number
  /**
   * RCS lateral multiplier when planar velocity is perpendicular to the push direction
   * (typical yaw-while-coasting: velocity along nose, push on port/starboard). Kept slightly
   * below {@link rcsAlignMaxMultiplier} so aiding/fighting existing sideways drift stays a bit stronger.
   */
  rcsAlignMinMultiplier: number
  /**
   * RCS lateral multiplier when planar velocity is parallel to the active RCS push axis
   * (|velocitŷ · pushDir| → 1).
   */
  rcsAlignMaxMultiplier: number
  /**
   * Per-second rate at which speed **above** the cruise equilibrium decays exponentially
   * toward it (preserves heading). Set to 0 to disable. Skipped under slingshot speed protection.
   */
  speedExcessReturnRate: number
  /**
   * Cruise speed maneuvering bleeds back toward. Defaults to {@link maxThrustSpeed} when omitted.
   */
  speedReturnEquilibriumSpeed?: number
}

/** Default physics for the shuttle scene. */
export const SHUTTLE_PHYSICS: ShuttlePhysicsConfig =
  shuttlePhysicsData.shuttle as ShuttlePhysicsConfig

/** Scaled-down physics for the map scene (solar system hub). */
export const MAP_PHYSICS: ShuttlePhysicsConfig = shuttlePhysicsData.map as ShuttlePhysicsConfig

const SPAWN_MIN_RADIUS = 400
const SPAWN_MAX_RADIUS = 1500
const DEATH_PULL_ACCELERATION = 30 // accelerates as it falls in
const DEATH_MAX_PULL_SPEED = 120

/**
 * Below this planar speed we treat velocity as undefined for thrust alignment (full max multiplier).
 */
const SHUTTLE_VELOCITY_ALIGN_EPSILON = 1e-4

/**
 * Slingshot speed protection compares planar speed to the internal slingshot floor. Without slack,
 * float noise or ordering vs. the settle ramp can drop protection for a frame; map mode then applies
 * {@link ShuttlePhysicsConfig.maxGravitySpeed} and a fast
 * {@link ShuttlePhysicsConfig.speedExcessReturnRate}, collapsing a high burst to the map gravity cap.
 */
const SLINGSHOT_PROTECT_SPEED_EPSILON = 0.02

const SHUTTLE_MODEL_PATH = '/models/shuttle.glb'
const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/'

/** NASA model is in centimeters (~1400 units across). Scale to meters. */
const MODEL_SCALE = 0.01

/**
 * Model orientation correction for top-down view.
 * Raw model: X=nose-to-tail (14.7), Y=wingspan (9.4), Z=height (5.5).
 * We need the shuttle flat on XZ plane with tail fin pointing up (+Y).
 * Rotate -90 deg around X to swap Y↔Z, so wingspan goes to Z and height to Y.
 */
const MODEL_ROTATION_X = -Math.PI / 2

/**
 * Engine nozzle positions in raw model coordinates (pre-scale).
 * 3 SSME nozzles arranged in a triangle: one top-center, two bottom-sides.
 */
const ENG_POSITIONS: [number, number, number][] = [
  [-510, 0, 72], // top center
  [-510, -52, -46], // bottom left
  [-510, 52, -46], // bottom right
]

const DOOR_OPEN_ANGLE = Math.PI * 0.6 // ~108 degrees, payload bay doors open wide
const DOOR_ANIM_SPEED = 2 // radians per second

/** Map EVA science-bolt hull repair — green emissive flash (see {@link LanderController} heal). */
const HULL_HEAL_PULSE_DURATION = 0.25
const HULL_HEAL_PULSE_PEAK_INTENSITY = 1.6

const LANDER_MODEL_PATH = '/models/lander.glb'
/** Scale the lander to fit inside the cargo bay (in raw shuttle cm space) */
const CARGO_LANDER_SCALE = 30
/** Position inside the bay — raw model coords (cm), pre-rotation: X=nose-tail, Y=wingspan, Z=height */
const CARGO_LANDER_OFFSET = new THREE.Vector3(-320, 0, 20)
const SHUTTLE_HULL_MIN_ROUGHNESS = 0.9
const SHUTTLE_HULL_MAX_METALNESS = 0.04
const SHUTTLE_HULL_MAX_ENV_MAP_INTENSITY = 0.12
const SHUTTLE_HULL_MAX_EMISSIVE_INTENSITY = 0
const SHUTTLE_HULL_MAX_CLEARCOAT = 0.02
const SHUTTLE_HULL_MIN_CLEARCOAT_ROUGHNESS = 0.94
const SHUTTLE_HULL_MAX_PHONG_SHININESS = 3
const SHUTTLE_HULL_PHONG_SPECULAR_SCALE = 0.12
/**
 * Scalar applied to the hull albedo so the summed diffuse contribution from ambient,
 * hemisphere, directional, sun, and camera-fill lights can't blow past the map bloom
 * threshold when the turret camera is mounted on the nose and yawed back at the hull.
 */
const SHUTTLE_HULL_COLOR_SCALE = 0.7
const SHUTTLE_PAINT_PRIMARY_MATERIALS = new Set([
  'wingtop',
  'wing flap top',
  'nose top',
  'side stb',
  'side prt',
  'OMS pod stb',
  'OMS pod prt',
  'tail',
  'shut-doors-top',
  'shut-doors-side',
])
const SHUTTLE_PAINT_SECONDARY_MATERIALS = new Set([
  'belly',
  'belly flap',
  'fusolage aft eng',
  'OMS pod prt back',
  'OMS pod stb back',
  'OMS pods side',
  'RCS aft stb',
  'RCS aft prt',
])
const SHUTTLE_PAINT_TRIM_MATERIALS = new Set([
  'nose tip',
  'bay prt wedges',
  'bay stb wedges',
  'bay prt edges',
  'bay stb edges',
  'doors edge',
  'cockpit side',
])
const SHUTTLE_PAINT_ACCENT_MATERIALS = new Set([
  'shut-handrails',
  'arrows top',
  'shut-cam-cargo',
  'bay prt evarail',
  'bay stb evarail',
  'bay prt doorlatc',
  'bay stb doorlatc',
  'eng out',
])
/**
 * Multiplier applied to per-channel paint colors before they replace the GLB
 * albedo. `1.0` keeps the catalog hex value as-is; lower values dim it. Tuned
 * up from the legacy `0.88` so paid paints read at full chroma now that the
 * stock diffuse map no longer competes with them.
 */
const SHUTTLE_PAINT_COLOR_STRENGTH = 1.0
/** Shuttle gradient ramp flows nose→tail along the raw GLB X axis. */
const SHUTTLE_PAINT_RAMP_AXIS = 'x' as const
/**
 * Ramp tint strength used in REPLACE mode (paid paints, where the GLB diffuse
 * map has been dropped). Higher than the legacy tint-mode value because the
 * stock panel-line texture is no longer competing with the gradient.
 */
const SHUTTLE_PAINT_RAMP_STRENGTH_REPLACE = 0.35
/**
 * Procedural panel-seam + scuff overlay strength in REPLACE mode. Drives the
 * `paintDetail` branch of the ramp shader, simulating the panel detail that
 * the dropped diffuse map used to provide.
 */
const SHUTTLE_PAINT_DETAIL_STRENGTH_REPLACE = 0.55
/**
 * Self-illumination strength used in REPLACE mode. Adds `paintColor * this`
 * to `totalEmissiveRadiance` so even unlit faces (dark side of a planet) keep
 * a faint pulse of the paint color. Tuned high enough to compensate for the
 * brightness lost when the GLB diffuse map is dropped.
 */
const SHUTTLE_PAINT_BASE_GLOW_REPLACE = 0.2
/**
 * Saturation push (additive HSL S) applied to per-channel paint colors in
 * REPLACE mode. Helps GLB albedos that were authored greyer than their JSON
 * gradient stops actually pop on the hull.
 */
const SHUTTLE_PAINT_SATURATION_BOOST = 0.12
/**
 * Default finish merged into every paid paint when the catalog row leaves
 * `finish` blank or only specifies some channels. Tuned slightly more metallic
 * than the legacy GLB defaults so paints feel like a fresh coat.
 */
const SHUTTLE_PAINT_FINISH_FALLBACK: Required<
  Pick<CosmeticFinishChannel, 'metalness' | 'roughness' | 'envMapIntensity'>
> = {
  metalness: 0.55,
  roughness: 0.4,
  envMapIntensity: 1.2,
}
/** Reusable HSL bag — avoid allocating one per material per paint apply. */
const SHUTTLE_PAINT_HSL_BAG = { h: 0, s: 0, l: 0 }
/** Reusable scratch color used when resolving rim configs to runtime uniforms. */
const SHUTTLE_PAINT_RIM_SCRATCH = new THREE.Color()
/** Default rim Fresnel exponent when a paint omits `rim.power`. */
const SHUTTLE_PAINT_RIM_DEFAULT_POWER = 2.5
/**
 * Catalog id of the bundled "Factory Stock" shuttle paint row. Selecting this
 * option restores the authored GLB albedo + diffuse map and disables the ramp
 * + detail overlay.
 */
const SHUTTLE_FACTORY_STOCK_OPTION_ID = 'shuttle-paintjob-factory-stock'

/**
 * Controls the shuttle model — loading, door animation, movement, and nozzle placement.
 * Implements Tickable for per-frame physics and animation updates.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
export class ShuttleController implements Tickable, PortalVehicle {
  readonly group = new THREE.Group()

  private doorsOpen = false
  private doorProgress = 0 // 0 = closed, 1 = open
  private doorPortNode: THREE.Object3D | null = null
  private doorStbNode: THREE.Object3D | null = null
  private doorPortClosedRotX = 0
  private doorStbClosedRotX = 0
  private velocity = new THREE.Vector3()
  private frozen = false
  private ignoreGridY = false
  private externalBrakeActive = false

  /** Inject an external velocity (e.g. portal ejection). */
  setVelocity(v: THREE.Vector3): void {
    this.velocity.copy(v)
  }

  /** Freeze the shuttle — skips movement updates (used during portal summoning). */
  freeze(): void {
    this.frozen = true
  }

  /** Unfreeze the shuttle — resumes normal movement. */
  unfreeze(): void {
    this.frozen = false
  }

  /** Lock Y to 0, ignoring spacetime grid deformation (used during portal collapse). */
  setIgnoreGridY(ignore: boolean): void {
    this.ignoreGridY = ignore
  }

  /** Enable or disable player input (autopilot takeover during approach). */
  setInputEnabled(enabled: boolean): void {
    this._inputEnabled = enabled
  }

  /** Drive brake VFX/resource state from an external controller while movement is frozen. */
  setExternalBrakeActive(active: boolean): void {
    this.externalBrakeActive = active
  }

  /** Whether player input is currently enabled. */
  get inputEnabled(): boolean {
    return this._inputEnabled
  }

  /** True while the slingshot burst is settling and input remains locked. */
  get slingshotBurstActive(): boolean {
    return (
      this._slingshotSettleDuration > 0 &&
      this._slingshotSettleElapsed < this._slingshotSettleDuration
    )
  }

  /** True while the post-launch burst VFX should keep emitting. */
  get slingshotLaunchFxActive(): boolean {
    return this._slingshotLaunchFxRemaining > 0
  }

  /** Slingshot burst progress from 0 (just launched) to 1 (settle complete). */
  get slingshotBurstProgress(): number {
    if (this._slingshotSettleDuration <= 0) return 0
    return Math.min(1, this._slingshotSettleElapsed / this._slingshotSettleDuration)
  }

  /** Set slingshot speed protection — speed won't be clamped below this. */
  setSlingshotSpeed(speed: number): void {
    this._slingshotSpeed = speed
  }

  /**
   * Begin a locked slingshot burst that decays to the stable lane speed.
   * Burst and cruise multipliers come only from the slingshot upgrade — not thruster speed.
   *
   * @param finalSpeed - Physics exit speed magnitude from orbit launch (before upgrade tuning).
   * @param burstMultiplier - Immediate burst multiplier applied at launch.
   * @param settleDuration - Seconds to decay from burst to final speed.
   * @returns Immediate launch speed.
   */
  beginSlingshotBurst(finalSpeed: number, burstMultiplier: number, settleDuration: number): number {
    const burstM = Math.max(1, burstMultiplier)
    const cruiseM = getCurrentShuttleSlingshotCruiseSpeedMultiplier()
    this._slingshotBurstSpeed = finalSpeed * burstM
    this._slingshotFinalSpeed = finalSpeed * cruiseM
    this._slingshotSettleDuration = Math.max(0, settleDuration)
    this._slingshotSettleElapsed = 0
    this._slingshotSpeed =
      this._slingshotSettleDuration > 0 ? this._slingshotBurstSpeed : this._slingshotFinalSpeed
    this.angularVelocity = 0
    this._inputEnabled = this._slingshotSettleDuration <= 0
    return this._slingshotSpeed
  }

  /** Immediately cancel an active slingshot burst (death, orbit capture, etc.). */
  cancelSlingshotBurst(): void {
    this._slingshotSpeed = 0
    this._slingshotBurstSpeed = 0
    this._slingshotFinalSpeed = 0
    this._slingshotSettleDuration = 0
    this._slingshotSettleElapsed = 0
    this._slingshotLaunchFxRemaining = 0
  }

  /**
   * Trigger a short-lived post-launch thruster burst effect.
   *
   * @param duration - Time in seconds to keep the launch VFX active.
   */
  triggerSlingshotLaunchFx(duration: number): void {
    this._slingshotLaunchFxRemaining = Math.max(0, duration)
  }

  private _inputEnabled = true
  private _slingshotSpeed = 0
  private _slingshotBurstSpeed = 0
  private _slingshotFinalSpeed = 0
  private _slingshotSettleDuration = 0
  private _slingshotSettleElapsed = 0
  private _slingshotLaunchFxRemaining = 0
  private angularVelocity = 0
  private readonly inputManager: InputManager
  private spaceTimeGrid: SpaceTimeGrid | null = null
  private readonly gravityWells: GravityWell[] = []
  private readonly gravitySources: GravitySource[] = []
  readonly thrusterSystem: ThrusterSystem<ShuttleThrusterName>
  /**
   * Cached shuttle-buff speed multiplier. Read from profile once at construction;
   * applied on top of the `shuttleThrusterSpeed` upgrade in `updateMovement`.
   */
  private readonly _speedBuffMultiplier: number
  private isDead = false
  private deathTarget: THREE.Vector3 | null = null
  private deathSpeed = 0
  /**
   * Snapshot of the shuttle GLB's root nodes taken after nozzles are placed but before
   * any runtime props (fuel tanks, habitat, cargo lander) are parented onto gltf.scene.
   * External systems that need tight hull bounds — e.g. EVA collision on the solar map —
   * walk these nodes instead of the full scene graph so the collider isn't inflated by
   * props that live inside the cargo bay.
   */
  private readonly hullNodes: THREE.Object3D[] = []
  /** Hull-only materials for the green science-heal emissive pulse (map EVA). */
  private readonly hullHealFeedbackMaterials: THREE.MeshStandardMaterial[] = []
  /**
   * Per-material ramp + stock data captured at clone time. Mirrors the
   * standalone shuttle paint module. `stockColor`, `stockMap`, and `stockPbr`
   * are used to restore the authored GLB finish when Factory Stock is selected
   * (and as fall-through values for any finish-profile field a paid catalog
   * row leaves unspecified).
   */
  private readonly paintableMaterialRampData = new Map<
    THREE.Material,
    {
      /** Mesh geometry — used to compute ramp axis bounds. */
      readonly geometry: THREE.BufferGeometry
      /** Mesh-local → vehicle-local transform for the ramp shader. */
      readonly meshToVehicleLocal: THREE.Matrix4
      /** Paint channel inferred from material name — keys finish-profile lookup. */
      readonly channel: 'primary' | 'secondary' | 'trim' | 'accent'
      /** Authored GLB albedo color before any paint replacement. */
      readonly stockColor: THREE.Color
      /** Authored GLB diffuse map (panel lines / decals); `null` when none. */
      readonly stockMap: THREE.Texture | null
      /** Authored PBR scalars + emissive captured at clone time. */
      readonly stockPbr: {
        /** Authored `metalness` (`MeshStandardMaterial` only). */
        readonly metalness: number | null
        /** Authored `roughness` (`MeshStandardMaterial` only). */
        readonly roughness: number | null
        /** Authored `envMapIntensity` (`MeshStandardMaterial` only). */
        readonly envMapIntensity: number | null
        /** Cloned authored `emissive` color, when the material has one. */
        readonly emissive: THREE.Color | null
        /** Authored `emissiveIntensity`, when the material has one. */
        readonly emissiveIntensity: number | null
      }
    }
  >()
  /** Cached axis bounds across all paintable shuttle meshes (vehicle-local space). */
  private shuttleRampBounds: PaintRampBounds | null = null
  /** Loaded cargo-bay lander scene used for live display and cosmetic previews. */
  private cargoLanderScene: THREE.Object3D | null = null
  private cargoLanderPaintMaterials: LanderPaintMaterialTarget[] = []
  private hullHealFeedbackTimer = 0
  private landerFuelTank: FuelTank | null = null
  private shuttleFuelTank: FuelTank | null = null
  private cargoLight: THREE.PointLight | null = null
  private readonly cargoWallLights: THREE.PointLight[] = []
  private habitat: HabitatModule | null = null
  private readonly physics: ShuttlePhysicsConfig
  private readonly gravityConfig: GravityConfig | undefined

  constructor(
    inputManager: InputManager,
    physics: ShuttlePhysicsConfig = SHUTTLE_PHYSICS,
    gravityConfig?: GravityConfig,
  ) {
    this.inputManager = inputManager
    this.physics = physics
    this.gravityConfig = gravityConfig

    // Read profile once at construction so buffs are idempotent and init-time only.
    const profile = typeof localStorage === 'undefined' ? null : loadProfile()
    const buffMult = profile ? applyShuttleBuffs(profile, 1, 'fuel') : 1
    this.thrusterSystem = new ThrusterSystem<ShuttleThrusterName>(
      buildBuffedShuttleConfig(getCurrentUpgradeValue('shuttleFuelCapacity'), buffMult),
    )
    this._speedBuffMultiplier = profile ? applyShuttleBuffs(profile, 1, 'speed') : 1
  }

  setSpaceTimeGrid(grid: SpaceTimeGrid): void {
    this.spaceTimeGrid = grid
  }

  addGravityWell(well: GravityWell & GravitySource): void {
    this.gravityWells.push(well)
    this.gravitySources.push(well)
  }

  async load(): Promise<void> {
    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath(DRACO_DECODER_PATH)

    const gltfLoader = new GLTFLoader()
    gltfLoader.setDRACOLoader(dracoLoader)

    const gltf = await gltfLoader.loadAsync(SHUTTLE_MODEL_PATH)
    gltf.scene.scale.setScalar(MODEL_SCALE)
    gltf.scene.rotation.x = MODEL_ROTATION_X
    this.tuneHullMaterials(gltf.scene)
    this.preparePaintableMaterials(gltf.scene)
    this.applySavedShuttlePaintjob()
    this.group.add(gltf.scene)

    // Find door nodes for programmatic animation
    this.doorPortNode = this.findNode(gltf.scene, 'door-prt')
    this.doorStbNode = this.findNode(gltf.scene, 'door-stb')
    if (this.doorPortNode) this.doorPortClosedRotX = this.doorPortNode.rotation.x
    if (this.doorStbNode) this.doorStbClosedRotX = this.doorStbNode.rotation.x

    this.placeNozzles(gltf.scene)

    // Snapshot hull nodes BEFORE any runtime props are parented onto gltf.scene.
    // Used by EVA collision to build a tight hull AABB; see hullNodes field docs.
    this.hullNodes.push(...gltf.scene.children)
    this.collectHullHealFeedbackMaterials()

    // Cargo bay fuel tanks: lander fuel (static display) + shuttle fuel (live)
    const landerTankLength = 120
    const shuttleTankLength = 220
    const tankGap = 20
    this.landerFuelTank = new FuelTank({
      radius: 80,
      length: landerTankLength,
      position: new THREE.Vector3(-125, 0, 15),
      color: 0xcc6633,
    })
    gltf.scene.add(this.landerFuelTank.group)

    this.shuttleFuelTank = new FuelTank({
      radius: 80,
      length: shuttleTankLength,
      position: new THREE.Vector3(-85 + landerTankLength + tankGap, 0, 15),
      color: 0x999999,
    })
    gltf.scene.add(this.shuttleFuelTank.group)

    // Habitat module — glass tube between cockpit and shuttle fuel tank
    const habitatLength = 260
    this.habitat = new HabitatModule({
      radius: 80,
      length: habitatLength,
      position: new THREE.Vector3(290, 0, 15),
    })
    this.habitat.setVisible(false)
    gltf.scene.add(this.habitat.group)

    // Load furniture into the habitat (async, non-blocking)
    this.habitat.loadFurniture({
      radius: 80,
      length: habitatLength,
      position: new THREE.Vector3(290, 0, 15),
    })

    // Cargo bay interior lights — only on when doors open
    // Ranges are in raw model space; group scale shrinks them automatically
    // since lights are children of the scaled gltf.scene.
    const scale = this.group.scale.x
    const mainRange = 800 * scale
    const wallRange = 400 * scale

    // Main light: between the two fuel tanks
    this.cargoLight = new THREE.PointLight(0xffeedd, 0, mainRange)
    this.cargoLight.position.set(-60, 0, 150)
    gltf.scene.add(this.cargoLight)

    // Wing wall lights: at the fuselage-thruster bulkhead, port and starboard
    const wallLightL = new THREE.PointLight(0xffeedd, 0, wallRange)
    wallLightL.position.set(-420, -200, 100)
    gltf.scene.add(wallLightL)
    this.cargoWallLights.push(wallLightL)

    const wallLightR = new THREE.PointLight(0xffeedd, 0, wallRange)
    wallLightR.position.set(-420, 200, 100)
    gltf.scene.add(wallLightR)
    this.cargoWallLights.push(wallLightR)

    // Load lander model into the cargo bay
    const landerScene = await loadGLB(LANDER_MODEL_PATH)
    landerScene.scale.setScalar(CARGO_LANDER_SCALE)
    landerScene.position.copy(CARGO_LANDER_OFFSET)
    landerScene.rotation.set(0, 0, -Math.PI / 2)
    this.cargoLanderScene = landerScene
    this.cargoLanderPaintMaterials = cloneAndCollectLanderPaintMaterials(landerScene)
    this.applySavedLanderPaintjob()
    gltf.scene.add(landerScene)

    dracoLoader.dispose()
  }

  toggleDoors(): void {
    this.doorsOpen = !this.doorsOpen
    this.onDoorsToggled?.(this.doorsOpen)
  }

  /** True if the cargo bay doors are currently open (or opening). */
  get isDoorsOpen(): boolean {
    return this.doorsOpen
  }

  /**
   * Hull root nodes in the scaled, rotated GLB scene — excluding runtime props parented
   * onto the cargo bay. Consumers that need a hull-tight AABB (EVA collision) should
   * compute bounds by expanding a `THREE.Box3` over these nodes rather than over
   * `this.group`, which includes fuel tanks, habitat, and the cargo lander.
   */
  get shuttleHullNodes(): readonly THREE.Object3D[] {
    return this.hullNodes
  }

  /** 0 = fully closed, 1 = fully open (animated value). */
  get doorOpenProgress(): number {
    return this.doorProgress
  }

  /** Open the cargo bay doors if not already open. */
  openDoors(): void {
    if (!this.doorsOpen) this.toggleDoors()
  }

  /** Close the cargo bay doors if currently open. */
  closeDoors(): void {
    if (this.doorsOpen) this.toggleDoors()
  }

  get position(): THREE.Vector3 {
    return this.group.position
  }

  /**
   * Apply the active shuttle paint row from a profile snapshot.
   *
   * @param profile - Player profile carrying active cosmetics.
   */
  applyShuttlePaintjobFromProfile(profile: PlayerProfile): void {
    const optionId = getPlayerCosmetics(profile).shuttlePaintjobId
    this.applyShuttlePaintjob(optionId)
  }

  /**
   * Return the loaded cargo-bay lander subtree for static cosmetic preview capture.
   */
  getCargoLanderPreviewRoot(): THREE.Object3D | null {
    return this.cargoLanderScene
  }

  /**
   * Apply a shuttle paint catalog option directly.
   *
   * Factory Stock restores the authored GLB albedo + diffuse map and disables
   * the ramp + detail overlay. Paid paints drop the diffuse map, replace the
   * albedo with the per-channel paint color, and enable the ramp + procedural
   * panel-seam / scuff overlay.
   *
   * @param optionId - `shuttle-paintjob` catalog row id.
   */
  applyShuttlePaintjob(optionId: string): void {
    const option = findCosmeticOptionById(optionId)
    if (!option || option.category !== 'shuttle-paintjob') return

    if (optionId === SHUTTLE_FACTORY_STOCK_OPTION_ID) {
      this.restoreShuttleStockPaint()
      return
    }

    const primary = new THREE.Color(option.gradientStops[0] ?? '#ffffff')
    const secondary = new THREE.Color(
      option.gradientStops[1] ?? option.gradientStops[0] ?? '#ffffff',
    )
    const trim = new THREE.Color(
      option.gradientStops[2] ?? option.gradientStops[1] ?? option.gradientStops[0] ?? '#ffffff',
    )
    const accent = new THREE.Color(
      option.gradientStops[2] ?? option.gradientStops[1] ?? option.gradientStops[0] ?? '#ffffff',
    )

    for (const [material, rampData] of this.paintableMaterialRampData) {
      const zoneColor = {
        primary,
        secondary,
        trim,
        accent,
      }[rampData.channel]
      this.setMaterialDiffuseMap(material, null)
      this.applyMaterialPaintColorReplace(material, zoneColor)
      this.applyChannelFinish(material, rampData, option.finish)
    }
    this.applyShuttlePaintRamp(
      option.gradientStops,
      SHUTTLE_PAINT_RAMP_STRENGTH_REPLACE,
      SHUTTLE_PAINT_DETAIL_STRENGTH_REPLACE,
      SHUTTLE_PAINT_BASE_GLOW_REPLACE,
      this.resolveRim(option.finish?.rim),
    )
  }

  /**
   * Restore the authored GLB diffuse map + albedo + PBR scalars for every
   * paintable shuttle material, and zero out the ramp / detail / rim uniforms
   * so the shader injection becomes a no-op.
   */
  private restoreShuttleStockPaint(): void {
    for (const [material, rampData] of this.paintableMaterialRampData) {
      const materialColor = this.getMaterialColor(material)
      if (materialColor) {
        materialColor.copy(rampData.stockColor)
      }
      this.setMaterialDiffuseMap(material, rampData.stockMap)
      this.restoreMaterialStockPbr(material, rampData.stockPbr)
      setPaintRampStrength(material, 0, 0, 0)
      setPaintRampRim(
        material,
        SHUTTLE_PAINT_RIM_SCRATCH.setRGB(1, 1, 1),
        0,
        SHUTTLE_PAINT_RIM_DEFAULT_POWER,
        0,
      )
      material.needsUpdate = true
    }
  }

  /**
   * Resolve a `CosmeticRim` block into the concrete uniform values the shader
   * expects, or `null` when rim is undefined / disabled (`intensity = 0`).
   *
   * @param rim - Optional rim block from the active paint catalog row.
   */
  private resolveRim(rim: CosmeticRim | undefined): {
    /** Rim color (mutated in place from a shared scratch instance). */
    color: THREE.Color
    /** Rim glow strength multiplier. */
    intensity: number
    /** Fresnel exponent. */
    power: number
    /** Fresnel additive bias. */
    bias: number
  } | null {
    if (!rim || (rim.intensity ?? 0) <= 0) return null
    const color = SHUTTLE_PAINT_RIM_SCRATCH
    if (rim.color !== undefined) {
      color.set(rim.color)
    } else {
      color.setRGB(1, 1, 1)
    }
    return {
      color,
      intensity: rim.intensity ?? 0,
      power: rim.power ?? SHUTTLE_PAINT_RIM_DEFAULT_POWER,
      bias: rim.bias ?? 0,
    }
  }

  /**
   * Apply the finish profile for a paint catalog row to one paintable material.
   *
   * @param material - Cloned paintable material.
   * @param rampData - Stock + ramp data captured at clone time.
   * @param profile - Optional finish profile from the catalog row.
   */
  private applyChannelFinish(
    material: THREE.Material,
    rampData: NonNullable<ReturnType<typeof this.paintableMaterialRampData.get>>,
    profile: CosmeticFinishProfile | undefined,
  ): void {
    const channelBlock = profile?.[rampData.channel]
    const defaultBlock = profile?.default
    const merged: CosmeticFinishChannel = { ...defaultBlock, ...channelBlock }
    this.applyStandardPbr(material, merged)
    this.applyEmissive(material, rampData.stockPbr, merged)
  }

  /**
   * Apply `metalness` / `roughness` / `envMapIntensity` to materials whose class
   * exposes those fields. Falls back to {@link SHUTTLE_PAINT_FINISH_FALLBACK}
   * for unspecified scalars.
   *
   * @param material - Material to mutate.
   * @param finish - Resolved (default + channel) finish block.
   */
  private applyStandardPbr(material: THREE.Material, finish: CosmeticFinishChannel): void {
    if (
      !(
        material instanceof THREE.MeshStandardMaterial ||
        material instanceof THREE.MeshPhysicalMaterial
      )
    ) {
      return
    }
    material.metalness = finish.metalness ?? SHUTTLE_PAINT_FINISH_FALLBACK.metalness
    material.roughness = finish.roughness ?? SHUTTLE_PAINT_FINISH_FALLBACK.roughness
    material.envMapIntensity =
      finish.envMapIntensity ?? SHUTTLE_PAINT_FINISH_FALLBACK.envMapIntensity
    material.needsUpdate = true
  }

  /**
   * Apply or clear the emissive channel for a paintable material. When the
   * finish specifies neither `emissive` nor `emissiveIntensity`, the authored
   * GLB emissive is restored so we never accidentally trim a baked glow.
   *
   * @param material - Material to mutate.
   * @param stock - Stock PBR snapshot captured at clone time.
   * @param finish - Resolved (default + channel) finish block.
   */
  private applyEmissive(
    material: THREE.Material,
    stock: {
      readonly emissive: THREE.Color | null
      readonly emissiveIntensity: number | null
    },
    finish: CosmeticFinishChannel,
  ): void {
    if (
      !(
        material instanceof THREE.MeshStandardMaterial ||
        material instanceof THREE.MeshPhysicalMaterial ||
        material instanceof THREE.MeshPhongMaterial ||
        material instanceof THREE.MeshLambertMaterial
      )
    ) {
      return
    }
    if (finish.emissive === undefined && finish.emissiveIntensity === undefined) {
      if (stock.emissive) material.emissive.copy(stock.emissive)
      if (
        stock.emissiveIntensity !== null &&
        'emissiveIntensity' in material &&
        typeof material.emissiveIntensity === 'number'
      ) {
        material.emissiveIntensity = stock.emissiveIntensity
      }
      return
    }
    if (finish.emissive !== undefined) {
      material.emissive.set(finish.emissive)
    } else if (stock.emissive) {
      material.emissive.copy(stock.emissive)
    }
    if (
      finish.emissiveIntensity !== undefined &&
      'emissiveIntensity' in material &&
      typeof material.emissiveIntensity === 'number'
    ) {
      material.emissiveIntensity = finish.emissiveIntensity
    }
    material.needsUpdate = true
  }

  /**
   * Restore every authored PBR field captured at clone time. Used by Factory
   * Stock.
   *
   * @param material - Material to mutate.
   * @param stock - Stock PBR snapshot captured at clone time.
   */
  private restoreMaterialStockPbr(
    material: THREE.Material,
    stock: {
      readonly metalness: number | null
      readonly roughness: number | null
      readonly envMapIntensity: number | null
      readonly emissive: THREE.Color | null
      readonly emissiveIntensity: number | null
    },
  ): void {
    if (
      material instanceof THREE.MeshStandardMaterial ||
      material instanceof THREE.MeshPhysicalMaterial
    ) {
      if (stock.metalness !== null) material.metalness = stock.metalness
      if (stock.roughness !== null) material.roughness = stock.roughness
      if (stock.envMapIntensity !== null) material.envMapIntensity = stock.envMapIntensity
    }
    if (
      material instanceof THREE.MeshStandardMaterial ||
      material instanceof THREE.MeshPhysicalMaterial ||
      material instanceof THREE.MeshPhongMaterial ||
      material instanceof THREE.MeshLambertMaterial
    ) {
      if (stock.emissive) material.emissive.copy(stock.emissive)
      if (
        stock.emissiveIntensity !== null &&
        'emissiveIntensity' in material &&
        typeof material.emissiveIntensity === 'number'
      ) {
        material.emissiveIntensity = stock.emissiveIntensity
      }
    }
  }

  /**
   * Wire (or refresh) the gradient ramp shader on every shuttle paint material.
   * Mirrors `shuttlePaintMaterials.ts` so direct-controller paint stays in sync
   * with the standalone module used by the arrival sequence preview.
   *
   * @param gradientStops - Hex stops from the active cosmetic option.
   * @param rampStrength - Tint mix strength for the ramp uniform.
   * @param detailStrength - Procedural panel-seam / scuff overlay strength.
   */
  private applyShuttlePaintRamp(
    gradientStops: readonly string[],
    rampStrength: number,
    detailStrength: number,
    baseGlow: number,
    rim: {
      readonly color: THREE.Color
      readonly intensity: number
      readonly power: number
      readonly bias: number
    } | null,
  ): void {
    if (!this.shuttleRampBounds || this.paintableMaterialRampData.size === 0) return
    const rampTexture = buildPaintRampTexture(gradientStops)
    const rimColor = rim?.color ?? SHUTTLE_PAINT_RIM_SCRATCH.setRGB(1, 1, 1)
    const rimIntensity = rim?.intensity ?? 0
    const rimPower = rim?.power ?? SHUTTLE_PAINT_RIM_DEFAULT_POWER
    const rimBias = rim?.bias ?? 0
    for (const [material, rampData] of this.paintableMaterialRampData) {
      const userData = material.userData as { paintRampUniforms?: unknown }
      if (userData.paintRampUniforms) {
        updatePaintRampTexture(material, rampTexture)
        setPaintRampStrength(material, rampStrength, detailStrength, baseGlow)
        setPaintRampRim(material, rimColor, rimIntensity, rimPower, rimBias)
        continue
      }
      applyPaintRampShader(material, {
        rampTexture,
        axis: SHUTTLE_PAINT_RAMP_AXIS,
        axisBounds: this.shuttleRampBounds,
        strength: rampStrength,
        meshToVehicleLocal: rampData.meshToVehicleLocal,
        detailStrength,
        baseGlow,
        rimColor,
        rimIntensity,
        rimPower,
        rimBias,
      })
    }
  }

  /**
   * Apply the active lander paint row to the cargo-bay lander from a profile snapshot.
   *
   * @param profile - Player profile carrying active cosmetics.
   */
  applyLanderPaintjobFromProfile(profile: PlayerProfile): void {
    applyLanderPaintMaterialsFromProfile(this.cargoLanderPaintMaterials, profile)
  }

  get isThrusting(): boolean {
    return (
      this._inputEnabled &&
      this.inputManager.isActionActive('thrust') &&
      this.thrusterSystem.canFire('thrust', this.getModifiers())
    )
  }

  get isBraking(): boolean {
    return (
      this.externalBrakeActive ||
      (this._inputEnabled &&
        this.inputManager.isActionActive('brake') &&
        this.thrusterSystem.canFire('brake', this.getModifiers()))
    )
  }

  /** Set by orbit system to drive RCS VFX while input is disabled. */
  orbitYawLeft = false
  /** Set by orbit system to drive RCS VFX while input is disabled. */
  orbitYawRight = false
  /** Called when death animation completes. Falls back to respawn() if not set. */
  onDeath: (() => void) | null = null

  /**
   * Notified whenever {@link toggleDoors} flips the cargo bay state.
   * Hosts (e.g. {@link views.MapViewController}) wire this to a
   * {@link audio.ShuttleAudioDirector} so the controller stays free of
   * any direct Howler references — door audio routes through the
   * single shuttle-audio owner.
   *
   * @param open - `true` if the doors are now opening, `false` if closing.
   */
  onDoorsToggled: ((open: boolean) => void) | null = null

  get isYawingLeft(): boolean {
    return (
      this.orbitYawLeft ||
      (this._inputEnabled &&
        this.inputManager.isActionActive('yawLeft') &&
        this.thrusterSystem.canFire('rcs', this.getModifiers()))
    )
  }

  get isYawingRight(): boolean {
    return (
      this.orbitYawRight ||
      (this._inputEnabled &&
        this.inputManager.isActionActive('yawRight') &&
        this.thrusterSystem.canFire('rcs', this.getModifiers()))
    )
  }

  get speed(): number {
    return this.velocity.length()
  }

  /**
   * Planar compass yaw (radians) derived from the nose quaternion — stable even if euler pitch/roll drift.
   */
  get heading(): number {
    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(this.group.quaternion)
    return Math.atan2(-fwd.z, fwd.x)
  }

  /** Current signed yaw angular velocity in radians per second. */
  get currentAngularVelocity(): number {
    return this.angularVelocity
  }

  /** Current velocity vector (read-only copy for external systems). */
  get currentVelocity(): THREE.Vector3 {
    return this.velocity.clone()
  }

  /** Whether the shuttle is in the death animation. */
  get dead(): boolean {
    return this.isDead
  }

  tick(dt: number): void {
    // Doors and fuel indicators always update (even while frozen/orbiting)
    this.updateDoors(dt)
    this.updateFuelIndicator()
    this.tickHullHealFeedback(dt)
    if (this.frozen) return
    if (this.isDead) {
      this.updateDeath(dt)
      return
    }
    this.updateMovement(dt)
    this.checkDeath()
  }

  dispose(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    })
  }

  private updateDoors(dt: number): void {
    const target = this.doorsOpen ? 1 : 0
    const diff = target - this.doorProgress
    if (Math.abs(diff) < 0.001) {
      this.doorProgress = target
      return
    }

    const step = Math.sign(diff) * DOOR_ANIM_SPEED * dt
    this.doorProgress = Math.abs(step) > Math.abs(diff) ? target : this.doorProgress + step

    const angle = this.doorProgress * DOOR_OPEN_ANGLE

    // Doors hinge along X axis (nose-to-tail in model space)
    if (this.doorPortNode) {
      this.doorPortNode.rotation.x = this.doorPortClosedRotX - angle
    }
    if (this.doorStbNode) {
      this.doorStbNode.rotation.x = this.doorStbClosedRotX + angle
    }
  }

  private updateFuelIndicator(): void {
    const doorsOpen = this.doorProgress > 0.1

    // Cargo lights fade in/out with doors — scale intensity by group scale squared
    // so lights don't overpower the scene at small scales (e.g. map view with bloom)
    // Cargo lights — disabled at small scales (map view with bloom overpowers them)
    const s = this.group.scale.x
    const lightsEnabled = s >= 0.5
    if (this.cargoLight) {
      this.cargoLight.intensity = lightsEnabled ? this.doorProgress * 2 : 0
    }
    for (const light of this.cargoWallLights) {
      light.intensity = lightsEnabled ? this.doorProgress * 1.5 : 0
    }

    if (this.habitat) {
      this.habitat.setVisible(doorsOpen)
    }

    // Lander fuel — always full (static cargo indicator)
    if (this.landerFuelTank) {
      this.landerFuelTank.setVisible(doorsOpen)
      this.landerFuelTank.update(1.0)
    }

    // Shuttle fuel — live from thruster system
    if (this.shuttleFuelTank) {
      this.shuttleFuelTank.setVisible(doorsOpen)
      const ratio =
        this.thrusterSystem.fuelCapacity > 0
          ? this.thrusterSystem.fuelLevel / this.thrusterSystem.fuelCapacity
          : 0
      this.shuttleFuelTank.update(ratio)
    }
  }

  private checkDeath(): void {
    const hit = checkEventHorizon(
      this.gravitySources,
      this.group.position.x,
      this.group.position.z,
      this.gravityConfig,
    )
    if (hit) {
      this.isDead = true
      this.deathTarget = new THREE.Vector3(hit.getWorldX(), 0, hit.getWorldZ())
      this.velocity.set(0, 0, 0)
      this.angularVelocity = 0
      this.deathSpeed = 20
    }
  }

  private updateDeath(dt: number): void {
    if (!this.deathTarget) return

    // Pull toward the body center in 3D — rise up out of the well toward the body
    const dir = this.deathTarget.clone().sub(this.group.position)
    const dist = dir.length()

    if (dist < 5) {
      if (this.onDeath) {
        this.onDeath()
      } else {
        this.respawn()
      }
      return
    }

    // Accelerate as we fall in
    this.deathSpeed = Math.min(this.deathSpeed + DEATH_PULL_ACCELERATION * dt, DEATH_MAX_PULL_SPEED)

    dir.normalize()
    this.group.position.addScaledVector(dir, this.deathSpeed * dt)

    // Tumble: spin on Y and tilt nose down on X
    this.group.rotateY(dt * 8)
    this.group.rotateX(dt * 3)
  }

  /** Clear death state without repositioning. Caller handles placement. */
  resetDeath(): void {
    this.isDead = false
    this.deathTarget = null
    this.deathSpeed = 0
    this.velocity.set(0, 0, 0)
    this.angularVelocity = 0
    this.externalBrakeActive = false
    this._slingshotSpeed = 0
    this._slingshotBurstSpeed = 0
    this._slingshotFinalSpeed = 0
    this._slingshotSettleDuration = 0
    this._slingshotSettleElapsed = 0
    this._slingshotLaunchFxRemaining = 0
    this.group.rotation.set(0, this.group.rotation.y, 0)
    this.thrusterSystem.refuel()
  }

  respawn(): void {
    this.isDead = false
    this.deathTarget = null
    this.velocity.set(0, 0, 0)
    this.angularVelocity = 0
    this._slingshotSpeed = 0
    this._slingshotBurstSpeed = 0
    this._slingshotFinalSpeed = 0
    this._slingshotSettleDuration = 0
    this._slingshotSettleElapsed = 0
    this._slingshotLaunchFxRemaining = 0
    this.externalBrakeActive = false

    const angle = Math.random() * Math.PI * 2
    const radius = SPAWN_MIN_RADIUS + Math.random() * (SPAWN_MAX_RADIUS - SPAWN_MIN_RADIUS)
    this.group.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
    this.group.rotation.set(0, Math.random() * Math.PI * 2, 0)
  }

  private updateMovement(dt: number): void {
    const p = this.physics
    // Upgrade multiplier is read per-frame (upgrades can be installed at runtime).
    // Buff multiplier is cached at init (idempotent, applied once at construction).
    const speedUpgradeMultiplier =
      getCurrentUpgradeValue('shuttleThrusterSpeed') * this._speedBuffMultiplier
    /** Baseline caps from JSON — slingshot protection/decay must not depend on thruster upgrades. */
    const baseMaxThrustSpeed = p.maxThrustSpeed
    const baseMaxGravitySpeed = p.maxGravitySpeed
    const upgradedMaxThrustSpeed = baseMaxThrustSpeed * speedUpgradeMultiplier
    const upgradedCruiseEquilibrium =
      (p.speedReturnEquilibriumSpeed === undefined
        ? baseMaxThrustSpeed
        : p.speedReturnEquilibriumSpeed) * speedUpgradeMultiplier
    const upgradedMaxGravitySpeed = baseMaxGravitySpeed * speedUpgradeMultiplier

    // Yaw (A/D) — apply angular torque, builds up angular velocity
    if (this.isYawingLeft) {
      this.angularVelocity += p.yawTorque * dt
    }
    if (this.isYawingRight) {
      this.angularVelocity -= p.yawTorque * dt
    }

    // Gentle damping so it doesn't spin forever
    this.angularVelocity *= p.yawDamping

    // Clamp angular velocity
    this.angularVelocity = Math.max(-p.yawMaxSpeed, Math.min(p.yawMaxSpeed, this.angularVelocity))

    // Apply angular velocity
    this.group.rotateY(this.angularVelocity * dt)

    // RCS lateral push — scaled by how much planar velocity lies along the jet (|v̂·pushDir|)
    const right = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion)
    right.y = 0
    right.normalize()
    const applyRcsAlongRight = (pushSign: number): void => {
      let mult = p.rcsAlignMaxMultiplier
      const vxr = this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z
      if (vxr > SHUTTLE_VELOCITY_ALIGN_EPSILON * SHUTTLE_VELOCITY_ALIGN_EPSILON) {
        const spd = Math.sqrt(vxr)
        const along = (pushSign * this.velocity.dot(right)) / spd
        const alongAbs = Math.min(1, Math.abs(along))
        mult = THREE.MathUtils.lerp(p.rcsAlignMinMultiplier, p.rcsAlignMaxMultiplier, alongAbs)
      }
      this.velocity.addScaledVector(
        right,
        pushSign * p.yawLateralForce * mult * speedUpgradeMultiplier * dt,
      )
    }
    if (this.isYawingLeft) {
      applyRcsAlongRight(-1)
    }
    if (this.isYawingRight) {
      applyRcsAlongRight(1)
    }

    // Thrust (W) — vector acceleration along nose; efficiency scales with velocity vs nose alignment
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(this.group.quaternion)
    forward.y = 0
    forward.normalize()
    if (this.isThrusting) {
      const speedSq = this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z
      const planarSpeed =
        speedSq > SHUTTLE_VELOCITY_ALIGN_EPSILON * SHUTTLE_VELOCITY_ALIGN_EPSILON
          ? Math.sqrt(speedSq)
          : 0
      /**
       * Above the thruster-tier speed ceiling, main engine does nothing: avoids breaking slingshot
       * protection (and speed clamps) and prevents misaligned thrust from shaving coast speed.
       */
      if (planarSpeed <= upgradedMaxThrustSpeed + SHUTTLE_VELOCITY_ALIGN_EPSILON) {
        let thrustMultiplier = p.thrustAlignMaxMultiplier
        if (planarSpeed > SHUTTLE_VELOCITY_ALIGN_EPSILON) {
          const forwardAlign = Math.max(0, Math.min(1, this.velocity.dot(forward) / planarSpeed))
          thrustMultiplier = THREE.MathUtils.lerp(
            p.thrustAlignMinMultiplier,
            p.thrustAlignMaxMultiplier,
            forwardAlign,
          )
        }
        this.velocity.addScaledVector(
          forward,
          p.thrustForce * speedUpgradeMultiplier * thrustMultiplier * dt,
        )
      }
    }

    // Brake (S) — inertia dampener, weaker deeper in gravity wells
    if (this.isBraking) {
      const depth = Math.abs(this.group.position.y)
      const effectiveBrake = Math.min(1, p.brakeFactor + depth * p.brakeDepthPenalty)
      this.velocity.multiplyScalar(effectiveBrake)
    }

    // Gravitational pull from all wells
    for (const well of this.gravityWells) {
      const gravity = well.getGravityAt(this.group.position)
      this.velocity.addScaledVector(gravity, dt)
    }

    // Lock velocity to XZ plane
    this.velocity.y = 0

    this._slingshotLaunchFxRemaining = Math.max(0, this._slingshotLaunchFxRemaining - dt)

    if (this.slingshotBurstActive) {
      this._slingshotSettleElapsed = Math.min(
        this._slingshotSettleElapsed + dt,
        this._slingshotSettleDuration,
      )
      const targetSpeed = getSlingshotSettleSpeed(
        this._slingshotBurstSpeed,
        this._slingshotFinalSpeed,
        this._slingshotSettleDuration,
        this._slingshotSettleElapsed,
      )
      const currentSpeed = this.velocity.length()
      this._slingshotSpeed = targetSpeed
      if (currentSpeed > targetSpeed && currentSpeed > 0) {
        this.velocity.setLength(targetSpeed)
      }
      const targetYaw = getVelocityHeading(this.velocity.x, this.velocity.z)
      if (targetYaw !== null) {
        const remainingAlignTime = Math.max(
          SHUTTLE_VELOCITY_ALIGN_EPSILON,
          this._slingshotSettleDuration - this._slingshotSettleElapsed,
        )
        this.group.rotation.y = getSlingshotAutoAlignYaw(
          this.group.rotation.y,
          targetYaw,
          dt,
          remainingAlignTime,
        )
        this.angularVelocity = 0
      }
      if (!this.slingshotBurstActive) {
        this._inputEnabled = true
        this._slingshotSpeed = this._slingshotFinalSpeed
      }
    }

    // Decay slingshot speed protection (floor uses base cap only — independent of thruster upgrades)
    if (!this.slingshotBurstActive && this._slingshotSpeed > baseMaxThrustSpeed) {
      const excess = this._slingshotSpeed - baseMaxThrustSpeed
      this._slingshotSpeed -= excess * orbitConfig.slingshotDecayRate * dt
    }

    if (this.isBraking) {
      // Braking cancels slingshot protection
      this._slingshotSpeed = 0
    }

    const currentSpeed = this.velocity.length()
    const slingshotProtected =
      this.slingshotBurstActive ||
      (this._slingshotSpeed > baseMaxThrustSpeed &&
        currentSpeed <= this._slingshotSpeed + SLINGSHOT_PROTECT_SPEED_EPSILON)

    const coastingAboveThrustCap =
      this.isThrusting && currentSpeed > upgradedMaxThrustSpeed + SHUTTLE_VELOCITY_ALIGN_EPSILON

    // Bleed maneuver / thrust overshoot back toward cruise without snapping heading
    if (
      !slingshotProtected &&
      !coastingAboveThrustCap &&
      p.speedExcessReturnRate > 0 &&
      upgradedCruiseEquilibrium >= 0
    ) {
      const spd = this.velocity.length()
      if (spd > upgradedCruiseEquilibrium + SHUTTLE_VELOCITY_ALIGN_EPSILON) {
        const excess = spd - upgradedCruiseEquilibrium
        const newSpd = upgradedCruiseEquilibrium + excess * Math.exp(-p.speedExcessReturnRate * dt)
        this.velocity.multiplyScalar(newSpd / spd)
      }
    }

    if (
      !slingshotProtected &&
      !coastingAboveThrustCap &&
      this.velocity.length() > upgradedMaxGravitySpeed
    ) {
      this.velocity.setLength(upgradedMaxGravitySpeed)
    }

    // Apply velocity and follow spacetime geometry
    this.group.position.addScaledVector(this.velocity, dt)
    if (this.ignoreGridY) {
      this.group.position.y = 0
    } else if (this.spaceTimeGrid) {
      this.group.position.y = -this.spaceTimeGrid.getDepthAt(
        this.group.position.x,
        this.group.position.z,
      )
    } else {
      this.group.position.y = 0
    }

    this.thrusterSystem.tick(
      dt,
      {
        thrust: this.isThrusting,
        brake: this.isBraking,
        rcs: this.isYawingLeft || this.isYawingRight,
        turretMining: false,
      },
      this.getModifiers(),
    )
  }

  private getModifiers(): ThrusterRuntimeModifiers<ShuttleThrusterName> {
    return {
      burnRateMultiplier: getCurrentShuttleThrusterEfficiencyModifiers(),
      rechargeRateMultiplier: getCurrentShuttleThrusterChargeModifiers(),
    }
  }

  /** Shared runtime modifiers used by both normal flight and external controllers. */
  getThrusterRuntimeModifiers(): ThrusterRuntimeModifiers<ShuttleThrusterName> {
    return this.getModifiers()
  }

  private placeNozzles(scene: THREE.Object3D): void {
    const engNode = this.findNode(scene, 'eng')
    const rcsNode = this.findNode(scene, 'rcs')

    // The eng node lives under <3DSRoot>_2 which has its own axis transform.
    // Rather than fighting coordinate conversions, attach eng directly to the
    // main scene root and position in raw model coordinates.
    // Engine plate (shutlayer_16) is at the rear: X ≈ -650, Y ≈ 0, Z ≈ 100
    if (engNode) {
      // Remove from original parent (under <3DSRoot>_2)
      const engParent = engNode.parent
      if (engParent) engParent.remove(engNode)

      // Place 3 copies in the triangle SSME arrangement
      for (const [x, y, z] of ENG_POSITIONS) {
        const nozzle = engNode.clone()
        nozzle.position.set(x, y, z)
        nozzle.rotation.set(0, 0, 0)
        nozzle.scale.set(1, 1, 1)
        scene.add(nozzle)
      }
    }

    // Hide RCS for now — needs separate OMS pod alignment
    if (rcsNode) rcsNode.visible = false
  }

  private findNode(root: THREE.Object3D, name: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null
    root.traverse((child) => {
      if (child.name === name && !found) {
        found = child
      }
    })
    return found
  }

  /**
   * Walk {@link hullNodes} and cache {@link MeshStandardMaterial} for heal pulse — excludes
   * cargo / habitat props parented after snapshot.
   */
  private collectHullHealFeedbackMaterials(): void {
    this.hullHealFeedbackMaterials.length = 0
    for (const root of this.hullNodes) {
      root.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !child.material) return
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        for (const m of materials) {
          if (m instanceof THREE.MeshStandardMaterial) {
            this.hullHealFeedbackMaterials.push(m)
          }
        }
      })
    }
  }

  private applySavedShuttlePaintjob(): void {
    if (typeof localStorage === 'undefined') return
    const profile = loadProfile()
    if (!profile) return
    this.applyShuttlePaintjobFromProfile(profile)
  }

  private applySavedLanderPaintjob(): void {
    if (typeof localStorage === 'undefined') return
    const profile = loadProfile()
    if (!profile) return
    this.applyLanderPaintjobFromProfile(profile)
  }

  private preparePaintableMaterials(root: THREE.Object3D): void {
    this.paintableMaterialRampData.clear()
    this.shuttleRampBounds = null
    root.updateMatrixWorld(true)
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.material) return

      if (Array.isArray(child.material)) {
        child.material = child.material.map((material) =>
          this.preparePaintableMaterial(material, child, root),
        )
        return
      }
      child.material = this.preparePaintableMaterial(child.material, child, root)
    })
    this.computeShuttleRampBounds()
  }

  private preparePaintableMaterial(
    material: THREE.Material,
    mesh: THREE.Mesh,
    vehicleRoot: THREE.Object3D,
  ): THREE.Material {
    const channel = this.getPaintChannelForMaterialName(material.name)
    if (!channel) return material
    const cloned = material.clone()
    const baseColor = this.getMaterialColor(cloned)
    if (baseColor) {
      this.paintableMaterialRampData.set(cloned, {
        geometry: mesh.geometry,
        meshToVehicleLocal: computeMeshToVehicleLocal(mesh, vehicleRoot),
        channel,
        stockColor: baseColor.clone(),
        stockMap: this.getMaterialDiffuseMap(cloned),
        stockPbr: this.captureMaterialStockPbr(cloned),
      })
    }
    return cloned
  }

  /**
   * Capture the authored PBR scalars + emissive from a freshly cloned material.
   *
   * @param material - Cloned shuttle paint material.
   */
  private captureMaterialStockPbr(material: THREE.Material): {
    /** Authored `metalness`, when the material exposes one. */
    metalness: number | null
    /** Authored `roughness`, when the material exposes one. */
    roughness: number | null
    /** Authored `envMapIntensity`, when the material exposes one. */
    envMapIntensity: number | null
    /** Cloned authored emissive color, when the material has one. */
    emissive: THREE.Color | null
    /** Authored `emissiveIntensity`, when the material has one. */
    emissiveIntensity: number | null
  } {
    const isStandard =
      material instanceof THREE.MeshStandardMaterial ||
      material instanceof THREE.MeshPhysicalMaterial
    const supportsEmissive =
      isStandard ||
      material instanceof THREE.MeshPhongMaterial ||
      material instanceof THREE.MeshLambertMaterial
    return {
      metalness: isStandard ? material.metalness : null,
      roughness: isStandard ? material.roughness : null,
      envMapIntensity: isStandard ? material.envMapIntensity : null,
      emissive: supportsEmissive ? material.emissive.clone() : null,
      emissiveIntensity:
        supportsEmissive &&
        'emissiveIntensity' in material &&
        typeof material.emissiveIntensity === 'number'
          ? material.emissiveIntensity
          : null,
    }
  }

  /**
   * Read the diffuse / albedo map (`.map`) from a paintable shuttle material,
   * or `null` when the material's class doesn't carry one.
   *
   * @param material - Material to inspect.
   */
  private getMaterialDiffuseMap(material: THREE.Material): THREE.Texture | null {
    if (
      material instanceof THREE.MeshStandardMaterial ||
      material instanceof THREE.MeshPhysicalMaterial ||
      material instanceof THREE.MeshPhongMaterial ||
      material instanceof THREE.MeshLambertMaterial ||
      material instanceof THREE.MeshBasicMaterial
    ) {
      return material.map ?? null
    }
    return null
  }

  /**
   * Replace or restore the diffuse / albedo map on a paintable shuttle
   * material. When the value changes, marks the material for recompile so the
   * `USE_MAP` define toggles correctly between paid and stock paints.
   *
   * @param material - Material to mutate.
   * @param map - Replacement texture, or `null` to drop the map entirely.
   */
  private setMaterialDiffuseMap(material: THREE.Material, map: THREE.Texture | null): void {
    if (
      !(
        material instanceof THREE.MeshStandardMaterial ||
        material instanceof THREE.MeshPhysicalMaterial ||
        material instanceof THREE.MeshPhongMaterial ||
        material instanceof THREE.MeshLambertMaterial ||
        material instanceof THREE.MeshBasicMaterial
      )
    ) {
      return
    }
    const current = material.map ?? null
    if (current === map) return
    material.map = map
    material.needsUpdate = true
  }

  private computeShuttleRampBounds(): void {
    const entries = Array.from(this.paintableMaterialRampData.values())
    if (entries.length === 0) {
      this.shuttleRampBounds = null
      return
    }
    this.shuttleRampBounds = computePaintRampBounds(entries, SHUTTLE_PAINT_RAMP_AXIS)
  }

  private getPaintChannelForMaterialName(
    materialName: string,
  ): 'primary' | 'secondary' | 'trim' | 'accent' | null {
    if (SHUTTLE_PAINT_PRIMARY_MATERIALS.has(materialName)) return 'primary'
    if (SHUTTLE_PAINT_SECONDARY_MATERIALS.has(materialName)) return 'secondary'
    if (SHUTTLE_PAINT_TRIM_MATERIALS.has(materialName)) return 'trim'
    if (SHUTTLE_PAINT_ACCENT_MATERIALS.has(materialName)) return 'accent'
    return null
  }

  private getMaterialColor(material: THREE.Material): THREE.Color | null {
    if (
      material instanceof THREE.MeshStandardMaterial ||
      material instanceof THREE.MeshPhysicalMaterial ||
      material instanceof THREE.MeshPhongMaterial ||
      material instanceof THREE.MeshLambertMaterial ||
      material instanceof THREE.MeshBasicMaterial
    ) {
      return material.color
    }
    return null
  }

  /**
   * Replace the material albedo with the per-channel paint color (replace
   * mode). Used for paid paints where the GLB diffuse map has been dropped
   * and surface color comes entirely from `material.color * paintRamp *
   * detail`. The strength scalar tames brightness to match the rest of the
   * game's lighting; a saturation push compensates for slightly desaturated
   * authored GLB albedos.
   *
   * @param material - Material to mutate.
   * @param paintColor - Cosmetic shader color for the material's channel.
   */
  private applyMaterialPaintColorReplace(material: THREE.Material, paintColor: THREE.Color): void {
    const materialColor = this.getMaterialColor(material)
    if (!materialColor) return
    const boosted = paintColor.clone()
    this.pushColorSaturation(boosted, SHUTTLE_PAINT_SATURATION_BOOST)
    materialColor.copy(boosted).multiplyScalar(SHUTTLE_PAINT_COLOR_STRENGTH)
    material.needsUpdate = true
  }

  /**
   * Push a color's HSL saturation by `amount` (clamped to `[0, 1]`). No-op for
   * pure greys (`s = 0`) so neutral hull elements like silver / graphite stay
   * unbiased.
   *
   * @param color - Color mutated in place.
   * @param amount - Additive saturation delta in `[0, 1]`.
   */
  private pushColorSaturation(color: THREE.Color, amount: number): void {
    const hsl = color.getHSL(SHUTTLE_PAINT_HSL_BAG)
    if (hsl.s <= 0) return
    color.setHSL(hsl.h, Math.min(1, hsl.s + amount), hsl.l)
  }

  /**
   * Green emissive pulse on the hull (map EVA science repair). Safe to call while frozen.
   */
  pulseHullHealFeedback(): void {
    this.hullHealFeedbackTimer = HULL_HEAL_PULSE_DURATION
    const c = new THREE.Color(0x22ff88)
    for (const mat of this.hullHealFeedbackMaterials) {
      if (mat.emissive) {
        mat.emissive.copy(c)
      }
      mat.emissiveIntensity = HULL_HEAL_PULSE_PEAK_INTENSITY
    }
  }

  /**
   * Decay heal emissive. Runs every frame; cheap when the timer is zero.
   */
  private tickHullHealFeedback(dt: number): void {
    if (this.hullHealFeedbackTimer <= 0) return
    this.hullHealFeedbackTimer -= dt
    const t = Math.max(0, this.hullHealFeedbackTimer / HULL_HEAL_PULSE_DURATION)
    for (const mat of this.hullHealFeedbackMaterials) {
      mat.emissiveIntensity = HULL_HEAL_PULSE_PEAK_INTENSITY * t
      if (this.hullHealFeedbackTimer <= 0) {
        if (mat.emissive) {
          mat.emissive.setHex(0x000000)
        }
        mat.emissiveIntensity = 0
      }
    }
    if (this.hullHealFeedbackTimer <= 0) {
      this.hullHealFeedbackTimer = 0
    }
  }

  /**
   * The tactical map can scale the shuttle far beyond its authored size so it stays readable.
   * At those close-up scales, the GLB's stock specular response blooms into a white silhouette.
   * Clamp the hull materials so zooming onto your own ship still preserves actual form.
   */
  private tuneHullMaterials(root: THREE.Object3D): void {
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.material) return

      const materials = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of materials) {
        material.side = THREE.DoubleSide

        if (material instanceof THREE.MeshStandardMaterial) {
          material.color.multiplyScalar(SHUTTLE_HULL_COLOR_SCALE)
          material.roughness = Math.max(material.roughness, SHUTTLE_HULL_MIN_ROUGHNESS)
          material.metalness = Math.min(material.metalness, SHUTTLE_HULL_MAX_METALNESS)
          material.envMapIntensity = Math.min(
            material.envMapIntensity,
            SHUTTLE_HULL_MAX_ENV_MAP_INTENSITY,
          )
          if (material.emissive) {
            material.emissive.setHex(0x000000)
          }
          material.emissiveIntensity = Math.min(
            material.emissiveIntensity,
            SHUTTLE_HULL_MAX_EMISSIVE_INTENSITY,
          )
          material.emissiveMap = null
        }

        if (material instanceof THREE.MeshPhysicalMaterial) {
          material.clearcoat = Math.min(material.clearcoat, SHUTTLE_HULL_MAX_CLEARCOAT)
          material.clearcoatRoughness = Math.max(
            material.clearcoatRoughness,
            SHUTTLE_HULL_MIN_CLEARCOAT_ROUGHNESS,
          )
        }

        if (material instanceof THREE.MeshPhongMaterial) {
          material.shininess = Math.min(material.shininess, SHUTTLE_HULL_MAX_PHONG_SHININESS)
          material.specular.multiplyScalar(SHUTTLE_HULL_PHONG_SPECULAR_SCALE)
        }

        material.needsUpdate = true
      }
    })
  }
}
