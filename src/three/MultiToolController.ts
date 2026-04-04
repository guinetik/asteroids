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

const MODEL_PATH = '/models/multitool.glb'

/** Position offset from camera origin (right, down, forward). */
const OFFSET_X = 0.4
const OFFSET_Y = -0.35
const OFFSET_Z = -0.6

const MODEL_SCALE = 0.008

/** Idle sway amplitude (radians). */
const IDLE_SWAY_AMP = 0.008
/** Idle sway speed (radians/s). */
const IDLE_SWAY_SPEED = 1.5

/** Movement bob amplitude (units). */
const MOVE_BOB_AMP = 0.012
/** Movement bob speed multiplier. */
const MOVE_BOB_SPEED = 10

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
  private time = 0
  private lateralSpeed = 0

  /**
   * Load the multi-tool model and attach to the FPS camera.
   *
   * @param camera - The FPS camera to parent the tool to
   */
  async load(camera: THREE.PerspectiveCamera): Promise<void> {
    this.camera = camera
    this.model = await loadGLB(MODEL_PATH)
    this.model.scale.setScalar(MODEL_SCALE)
    this.model.position.set(OFFSET_X, OFFSET_Y, OFFSET_Z)
    this.model.rotation.set(0, -Math.PI / 2, 0)
    camera.add(this.model)
  }

  /**
   * Feed current lateral speed for movement bob.
   *
   * @param speed - Player's XZ speed magnitude
   */
  setSpeed(speed: number): void {
    this.lateralSpeed = speed
  }

  tick(dt: number): void {
    if (!this.model) return
    this.time += dt

    // Idle sway — gentle rotation even when standing still
    const swayX = Math.sin(this.time * IDLE_SWAY_SPEED) * IDLE_SWAY_AMP
    const swayZ = Math.cos(this.time * IDLE_SWAY_SPEED * 0.7) * IDLE_SWAY_AMP

    // Movement bob — oscillate position when walking
    const bobPhase = this.time * MOVE_BOB_SPEED
    const bobScale = Math.min(1, this.lateralSpeed * 0.1)
    const bobY = Math.sin(bobPhase) * MOVE_BOB_AMP * bobScale
    const bobX = Math.cos(bobPhase * 0.5) * MOVE_BOB_AMP * bobScale * 0.5

    this.model.position.set(
      OFFSET_X + bobX,
      OFFSET_Y + bobY,
      OFFSET_Z,
    )
    this.model.rotation.set(swayX, 0, swayZ)
  }

  dispose(): void {
    if (this.model && this.camera) {
      this.camera.remove(this.model)
    }
  }
}
