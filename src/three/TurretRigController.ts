/**
 * 3D rig for the turret session: attach point on the shuttle nose, camera,
 * beam mesh, reticle sprite. State comes from {@link TurretAimState}; this
 * controller is the write-out path to Three.js.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-turret-mode-design.md
 */
import * as THREE from 'three'
import type { TurretAimState } from '@/lib/map/turret/TurretAimState'
import {
  TURRET_BEAM_MAX_RANGE,
  TURRET_NOSE_OFFSET,
} from '@/lib/map/turret/turretConstants'

const BEAM_BASE_LENGTH = 1
const BEAM_RADIUS = 0.08
/**
 * Camera-local offset for the beam origin. Shifting slightly below-and-ahead of
 * the camera puts the camera OUTSIDE the cylinder (not inside its axis, where
 * only the near endcap would be visible). The result reads like a shoulder- or
 * hood-mounted laser firing forward — classic FPS weapon placement.
 */
const BEAM_MUZZLE_OFFSET = new THREE.Vector3(0, -0.25, -0.5)

/**
 * Yaw offset applied to turretBase so the camera's default -Z forward aligns
 * with the shuttle's local +X forward (the convention used elsewhere, e.g.
 * `ShuttleController.forward` built from `new Vector3(1,0,0).applyQuaternion`).
 * `-π/2` rotates the camera's -Z to point along +X; `+π/2` points the
 * opposite way (tail), which is the bug that left the player looking
 * backward at the shuttle's fin.
 */
const SHUTTLE_FORWARD_YAW_OFFSET = -Math.PI / 2

/** Rig for the active turret session. Parented under {@link shuttleGroup} on build. */
export class TurretRigController {
  /** Group rotated by base yaw; parent of the camera. */
  readonly turretBase: THREE.Group
  /** First-person perspective camera for the turret view. */
  readonly camera: THREE.PerspectiveCamera
  /** Beam mesh (camera-local cylinder); toggled visible while firing. */
  readonly beamMesh: THREE.Mesh

  private readonly shuttleGroup: THREE.Object3D
  private readonly beamMaterial: THREE.MeshBasicMaterial

  constructor(shuttleGroup: THREE.Object3D) {
    this.shuttleGroup = shuttleGroup

    this.turretBase = new THREE.Group()
    this.turretBase.name = 'turretBase'
    this.turretBase.position.set(TURRET_NOSE_OFFSET.x, TURRET_NOSE_OFFSET.y, TURRET_NOSE_OFFSET.z)

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.01, 10_000)
    this.camera.position.set(0, 0, 0)
    this.turretBase.add(this.camera)

    // Beam: cylinder along +Z, child of camera so it follows aim.
    const beamGeom = new THREE.CylinderGeometry(BEAM_RADIUS, BEAM_RADIUS, BEAM_BASE_LENGTH, 8, 1)
    beamGeom.rotateX(Math.PI / 2) // align cylinder length with +Z
    beamGeom.translate(0, 0, -BEAM_BASE_LENGTH / 2) // near end at camera origin
    this.beamMaterial = new THREE.MeshBasicMaterial({
      color: 0x66aaff,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.beamMesh = new THREE.Mesh(beamGeom, this.beamMaterial)
    this.beamMesh.visible = false
    // Offset the beam's origin so the camera is outside the cylinder's volume;
    // otherwise the camera looks straight down the beam axis and only sees the
    // tiny end cap.
    this.beamMesh.position.copy(BEAM_MUZZLE_OFFSET)
    // Disable frustum culling — the scaled cylinder's bounding sphere may not
    // cover the full length after the dynamic Z-scale, causing the beam to be
    // culled when the camera moves.
    this.beamMesh.frustumCulled = false
    // Render after opaque geometry so the additive blend lands on top.
    this.beamMesh.renderOrder = 999
    this.camera.add(this.beamMesh)
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
    this.beamMesh.visible = false
  }

  /** Apply aim state to base + camera rotations. */
  applyAim(state: TurretAimState): void {
    this.turretBase.rotation.set(0, state.baseYaw + SHUTTLE_FORWARD_YAW_OFFSET, 0)
    this.camera.rotation.set(state.conePitch, 0, 0, 'YXZ')
  }

  /** Show the beam cylinder at the given length (meters). */
  showBeam(lengthMeters: number): void {
    const clamped = Math.min(Math.max(lengthMeters, 0.01), TURRET_BEAM_MAX_RANGE)
    this.beamMesh.scale.set(1, 1, clamped / BEAM_BASE_LENGTH)
    if (!this.beamMesh.visible) {
      this.beamMesh.visible = true
      console.log('[Turret] beam visible, length=', clamped.toFixed(1), 'parent=', this.beamMesh.parent?.type)
    }
  }

  /** Hide the beam (idle / not firing / out of fuel). */
  hideBeam(): void {
    this.beamMesh.visible = false
  }

  /** Dispose GL resources. */
  dispose(): void {
    this.detach()
    this.beamMaterial.dispose()
    if (this.beamMesh.geometry) this.beamMesh.geometry.dispose()
  }
}
