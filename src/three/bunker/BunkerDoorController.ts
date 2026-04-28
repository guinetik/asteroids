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
/** Door thickness (world units). */
const DOOR_THICKNESS = 0.3
/** Tween duration for open/close in seconds. */
const TWEEN_DURATION = 0.8

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
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    this.seam = new THREE.Mesh(
      new THREE.PlaneGeometry(DOOR_WIDTH, 0.06),
      this.seamMat,
    )
    this.seam.position.set(0, DOOR_HEIGHT * 0.25, DOOR_THICKNESS / 2 + 0.001)
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
    this.seam.position.y = DOOR_HEIGHT * 0.25 + Math.sin(this.elapsed * 4.0) * (DOOR_HEIGHT * 0.18)
    this.seamMat.opacity = (1 - this.currentOpen) * 0.85
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
