// src/three/ShuttleController.ts
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import type { Tickable } from '@/lib/Tickable'
import type { InputManager } from '@/lib/InputManager'

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

const DOOR_OPEN_ANGLE = Math.PI * 0.6 // ~108 degrees, payload bay doors open wide
const DOOR_ANIM_SPEED = 2 // radians per second

const THRUST_FORCE = 20
const BRAKE_FACTOR = 0.95
const YAW_SPEED = 1.5
const ROLL_SPEED = 2
const BANK_ANGLE = 0.4 // radians — how far the ship tilts when yawing
const BANK_LERP_SPEED = 4 // how fast the ship banks/unbanks
const MAX_SPEED = 80

/**
 * Controls the shuttle model — loading, door animation, movement, and nozzle placement.
 * Implements Tickable for per-frame physics and animation updates.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
export class ShuttleController implements Tickable {
  readonly group = new THREE.Group()

  private doorsOpen = false
  private doorProgress = 0 // 0 = closed, 1 = open
  private doorPortNode: THREE.Object3D | null = null
  private doorStbNode: THREE.Object3D | null = null
  private doorPortClosedRotX = 0
  private doorStbClosedRotX = 0
  private velocity = new THREE.Vector3()
  private currentBank = 0
  private readonly inputManager: InputManager

  constructor(inputManager: InputManager) {
    this.inputManager = inputManager
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

    dracoLoader.dispose()
  }

  toggleDoors(): void {
    this.doorsOpen = !this.doorsOpen
  }

  get position(): THREE.Vector3 {
    return this.group.position
  }

  get isThrusting(): boolean {
    return this.inputManager.isActionActive('thrust')
  }

  get isBraking(): boolean {
    return this.inputManager.isActionActive('brake')
  }

  tick(dt: number): void {
    this.updateMovement(dt)
    this.updateDoors(dt)
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

  private updateMovement(dt: number): void {
    const input = this.inputManager

    // Yaw (A/D) — turn left/right
    let targetBank = 0
    if (input.isActionActive('yawLeft')) {
      this.group.rotateY(YAW_SPEED * dt)
      targetBank = BANK_ANGLE
    }
    if (input.isActionActive('yawRight')) {
      this.group.rotateY(-YAW_SPEED * dt)
      targetBank = -BANK_ANGLE
    }

    // Bank (visual tilt into turns) — lerp toward target
    this.currentBank += (targetBank - this.currentBank) * BANK_LERP_SPEED * dt
    this.group.rotation.z = this.currentBank

    // Roll (Q/E)
    if (input.isActionActive('rollLeft')) {
      this.group.rotateZ(ROLL_SPEED * dt)
    }
    if (input.isActionActive('rollRight')) {
      this.group.rotateZ(-ROLL_SPEED * dt)
    }

    // Thrust (W) — accelerate along forward direction (nose is +X after rotation)
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(this.group.quaternion)
    if (input.isActionActive('thrust')) {
      this.velocity.addScaledVector(forward, THRUST_FORCE * dt)
    }

    // Brake (S) — inertia dampener
    if (input.isActionActive('brake')) {
      this.velocity.multiplyScalar(BRAKE_FACTOR)
    }

    // Clamp speed
    if (this.velocity.length() > MAX_SPEED) {
      this.velocity.setLength(MAX_SPEED)
    }

    // Apply velocity
    this.group.position.addScaledVector(this.velocity, dt)
  }

  private placeNozzles(scene: THREE.Object3D): void {
    // Hide eng/rcs nodes — they sit at origin (inside the shuttle) and
    // need manual alignment that isn't possible without a DCC reference.
    const engNode = this.findNode(scene, 'eng')
    const rcsNode = this.findNode(scene, 'rcs')
    if (engNode) engNode.visible = false
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
