/**
 * Submarine pressure hatch placed in the station entry foyer. Shows an
 * "F to Leave" prompt within range, spins the knob over a fixed duration
 * when the player presses F, then fires `onExit` once the spin finishes.
 *
 * Mirrors the visual style of the habitat hatch
 * (see `HabitatInteriorScene.ts:400+`) so the player reads it as the
 * same kind of object.
 *
 * @author guinetik
 * @date 2026-05-12
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'

const HATCH_DOOR_RADIUS = 0.66
const HATCH_DOOR_THICKNESS = 0.06
const HATCH_DOOR_SEGMENTS = 48
const HATCH_FRAME_RING_RADIUS = HATCH_DOOR_RADIUS + 0.12
const HATCH_FRAME_TUBE_RADIUS = 0.12
const HATCH_FRAME_RADIAL_SEGMENTS = 16
const HATCH_FRAME_TUBULAR_SEGMENTS = 48
const HATCH_KNOB_RING_RADIUS = 0.19
const HATCH_KNOB_TUBE_RADIUS = 0.045
const HATCH_KNOB_RADIAL_SEGMENTS = 12
const HATCH_KNOB_TUBULAR_SEGMENTS = 32
const HATCH_KNOB_SPOKE_LENGTH = HATCH_KNOB_RING_RADIUS * 2
const HATCH_KNOB_SPOKE_THICKNESS = 0.045
const HATCH_DOOR_SURFACE_OFFSET = 0.05
const HATCH_KNOB_Z_BIAS = HATCH_DOOR_THICKNESS / 2 + 0.02
const HATCH_DOOR_COLOR = 0xeaeaea
const HATCH_DOOR_ROUGHNESS = 0.6
const HATCH_FRAME_COLOR = 0x9aa3ad
const HATCH_FRAME_ROUGHNESS = 0.5
const HATCH_FRAME_METALNESS = 0.4
const HATCH_KNOB_COLOR = 0xf2c438
const HATCH_KNOB_ROUGHNESS = 0.45
const HATCH_KNOB_METALNESS = 0.3
/** XZ proximity (world units) at which the "F Exit" hatch prompt appears. */
export const HATCH_INTERACT_DISTANCE = 1.8
/** Seconds the wheel-knob spin animation lasts. */
const HATCH_KNOB_SPIN_DURATION_S = 0.7
/** Full rotations the knob makes during the spin. */
const HATCH_KNOB_SPIN_TURNS = 2
/** Sentinel value for `_spinTime` meaning "no spin in progress". */
const SPIN_IDLE = -1

/** Options for {@link StationHatchController}. */
export interface StationHatchControllerOptions {
  /** World-space hatch centre (returned by the level loader). */
  position: THREE.Vector3
  /** Yaw in radians; 0 = facing +Z. */
  yaw: number
  /** Fired once when the knob-spin animation completes. */
  onExit: () => void
}

/**
 * Three.js controller for the station exit hatch.
 *
 * Owns the meshes (door, frame, wheel-knob) and the spin animation. The
 * view controller is responsible for proximity detection and for calling
 * {@link triggerExit} when the player presses F within range.
 */
export class StationHatchController implements Tickable {
  /** Root group. Add to the scene. */
  readonly group: THREE.Group
  private readonly _knob: THREE.Group
  private readonly _onExit: () => void
  private _spinTime = SPIN_IDLE
  private _exitFired = false

  constructor(opts: StationHatchControllerOptions) {
    this._onExit = opts.onExit
    this.group = new THREE.Group()
    this.group.position.copy(opts.position)
    this.group.rotation.y = opts.yaw

    // Door disc.
    const door = new THREE.Mesh(
      new THREE.CylinderGeometry(
        HATCH_DOOR_RADIUS,
        HATCH_DOOR_RADIUS,
        HATCH_DOOR_THICKNESS,
        HATCH_DOOR_SEGMENTS,
      ),
      new THREE.MeshStandardMaterial({ color: HATCH_DOOR_COLOR, roughness: HATCH_DOOR_ROUGHNESS }),
    )
    door.rotation.x = Math.PI / 2
    door.position.z = HATCH_DOOR_SURFACE_OFFSET
    this.group.add(door)

    // Frame ring.
    const frame = new THREE.Mesh(
      new THREE.TorusGeometry(
        HATCH_FRAME_RING_RADIUS,
        HATCH_FRAME_TUBE_RADIUS,
        HATCH_FRAME_RADIAL_SEGMENTS,
        HATCH_FRAME_TUBULAR_SEGMENTS,
      ),
      new THREE.MeshStandardMaterial({
        color: HATCH_FRAME_COLOR,
        roughness: HATCH_FRAME_ROUGHNESS,
        metalness: HATCH_FRAME_METALNESS,
      }),
    )
    this.group.add(frame)

    // Knob: torus + crossed spokes.
    this._knob = new THREE.Group()
    this._knob.position.z = HATCH_KNOB_Z_BIAS
    const knobMat = new THREE.MeshStandardMaterial({
      color: HATCH_KNOB_COLOR,
      roughness: HATCH_KNOB_ROUGHNESS,
      metalness: HATCH_KNOB_METALNESS,
    })
    const knobRing = new THREE.Mesh(
      new THREE.TorusGeometry(
        HATCH_KNOB_RING_RADIUS,
        HATCH_KNOB_TUBE_RADIUS,
        HATCH_KNOB_RADIAL_SEGMENTS,
        HATCH_KNOB_TUBULAR_SEGMENTS,
      ),
      knobMat,
    )
    this._knob.add(knobRing)
    const spokeA = new THREE.Mesh(
      new THREE.BoxGeometry(
        HATCH_KNOB_SPOKE_LENGTH,
        HATCH_KNOB_SPOKE_THICKNESS,
        HATCH_KNOB_SPOKE_THICKNESS,
      ),
      knobMat,
    )
    const spokeB = spokeA.clone()
    spokeB.rotation.z = Math.PI / 2
    this._knob.add(spokeA)
    this._knob.add(spokeB)
    this.group.add(this._knob)
  }

  /**
   * Begin the spin animation. The exit callback fires when the spin
   * completes. Repeated calls while a spin is in progress are ignored.
   */
  triggerExit(): void {
    if (this._spinTime >= 0) return
    this._spinTime = 0
    this._exitFired = false
  }

  /**
   * Animate the knob spin. Once the spin finishes, fires the `onExit`
   * callback exactly once.
   *
   * @param dt - Frame delta in seconds.
   */
  tick(dt: number): void {
    if (this._spinTime < 0) return
    this._spinTime += dt
    const t = Math.min(this._spinTime / HATCH_KNOB_SPIN_DURATION_S, 1)
    this._knob.rotation.z = t * HATCH_KNOB_SPIN_TURNS * Math.PI * 2
    if (t >= 1 && !this._exitFired) {
      this._exitFired = true
      this._onExit()
    }
  }

  /** Dispose meshes (geometries + materials) owned by this controller. */
  dispose(): void {
    this.group.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.geometry.dispose()
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) {
        if (m) m.dispose()
      }
    })
  }
}
