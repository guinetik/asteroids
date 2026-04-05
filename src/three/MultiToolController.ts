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

import type { ProjectileSystem } from '@/lib/fps/projectileSystem'

/** Position offset from camera origin (right, down, forward). */
const OFFSET_X = 0.35
const OFFSET_Y = -0.35
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

/** ADS offset — gun moves to center screen. */
const ADS_OFFSET_X = 0.0
const ADS_OFFSET_Y = -0.35
const ADS_OFFSET_Z = -0.50
/** How fast the gun lerps to ADS position (per second). */
const ADS_LERP_SPEED = 12
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
  private triggerLock: THREE.Object3D | null = null
  private lockBaseX = 0
  private lockBaseZ = 0
  private lockSlide = 0
  private lockZSlide = 0
  private currentMode = 'drill'
  private scene: THREE.Scene | null = null
  private projectileSystem: ProjectileSystem | null = null
  private boltColor = new THREE.Color('#ff00ff')
  private time = 0
  private lateralSpeed = 0
  private sprinting = false
  private grounded = true
  private aiming = false
  private tilt = 0
  private currentOffsetX = OFFSET_X
  private currentOffsetY = OFFSET_Y
  private currentOffsetZ = OFFSET_Z

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
    this.scene = scene
    this.model = await loadGLB(MODEL_PATH)
    this.model.scale.setScalar(MODEL_SCALE)
    this.model.traverse((child) => {
      child.frustumCulled = false
      if (child instanceof THREE.Mesh && LED_NODE_NAMES.includes(child.name)) {
        child.material = (child.material as THREE.MeshStandardMaterial).clone()
        this.ledMeshes.push(child)
      }
      if (child.name === 'pistol_trigger_lock') {
        this.triggerLock = child
        this.lockBaseX = child.position.x
        this.lockBaseZ = child.position.z
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

  /** Set ADS state — gun moves to center screen when aiming. */
  setAiming(aiming: boolean): void {
    this.aiming = aiming
  }

  /** Connect the projectile system for firing. */
  setProjectileSystem(system: ProjectileSystem): void {
    this.projectileSystem = system
  }

  /**
   * Tint the model mesh to reflect the active tool mode.
   *
   * @param color - Hex color string (e.g. "#3b82f6")
   */
  setMode(color: string, mode = 'drill'): void {
    this.currentMode = mode
    this.boltColor.set(color)
    const ledColor = new THREE.Color(color)
    for (const mesh of this.ledMeshes) {
      const mat = mesh.material as THREE.MeshStandardMaterial
      // Clear any texture maps that would override the emissive
      mat.map = null
      mat.emissiveMap = null
      mat.color.set(0x000000)
      mat.emissive.copy(ledColor)
      mat.emissiveIntensity = 1.5
      mat.needsUpdate = true
    }
  }

  /**
   * Fire a bolt projectile from the gun barrel toward the crosshair.
   * Delegates to ProjectileSystem for lifecycle and collision.
   */
  fire(): void {
    if (!this.camera || !this.projectileSystem) return

    // Aim point: far along camera forward (where crosshair points)
    const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion)
    const aimPoint = this.camera.position.clone().addScaledVector(camForward, 500)

    // Origin: barrel tip in camera space
    const origin = this.camera.position.clone()
    const camDown = new THREE.Vector3(0, -1, 0).applyQuaternion(this.camera.quaternion)
    origin.addScaledVector(camForward, 1.8)
    origin.addScaledVector(camDown, 0.15)

    // Direction: from barrel toward aim point (converges on crosshair)
    const direction = aimPoint.sub(origin).normalize()

    this.projectileSystem.spawn(origin, direction, this.boltColor)
  }

  private readonly offset = new THREE.Vector3()

  tick(dt: number): void {
    if (!this.model || !this.camera) return
    this.time += dt

    // Lerp offset between hip and ADS positions
    const targetX = this.aiming ? ADS_OFFSET_X : OFFSET_X
    const targetY = this.aiming ? ADS_OFFSET_Y : OFFSET_Y
    const targetZ = this.aiming ? ADS_OFFSET_Z : OFFSET_Z
    const lerpFactor = Math.min(1, ADS_LERP_SPEED * dt)
    this.currentOffsetX += (targetX - this.currentOffsetX) * lerpFactor
    this.currentOffsetY += (targetY - this.currentOffsetY) * lerpFactor
    this.currentOffsetZ += (targetZ - this.currentOffsetZ) * lerpFactor

    // Holster tilt — sprint tilts down, jump tilts up, suppressed while ADS
    const targetTilt = this.aiming ? 0
      : (this.sprinting ? SPRINT_TILT : (!this.grounded ? JUMP_TILT : 0))
    this.tilt += (targetTilt - this.tilt) * Math.min(1, TILT_LERP_SPEED * dt)

    // Idle sway — suppressed while ADS
    const swayScale = this.aiming ? 0.1 : 1
    const swayX = Math.sin(this.time * IDLE_SWAY_SPEED) * IDLE_SWAY_AMP * swayScale
    const swayZ = Math.cos(this.time * IDLE_SWAY_SPEED * 0.7) * IDLE_SWAY_AMP * swayScale

    // Movement bob — only when grounded and not ADS
    const bobPhase = this.time * MOVE_BOB_SPEED
    const bobScale = (this.grounded && !this.aiming) ? Math.min(1, this.lateralSpeed * 0.1) : 0
    const bobY = Math.sin(bobPhase) * MOVE_BOB_AMP * bobScale
    const bobX = Math.cos(bobPhase * 0.5) * MOVE_BOB_AMP * bobScale * 0.5

    // Position in camera-local space, then transform to world
    this.offset.set(this.currentOffsetX + bobX, this.currentOffsetY + bobY, this.currentOffsetZ)
    this.offset.applyQuaternion(this.camera.quaternion)
    this.model.position.copy(this.camera.position).add(this.offset)

    // Rotation: camera rotation + sway
    this.model.quaternion.copy(this.camera.quaternion)
    this.model.rotateX(swayX + this.tilt)
    this.model.rotateY(-Math.PI / 2)
    this.model.rotateZ(swayZ)

    // Trigger lock — slides back toward player when drill + stationary
    // In ADS: also shifts sideways (Z) so lock is visible while zoomed
    if (this.triggerLock) {
      const unlocked = this.currentMode === 'drill' && this.lateralSpeed < 0.1
      const targetSlide = unlocked ? 4.0 : 0
      this.lockSlide += (targetSlide - this.lockSlide) * Math.min(1, 8 * dt)
      this.triggerLock.position.x = this.lockBaseX + this.lockSlide

      const targetZ = this.aiming ? 4.0 : 0
      this.lockZSlide += (targetZ - this.lockZSlide) * Math.min(1, 8 * dt)
      this.triggerLock.position.z = this.lockBaseZ + this.lockZSlide
    }
  }

  dispose(): void {
    if (this.model) {
      this.model.parent?.remove(this.model)
    }
  }
}
