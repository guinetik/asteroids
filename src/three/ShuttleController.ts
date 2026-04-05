// src/three/ShuttleController.ts
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import type { Tickable } from '@/lib/Tickable'
import type { InputManager } from '@/lib/InputManager'
import type { SpaceTimeGrid } from './SpaceTimeGrid'
import { checkEventHorizon, type GravitySource } from '@/lib/physics/gravity'
import { ThrusterSystem, DEFAULT_SHUTTLE_CONFIG } from '@/lib/physics/thrusterSystem'
import type { ShuttleThrusterName } from '@/lib/physics/thrusterSystem'
import { loadGLB } from './loadGLB'
import { FuelTank } from './FuelTank'
import { HabitatModule } from './HabitatModule'
import type { PortalVehicle } from './PortalArrivalSequence'
import shuttlePhysicsData from '@/data/shuttle/shuttle-physics.json'
import orbitConfig from '@/data/shuttle/orbit-capture.json'

/** Any object that can exert gravity on the shuttle */
interface GravityWell {
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
  /** Speed cap from player thrust alone */
  maxThrustSpeed: number
  /** Absolute speed cap (gravity can exceed thrust cap up to this) */
  maxGravitySpeed: number
}

/** Default physics for the shuttle scene. */
export const SHUTTLE_PHYSICS: ShuttlePhysicsConfig = shuttlePhysicsData.shuttle as ShuttlePhysicsConfig

/** Scaled-down physics for the map scene (solar system hub). */
export const MAP_PHYSICS: ShuttlePhysicsConfig = shuttlePhysicsData.map as ShuttlePhysicsConfig

const SPAWN_MIN_RADIUS = 400
const SPAWN_MAX_RADIUS = 1500
const DEATH_PULL_ACCELERATION = 30 // accelerates as it falls in
const DEATH_MAX_PULL_SPEED = 120

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
  [-510, 0, 72],     // top center
  [-510, -52, -46],  // bottom left
  [-510, 52, -46],   // bottom right
]

const DOOR_OPEN_ANGLE = Math.PI * 0.6 // ~108 degrees, payload bay doors open wide
const DOOR_ANIM_SPEED = 2 // radians per second

