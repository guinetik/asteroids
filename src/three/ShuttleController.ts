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
import type { PortalVehicle } from './PortalArrivalSequence'

/** Any object that can exert gravity on the shuttle */
interface GravityWell {
  getGravityAt(position: THREE.Vector3): THREE.Vector3
}

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
const CARGO_LANDER_OFFSET = new THREE.Vector3(-285, 0, 20)

const THRUST_FORCE = 12
const BRAKE_FACTOR = 0.93
const BRAKE_DEPTH_PENALTY = 0.002 // brake effectiveness lost per unit of well depth
const YAW_TORQUE = 2.5 // angular acceleration per second
const YAW_LATERAL_FORCE = 2 // small lateral push from RCS gas (no combustion)
const YAW_MAX_SPEED = 3.5 // max angular velocity
const YAW_DAMPING = 0.98 // gentle angular friction per frame
const MAX_THRUST_SPEED = 60 // max speed from player thrust alone
const MAX_GRAVITY_SPEED = 150 // gravity can push you way past thrust max

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

  private angularVelocity = 0
  private readonly inputManager: InputManager
  private spaceTimeGrid: SpaceTimeGrid | null = null
  private readonly gravityWells: GravityWell[] = []
  private readonly gravitySources: GravitySource[] = []
  readonly thrusterSystem = new ThrusterSystem<ShuttleThrusterName>(DEFAULT_SHUTTLE_CONFIG)
  private isDead = false
  private deathTarget: THREE.Vector3 | null = null
  private deathSpeed = 0

  constructor(inputManager: InputManager) {
    this.inputManager = inputManager
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
    return this.inputManager.isActionActive('thrust') && this.thrusterSystem.canFire('thrust')
  }

  get isBraking(): boolean {
    return this.inputManager.isActionActive('brake') && this.thrusterSystem.canFire('brake')
  }

  get isYawingLeft(): boolean {
    return this.inputManager.isActionActive('yawLeft') && this.thrusterSystem.canFire('rcs')
  }

  get isYawingRight(): boolean {
    return this.inputManager.isActionActive('yawRight') && this.thrusterSystem.canFire('rcs')
  }

  get speed(): number {
    return this.velocity.length()
  }

  get heading(): number {
    return this.group.rotation.y
  }

  tick(dt: number): void {
    if (this.frozen) return
    if (this.isDead) {
      this.updateDeath(dt)
      return
    }
    this.updateMovement(dt)
    this.updateDoors(dt)
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
    // Yaw (A/D) — apply angular torque, builds up angular velocity
    if (this.isYawingLeft) {
      this.angularVelocity += YAW_TORQUE * dt
    }
    if (this.isYawingRight) {
      this.angularVelocity -= YAW_TORQUE * dt
    }

    // Gentle damping so it doesn't spin forever
    this.angularVelocity *= YAW_DAMPING

    // Clamp angular velocity
    this.angularVelocity = Math.max(-YAW_MAX_SPEED, Math.min(YAW_MAX_SPEED, this.angularVelocity))

    // Apply angular velocity
    this.group.rotateY(this.angularVelocity * dt)

    // RCS lateral push — gas thrusters nudge velocity sideways
    const right = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion)
    right.y = 0
    right.normalize()
    if (this.isYawingLeft) {
      this.velocity.addScaledVector(right, -YAW_LATERAL_FORCE * dt)
    }
    if (this.isYawingRight) {
      this.velocity.addScaledVector(right, YAW_LATERAL_FORCE * dt)
    }

    // Thrust (W) — accelerate along forward on XZ plane (nose is +X after rotation)
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(this.group.quaternion)
    forward.y = 0 // flatten to XZ plane
    forward.normalize()
    if (this.isThrusting) {
      this.velocity.addScaledVector(forward, THRUST_FORCE * dt)
    }

    // Brake (S) — inertia dampener, weaker deeper in gravity wells
    if (this.isBraking) {
      const depth = Math.abs(this.group.position.y)
      const effectiveBrake = Math.min(1, BRAKE_FACTOR + depth * BRAKE_DEPTH_PENALTY)
      this.velocity.multiplyScalar(effectiveBrake)
    }

    // Gravitational pull from all wells
    for (const well of this.gravityWells) {
      const gravity = well.getGravityAt(this.group.position)
      this.velocity.addScaledVector(gravity, dt)
    }

    // Lock velocity to XZ plane
    this.velocity.y = 0

    // Clamp thrust-only speed, but allow gravity to push beyond
    const currentSpeed = this.velocity.length()
    if (this.isThrusting && currentSpeed > MAX_THRUST_SPEED) {
      this.velocity.setLength(MAX_THRUST_SPEED)
    } else if (currentSpeed > MAX_GRAVITY_SPEED) {
      this.velocity.setLength(MAX_GRAVITY_SPEED)
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
