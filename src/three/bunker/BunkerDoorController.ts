/**
 * Vertical-slider arena door.
 *
 * Slides up into the wall when {@link setOpen}(true) is called; otherwise
 * sits on the floor blocking the corridor. Closed state has a thin animated
 * scanline along the seam — the visual cue that the door is locked.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */
import * as THREE from 'three'

/** Door clear width (world units). */
const DOOR_WIDTH = 3
/** Door height (world units). */
const DOOR_HEIGHT = 4
/**
 * Door thickness (world units). Must stay below {@link WALL_THICKNESS} (0.4)
 * so the slab fits inside the antechamber's north wall band when centered on
 * `arenaDoorAnchor` per the Task 7 geometry contract — slab z extends ±DOOR_THICKNESS/2
 * from the anchor; wall band extends ±WALL_THICKNESS/2.
 */
const DOOR_THICKNESS = 0.3
/** Tween duration for open/close in seconds. */
const TWEEN_DURATION = 0.8
/** Vertical fraction of door height where the seam sits at rest (0 = floor, 1 = top). */
const SEAM_REST_Y_FRACTION = 0.25
/** Seam scanline oscillation frequency (radians/second). */
const SEAM_OSCILLATION_RATE = 4.0
/** Seam scanline travel amplitude as a fraction of door height. */
const SEAM_AMPLITUDE_FRACTION = 0.18
/** Seam scanline maximum opacity when the door is fully closed. */
const SEAM_MAX_OPACITY = 0.85
/** Tiny forward offset preventing z-fighting between the seam plane and the slab front face. */
const SEAM_Z_BIAS = 0.001

/** A single locking door across the bunker corridor. */
export class BunkerDoorController {
  /** Add this group to the bunker root. */
  readonly group = new THREE.Group()

  private readonly slab: THREE.Mesh
  private readonly slabMat: THREE.MeshStandardMaterial
  private readonly seamMat: THREE.MeshBasicMaterial
  private readonly seam: THREE.Mesh
  private targetOpen = 0
  private currentOpen = 0
  private elapsed = 0

  /**
   * @param tint - Faction tint hex
   */
  constructor(tint: number) {
    this.slabMat = new THREE.MeshStandardMaterial({
      color: 0x101620,
      emissive: tint,
      emissiveIntensity: 0.08,
      metalness: 0.5,
      roughness: 0.55,
    })
    this.slab = new THREE.Mesh(
      new THREE.BoxGeometry(DOOR_WIDTH, DOOR_HEIGHT, DOOR_THICKNESS),
      this.slabMat,
    )
    this.slab.position.y = DOOR_HEIGHT / 2
    this.group.add(this.slab)

    this.seamMat = new THREE.MeshBasicMaterial({
      color: tint,
      transparent: true,
      opacity: SEAM_MAX_OPACITY,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    // PlaneGeometry is front-face-only; player approaches from -z and the seam
    // fades to 0 before they pass through, so the corridor-side view never needs
    // it. See spec section "Visual style — arena door".
    this.seam = new THREE.Mesh(
      new THREE.PlaneGeometry(DOOR_WIDTH, 0.06),
      this.seamMat,
    )
    this.seam.position.set(0, DOOR_HEIGHT * SEAM_REST_Y_FRACTION, DOOR_THICKNESS / 2 + SEAM_Z_BIAS)
    this.group.add(this.seam)
  }

  /** Open or close the door. */
  setOpen(open: boolean): void {
    this.targetOpen = open ? 1 : 0
  }

  /**
   * Advance the slide tween + scanline animation.
   *
   * @param dt - Delta time in seconds
   */
  tick(dt: number): void {
    this.elapsed += dt
    const step = dt / TWEEN_DURATION
    if (this.currentOpen < this.targetOpen) {
      this.currentOpen = Math.min(this.targetOpen, this.currentOpen + step)
    } else if (this.currentOpen > this.targetOpen) {
      this.currentOpen = Math.max(this.targetOpen, this.currentOpen - step)
    }
    const eased = easeOut(this.currentOpen)
    this.slab.position.y = DOOR_HEIGHT / 2 + eased * DOOR_HEIGHT
    this.seam.position.y =
      DOOR_HEIGHT * SEAM_REST_Y_FRACTION +
      Math.sin(this.elapsed * SEAM_OSCILLATION_RATE) * (DOOR_HEIGHT * SEAM_AMPLITUDE_FRACTION)
    this.seamMat.opacity = (1 - this.currentOpen) * SEAM_MAX_OPACITY
  }

  /** Free GPU resources. */
  dispose(): void {
    this.slab.geometry.dispose()
    this.slabMat.dispose()
    this.seam.geometry.dispose()
    this.seamMat.dispose()
  }
}

/**
 * Cubic ease-out for the slide animation.
 *
 * @param t - 0..1 progress
 */
function easeOut(t: number): number {
  const inv = 1 - t
  return 1 - inv * inv * inv
}
