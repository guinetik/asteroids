// src/three/ShuttleController.ts
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import type { Tickable } from '@/lib/Tickable'
import type { InputManager } from '@/lib/InputManager'

const SHUTTLE_MODEL_PATH = '/models/shuttle.glb'
const DRACO_DECODER_PATH = '/node_modules/three/examples/jsm/libs/draco/'

const SHUTTLE_ANIMATION_NAME = 'shutAction'

const THRUST_FORCE = 8
const BRAKE_FACTOR = 0.95
const STRAFE_FORCE = 6
const YAW_SPEED = 2
const MAX_SPEED = 30

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

  private mixer: THREE.AnimationMixer | null = null
  private doorAction: THREE.AnimationAction | null = null
  private doorsOpen = false
  private velocity = new THREE.Vector3()
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
    this.group.add(gltf.scene)

    this.mixer = new THREE.AnimationMixer(gltf.scene)

    const doorClip = gltf.animations.find((clip) => clip.name === SHUTTLE_ANIMATION_NAME)
    if (doorClip) {
      this.doorAction = this.mixer.clipAction(doorClip)
      this.doorAction.clampWhenFinished = true
      this.doorAction.loop = THREE.LoopOnce
    }

    this.placeNozzles(gltf.scene)

    dracoLoader.dispose()
  }

  toggleDoors(): void {
    if (!this.doorAction) return

    if (this.doorsOpen) {
      this.doorAction.timeScale = -1
      this.doorAction.paused = false
      if (this.doorAction.time === 0) {
        this.doorAction.time = this.doorAction.getClip().duration
      }
      this.doorAction.play()
    } else {
      this.doorAction.timeScale = 1
      this.doorAction.paused = false
      this.doorAction.reset()
      this.doorAction.play()
    }

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
    this.mixer?.update(dt)
  }

  dispose(): void {
    this.mixer?.stopAllAction()
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

  private updateMovement(dt: number): void {
    const input = this.inputManager
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.group.quaternion)

    // Yaw
    if (input.isActionActive('yawLeft')) {
      this.group.rotateY(YAW_SPEED * dt)
    }
    if (input.isActionActive('yawRight')) {
      this.group.rotateY(-YAW_SPEED * dt)
    }

    // Thrust
    if (input.isActionActive('thrust')) {
      this.velocity.addScaledVector(forward, THRUST_FORCE * dt)
    }

    // Brake (inertia dampener)
    if (input.isActionActive('brake')) {
      this.velocity.multiplyScalar(BRAKE_FACTOR)
    }

    // Strafe
    if (input.isActionActive('strafeLeft')) {
      this.velocity.addScaledVector(right, -STRAFE_FORCE * dt)
    }
    if (input.isActionActive('strafeRight')) {
      this.velocity.addScaledVector(right, STRAFE_FORCE * dt)
    }

    // Clamp speed
    if (this.velocity.length() > MAX_SPEED) {
      this.velocity.setLength(MAX_SPEED)
    }

    // Apply velocity
    this.group.position.addScaledVector(this.velocity, dt)
  }

  private placeNozzles(scene: THREE.Object3D): void {
    const engNode = this.findNode(scene, 'eng')
    const rcsNode = this.findNode(scene, 'rcs')

    const omsBackNodes: THREE.Object3D[] = []
    scene.traverse((child) => {
      if (child.name.includes('OMS') && child.name.toLowerCase().includes('back')) {
        omsBackNodes.push(child)
      }
    })

    if (omsBackNodes.length > 0 && engNode) {
      const targetPos = new THREE.Vector3()
      omsBackNodes[0]!.getWorldPosition(targetPos)
      engNode.position.copy(targetPos)
    }

    if (omsBackNodes.length > 1 && rcsNode) {
      const targetPos = new THREE.Vector3()
      omsBackNodes[1]!.getWorldPosition(targetPos)
      rcsNode.position.copy(targetPos)
    }
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
