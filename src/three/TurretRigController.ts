/**
 * 3D rig for the turret session: attach point on the shuttle nose, camera,
 * beam mesh. State comes from {@link TurretAimState}; this controller is
 * the write-out path to Three.js.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-turret-mode-design.md
 */
import * as THREE from 'three'
import type { TurretAimState } from '@/lib/map/turret/TurretAimState'
import { TURRET_BEAM_MAX_RANGE, TURRET_NOSE_OFFSET } from '@/lib/map/turret/turretConstants'

/**
 * Camera-local muzzle position. Slightly below view center so the beam origin
 * reads as a barrel below the crosshair (standard FPS look), without putting
 * the camera inside the line geometry.
 */
const BEAM_MUZZLE_OFFSET = new THREE.Vector3(0, -0.08, -0.3)

/**
 * Yaw offset applied to turretBase so the camera's default -Z forward aligns
 * with the shuttle's local +X forward (the convention used elsewhere, e.g.
 * `ShuttleController.forward` built from `new Vector3(1,0,0).applyQuaternion`).
 * `-π/2` rotates the camera's -Z to point along +X.
 */
const SHUTTLE_FORWARD_YAW_OFFSET = -Math.PI / 2

/** Rig for the active turret session. Parented under {@link shuttleGroup} on build. */
export class TurretRigController {
  /** Group rotated by base yaw; parent of the camera. */
  readonly turretBase: THREE.Group
  /** First-person perspective camera for the turret view. */
  readonly camera: THREE.PerspectiveCamera
  /** Line primitive used as the beam; toggled visible while firing. */
  readonly beamLine: THREE.Line

  private readonly shuttleGroup: THREE.Object3D
  private readonly beamMaterial: THREE.LineBasicMaterial
  private readonly beamGeometry: THREE.BufferGeometry
  private readonly beamPositions: Float32Array

  constructor(shuttleGroup: THREE.Object3D) {
    this.shuttleGroup = shuttleGroup

    this.turretBase = new THREE.Group()
    this.turretBase.name = 'turretBase'
    this.turretBase.position.set(TURRET_NOSE_OFFSET.x, TURRET_NOSE_OFFSET.y, TURRET_NOSE_OFFSET.z)

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.01, 10_000)
    this.camera.position.set(0, 0, 0)
    this.turretBase.add(this.camera)

    // Two-point line primitive (muzzle -> impact). WebGL line width is always 1
    // pixel, but additive blending + post-bloom make it read as a glowing beam
    // without the perspective cone artifact of a cylinder aligned with the view.
    this.beamPositions = new Float32Array([
      BEAM_MUZZLE_OFFSET.x,
      BEAM_MUZZLE_OFFSET.y,
      BEAM_MUZZLE_OFFSET.z,
      BEAM_MUZZLE_OFFSET.x,
      BEAM_MUZZLE_OFFSET.y,
      BEAM_MUZZLE_OFFSET.z - 1,
    ])
    this.beamGeometry = new THREE.BufferGeometry()
    this.beamGeometry.setAttribute('position', new THREE.BufferAttribute(this.beamPositions, 3))
    this.beamMaterial = new THREE.LineBasicMaterial({
      color: 0x66aaff,
      transparent: true,
      opacity: 1.0,
      toneMapped: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.beamLine = new THREE.Line(this.beamGeometry, this.beamMaterial)
    this.beamLine.visible = false
    this.beamLine.frustumCulled = false
    this.beamLine.renderOrder = 999
    this.camera.add(this.beamLine)
  }

  /** Attach turret base to the shuttle group. Call once on session open. */
  attach(): void {
    if (this.turretBase.parent !== this.shuttleGroup) {
      this.shuttleGroup.add(this.turretBase)
    }
  }

  /** Detach on session close. */
  detach(): void {
    if (this.turretBase.parent) {
      this.turretBase.parent.remove(this.turretBase)
    }
    this.beamLine.visible = false
  }

  /** Apply aim state to base + camera rotations. */
  applyAim(state: TurretAimState): void {
    this.turretBase.rotation.set(0, state.baseYaw + SHUTTLE_FORWARD_YAW_OFFSET, 0)
    this.camera.rotation.set(state.conePitch, 0, 0, 'YXZ')
  }

  /** Show the beam at the given length (meters from muzzle along camera forward). */
  showBeam(lengthMeters: number): void {
    const clamped = Math.min(Math.max(lengthMeters, 0.01), TURRET_BEAM_MAX_RANGE)
    // Update the far endpoint only; muzzle stays pinned.
    this.beamPositions[5] = BEAM_MUZZLE_OFFSET.z - clamped
    const attr = this.beamGeometry.getAttribute('position') as THREE.BufferAttribute
    attr.needsUpdate = true
    this.beamLine.visible = true
  }

  /** Hide the beam (idle / not firing / out of fuel). */
  hideBeam(): void {
    this.beamLine.visible = false
  }

  /** Dispose GL resources. */
  dispose(): void {
    this.detach()
    this.beamMaterial.dispose()
    this.beamGeometry.dispose()
  }
}
