/**
 * Bunker hatch prop — recessed circular pad with two radial sliding leaves.
 *
 * Same model is used for both the surface hatch (player descends) and the
 * antechamber exit hatch (player extracts). Visual idle: a slow inner-ring
 * pulse when interactable.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */
import * as THREE from 'three'

/** Hatch outer diameter in world units. */
export const HATCH_OUTER_RADIUS = 1.25
/** Open-state radial offset of each half-leaf (world units). */
const OPEN_OFFSET = 1.25
/** Tween duration for open/close in seconds. */
const TWEEN_DURATION = 0.6

/** A single bunker hatch (surface or antechamber). */
export class BunkerHatchModel {
  /** Add this group to the parent scene/group. */
  readonly group = new THREE.Group()

  private readonly leafA: THREE.Mesh
  private readonly leafB: THREE.Mesh
  private readonly ring: THREE.Mesh
  private readonly ringMat: THREE.MeshBasicMaterial
  private readonly tint: number
  private targetOpen = 0
  private currentOpen = 0
  private idlePhase = 0
  /** True when the hatch should pulse (player can interact). */
  active = false

  /**
   * @param tint - Faction tint hex
   */
  constructor(tint: number) {
    this.tint = tint
    this.ringMat = new THREE.MeshBasicMaterial({
      color: tint,
      transparent: true,
      opacity: 0.55,
    })
    const ringGeo = new THREE.RingGeometry(HATCH_OUTER_RADIUS * 0.65, HATCH_OUTER_RADIUS, 48)
    this.ring = new THREE.Mesh(ringGeo, this.ringMat)
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.y = 0.02
    this.group.add(this.ring)

    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x121821,
      emissive: tint,
      emissiveIntensity: 0.15,
      metalness: 0.4,
      roughness: 0.6,
    })
    const leafGeo = new THREE.CylinderGeometry(
      HATCH_OUTER_RADIUS,
      HATCH_OUTER_RADIUS,
      0.2,
      32,
      1,
      false,
      0,
      Math.PI,
    )
    this.leafA = new THREE.Mesh(leafGeo, leafMat)
    this.leafA.position.y = -0.1
    this.leafB = new THREE.Mesh(leafGeo.clone(), leafMat)
    this.leafB.rotation.y = Math.PI
    this.leafB.position.y = -0.1
    this.group.add(this.leafA, this.leafB)
  }

  /** Mark the hatch as open (1) or closed (0); animation follows in `tick`. */
  setOpen(open: boolean): void {
    this.targetOpen = open ? 1 : 0
  }

  /**
   * Advance the open/close tween + idle pulse.
   *
   * @param dt - Delta time in seconds
   */
  tick(dt: number): void {
    const step = dt / TWEEN_DURATION
    if (this.currentOpen < this.targetOpen) {
      this.currentOpen = Math.min(this.targetOpen, this.currentOpen + step)
    } else if (this.currentOpen > this.targetOpen) {
      this.currentOpen = Math.max(this.targetOpen, this.currentOpen - step)
    }
    const offset = OPEN_OFFSET * easeOut(this.currentOpen)
    this.leafA.position.x = -offset
    this.leafB.position.x = offset

    this.idlePhase += dt
    const pulse = this.active ? 0.55 + 0.35 * Math.sin(this.idlePhase * 3.0) : 0.15
    this.ringMat.opacity = pulse
  }

  /** Free GPU resources. */
  dispose(): void {
    this.leafA.geometry.dispose()
    this.leafB.geometry.dispose()
    ;(this.leafA.material as THREE.Material).dispose()
    this.ring.geometry.dispose()
    this.ringMat.dispose()
  }
}

/**
 * Cubic ease-out for the open animation.
 *
 * @param t - 0..1 progress
 */
function easeOut(t: number): number {
  const inv = 1 - t
  return 1 - inv * inv * inv
}