const LANDER_MODEL_PATH = '/models/lander.glb'
/** Scale the lander to fit inside the cargo bay (in raw shuttle cm space) */
const CARGO_LANDER_SCALE = 30
/** Position inside the bay — raw model coords (cm), pre-rotation: X=nose-tail, Y=wingspan, Z=height */
const CARGO_LANDER_OFFSET = new THREE.Vector3(-320, 0, 20)

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

  /** Whether player input is currently enabled. */
  get inputEnabled(): boolean {
    return this._inputEnabled
  }

  /** Set slingshot speed protection — speed won't be clamped below this. */
  setSlingshotSpeed(speed: number): void {
    this._slingshotSpeed = speed
  }

  private _inputEnabled = true
  private _slingshotSpeed = 0
  private angularVelocity = 0
  private readonly inputManager: InputManager
  private spaceTimeGrid: SpaceTimeGrid | null = null
  private readonly gravityWells: GravityWell[] = []
  private readonly gravitySources: GravitySource[] = []
  readonly thrusterSystem = new ThrusterSystem<ShuttleThrusterName>(DEFAULT_SHUTTLE_CONFIG)
  private isDead = false
  private deathTarget: THREE.Vector3 | null = null
  private deathSpeed = 0
  private landerFuelTank: FuelTank | null = null
  private shuttleFuelTank: FuelTank | null = null
  private cargoLight: THREE.PointLight | null = null
  private readonly cargoWallLights: THREE.PointLight[] = []
  private habitat: HabitatModule | null = null
  private readonly physics: ShuttlePhysicsConfig

  constructor(inputManager: InputManager, physics: ShuttlePhysicsConfig = SHUTTLE_PHYSICS) {
    this.inputManager = inputManager
    this.physics = physics
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
    this.group.add(gltf.scene)

    // Find door nodes for programmatic animation
    this.doorPortNode = this.findNode(gltf.scene, 'door-prt')
    this.doorStbNode = this.findNode(gltf.scene, 'door-stb')
    if (this.doorPortNode) this.doorPortClosedRotX = this.doorPortNode.rotation.x
    if (this.doorStbNode) this.doorStbClosedRotX = this.doorStbNode.rotation.x

    this.placeNozzles(gltf.scene)

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
  }

  get position(): THREE.Vector3 {
    return this.group.position
  }

  get isThrusting(): boolean {
    return this._inputEnabled && this.inputManager.isActionActive('thrust') && this.thrusterSystem.canFire('thrust')
  }

  get isBraking(): boolean {
    return this._inputEnabled && this.inputManager.isActionActive('brake') && this.thrusterSystem.canFire('brake')
  }

  /** Set by orbit system to drive RCS VFX while input is disabled. */
  orbitYawLeft = false
  /** Set by orbit system to drive RCS VFX while input is disabled. */
  orbitYawRight = false

  get isYawingLeft(): boolean {
    return this.orbitYawLeft
      || (this._inputEnabled && this.inputManager.isActionActive('yawLeft') && this.thrusterSystem.canFire('rcs'))
  }

  get isYawingRight(): boolean {
    return this.orbitYawRight
      || (this._inputEnabled && this.inputManager.isActionActive('yawRight') && this.thrusterSystem.canFire('rcs'))
  }

  get speed(): number {
    return this.velocity.length()
  }

  get heading(): number {
    return this.group.rotation.y
  }

  /** Current velocity vector (read-only copy for external systems). */
  get currentVelocity(): THREE.Vector3 {
    return this.velocity.clone()
  }

  tick(dt: number): void {
    // Doors and fuel indicators always update (even while frozen/orbiting)
    this.updateDoors(dt)
    this.updateFuelIndicator()
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
    this.doorProgress = Math.abs(step) > Math.abs(diff)
      ? target
      : this.doorProgress + step

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
      const ratio = this.thrusterSystem.fuelCapacity > 0
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

    // Pull toward the body center — accelerating
    const dir = this.deathTarget.clone().sub(this.group.position)
    dir.y = 0
    const dist = dir.length()

    if (dist < 5) {
      // Reached center — respawn
      this.respawn()
      return
    }

    // Accelerate as we fall deeper
    this.deathSpeed = Math.min(this.deathSpeed + DEATH_PULL_ACCELERATION * dt, DEATH_MAX_PULL_SPEED)

    dir.normalize()
    this.group.position.addScaledVector(dir, this.deathSpeed * dt)

    // Follow spacetime curvature — sinking into the well
    if (this.spaceTimeGrid) {
      this.group.position.y = -this.spaceTimeGrid.getDepthAt(
        this.group.position.x,
        this.group.position.z,
      )
    }

    // Tumble: spin on Y and tilt nose down on X
    this.group.rotateY(dt * 8)
    this.group.rotateX(dt * 3)
  }

  respawn(): void {
    this.isDead = false
    this.deathTarget = null
    this.velocity.set(0, 0, 0)
    this.angularVelocity = 0

    const angle = Math.random() * Math.PI * 2
    const radius = SPAWN_MIN_RADIUS + Math.random() * (SPAWN_MAX_RADIUS - SPAWN_MIN_RADIUS)
    this.group.position.set(
      Math.cos(angle) * radius,
      0,
      Math.sin(angle) * radius,
    )
    this.group.rotation.set(0, Math.random() * Math.PI * 2, 0)
  }

  private updateMovement(dt: number): void {
    const p = this.physics

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

    // RCS lateral push — gas thrusters nudge velocity sideways
    const right = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion)
    right.y = 0
    right.normalize()
    if (this.isYawingLeft) {
      this.velocity.addScaledVector(right, -p.yawLateralForce * dt)
    }
    if (this.isYawingRight) {
      this.velocity.addScaledVector(right, p.yawLateralForce * dt)
    }

    // Thrust (W) — accelerate along forward on XZ plane (nose is +X after rotation)
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(this.group.quaternion)
    forward.y = 0 // flatten to XZ plane
    forward.normalize()
    if (this.isThrusting) {
      this.velocity.addScaledVector(forward, p.thrustForce * dt)
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

    // Decay slingshot speed protection
    if (this._slingshotSpeed > p.maxThrustSpeed) {
      const excess = this._slingshotSpeed - p.maxThrustSpeed
      this._slingshotSpeed -= excess * orbitConfig.slingshotDecayRate * dt
    }

    // Clamp thrust-only speed, but allow gravity and slingshot to push beyond
    const currentSpeed = this.velocity.length()
    if (this.isBraking) {
      // Braking cancels slingshot protection
      this._slingshotSpeed = 0
    }
    if (this._slingshotSpeed > p.maxThrustSpeed && currentSpeed <= this._slingshotSpeed) {
      // Slingshot protection — don't clamp
    } else if (this.isThrusting && currentSpeed > p.maxThrustSpeed) {
      this.velocity.setLength(p.maxThrustSpeed)
    } else if (currentSpeed > p.maxGravitySpeed) {
      this.velocity.setLength(p.maxGravitySpeed)
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

    this.thrusterSystem.tick(dt, {
      thrust: this.isThrusting,
      brake: this.isBraking,
      rcs: this.isYawingLeft || this.isYawingRight,
    })
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
}
