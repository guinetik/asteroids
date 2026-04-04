/**
 * First-person multi-tool fixture attached to the FPS camera.
 *
 * Loads the multi-tool GLB and parents it to the camera so it stays
 * fixed in the lower-right of the viewport like a classic FPS weapon.
 * Adds subtle idle sway and movement bob for life.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-fps-movement-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import { loadGLB } from './loadGLB'
import partsJson from '@/data/multitool/identified-parts.json'

const MODEL_PATH = '/models/multitool.glb'

/** Node names for the status LEDs that change color per mode. */
const LED_NODE_NAMES = partsJson.statusLeds.map((led) => led.nodeName)

/** Position offset from camera origin (right, down, forward). */
const OFFSET_X = 0.35
const OFFSET_Y = -0.45
const OFFSET_Z = -0.70

const MODEL_SCALE = 0.01

/** Idle sway amplitude (radians). */
const IDLE_SWAY_AMP = 0.008
/** Idle sway speed (radians/s). */
const IDLE_SWAY_SPEED = 1.5

/** Movement bob amplitude (units). */
const MOVE_BOB_AMP = 0.012
/** Movement bob speed multiplier. */
const MOVE_BOB_SPEED = 10

/** Sprint holster tilt — pitch down (radians). */
const SPRINT_TILT = 0.35
/** Jump tilt — barrel tilts up from inertia (radians). */
const JUMP_TILT = 0.3
/** How fast tilt lerps (per second). */
const TILT_LERP_SPEED = 8

/**
 * FPS weapon fixture — loads multi-tool GLB and attaches to camera.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-fps-movement-design.md
 */
export class MultiToolController implements Tickable {
  private model: THREE.Group | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private readonly ledMeshes: THREE.Mesh[] = []
  private time = 0
  private lateralSpeed = 0
  private sprinting = false
  private grounded = true
  private tilt = 0

  /**
   * Load the multi-tool model and attach to the FPS camera.
   *
   * @param camera - The FPS camera to parent the tool to
   */
  /**
   * Load the multi-tool model. Added to the scene in world space,
   * then manually positioned relative to camera each frame in tick().
   *
   * @param camera - The FPS camera to follow
   * @param scene - The Three.js scene to add the model to
   */
  async load(camera: THREE.PerspectiveCamera, scene: THREE.Scene): Promise<void> {
    this.camera = camera
    this.model = await loadGLB(MODEL_PATH)
    this.model.scale.setScalar(MODEL_SCALE)
    this.model.traverse((child) => {
      child.frustumCulled = false
      if (child instanceof THREE.Mesh && LED_NODE_NAMES.includes(child.name)) {
        this.ledMeshes.push(child)
      }
    })
    scene.add(this.model)
  }

  /**
   * Feed current player state for movement bob and holster tilt.
   *
   * @param speed - Player's XZ speed magnitude
   * @param sprinting - Whether the player is sprinting
   * @param grounded - Whether the player is on the ground
   */
  setState(speed: number, sprinting: boolean, grounded: boolean): void {
    this.lateralSpeed = speed
    this.sprinting = sprinting
    this.grounded = grounded
  }

  /**
   * Tint the model mesh to reflect the active tool mode.
   *
   * @param color - Hex color string (e.g. "#3b82f6")
   */
  setMode(color: string): void {
    const ledColor = new THREE.Color(color)
    for (const mesh of this.ledMeshes) {
      if (mesh.material instanceof THREE.MeshStandardMaterial) {
        mesh.material.emissive.copy(ledColor)
        mesh.material.emissiveIntensity = 1.0
        mesh.material.needsUpdate = true
      }
    }
  }

  private readonly offset = new THREE.Vector3()

  tick(dt: number): void {
    if (!this.model || !this.camera) return
    this.time += dt

    // Holster tilt — sprint tilts down, jump tilts up
    const targetTilt = this.sprinting ? SPRINT_TILT : (!this.grounded ? JUMP_TILT : 0)
    this.tilt += (targetTilt - this.tilt) * Math.min(1, TILT_LERP_SPEED * dt)

    // Idle sway — gentle rotation even when standing still
    const swayX = Math.sin(this.time * IDLE_SWAY_SPEED) * IDLE_SWAY_AMP
    const swayZ = Math.cos(this.time * IDLE_SWAY_SPEED * 0.7) * IDLE_SWAY_AMP

    // Movement bob — oscillate position when walking
    const bobPhase = this.time * MOVE_BOB_SPEED
    const bobScale = Math.min(1, this.lateralSpeed * 0.1)
    const bobY = Math.sin(bobPhase) * MOVE_BOB_AMP * bobScale
    const bobX = Math.cos(bobPhase * 0.5) * MOVE_BOB_AMP * bobScale * 0.5

    // Position in camera-local space, then transform to world
    this.offset.set(OFFSET_X + bobX, OFFSET_Y + bobY, OFFSET_Z)
    this.offset.applyQuaternion(this.camera.quaternion)
    this.model.position.copy(this.camera.position).add(this.offset)

    // Rotation: camera rotation + sway
    this.model.quaternion.copy(this.camera.quaternion)
    this.model.rotateX(swayX + this.tilt)
    this.model.rotateY(-Math.PI / 2)
    this.model.rotateZ(swayZ)
  }

  dispose(): void {
    if (this.model) {
      this.model.parent?.remove(this.model)
    }
  }
}
