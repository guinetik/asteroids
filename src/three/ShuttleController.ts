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
 * {@link ShuttlePhysicsConfig.maxGravitySpeed} (5) and a fast
 * {@link ShuttlePhysicsConfig.speedExcessReturnRate}, collapsing a high burst to the gravity cap.
 */
const SLINGSHOT_PROTECT_SPEED_EPSILON = 0.02

const SHUTTLE_MODEL_PATH = '/models/shuttle.glb'
const DRACO_DECODER_PATH = '/node_modules/three/examples/jsm/libs/draco/'

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

  get heading(): number {
    return this.group.rotation.y
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
