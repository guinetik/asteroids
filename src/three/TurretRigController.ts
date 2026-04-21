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
const BEAM_MUZZLE_OFFSET = new THREE.Vector3(0, -0.5, -0.08)
const BEAM_CORE_WIDTH = 0.028
const BEAM_GLOW_WIDTH = 0.11
const BEAM_HIT_FLASH_SCALE = 0.18
const BEAM_MUZZLE_FLASH_SCALE = 0.1

/** Build a soft circular sprite texture so additive flashes don't show square card edges. */
function createSoftDiscTexture(innerColor: string, outerColor: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('TurretRigController: 2D canvas context unavailable for flash texture')
  }
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  gradient.addColorStop(0, innerColor)
  gradient.addColorStop(0.35, innerColor)
  gradient.addColorStop(0.72, outerColor)
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.clearRect(0, 0, 128, 128)
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(64, 64, 64, 0, Math.PI * 2)
  ctx.fill()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

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
  /** Beam visuals parented under the turret camera. */
  readonly beamGroup: THREE.Group

  private readonly shuttleGroup: THREE.Object3D
  private readonly coreMaterial: THREE.MeshBasicMaterial
  private readonly glowMaterial: THREE.MeshBasicMaterial
  private readonly coreHorizontal: THREE.Mesh
  private readonly coreVertical: THREE.Mesh
  private readonly glowHorizontal: THREE.Mesh
  private readonly glowVertical: THREE.Mesh
  private readonly hitFlashMaterial: THREE.SpriteMaterial
  private readonly hitFlash: THREE.Sprite
  private readonly muzzleFlashMaterial: THREE.SpriteMaterial
  private readonly muzzleFlash: THREE.Sprite
  private readonly hitFlashTexture: THREE.CanvasTexture
  private readonly muzzleFlashTexture: THREE.CanvasTexture
  private readonly ribbonGeometry: THREE.PlaneGeometry

  constructor(shuttleGroup: THREE.Object3D) {
    this.shuttleGroup = shuttleGroup

    this.turretBase = new THREE.Group()
    this.turretBase.name = 'turretBase'
    this.turretBase.position.set(TURRET_NOSE_OFFSET.x, TURRET_NOSE_OFFSET.y, TURRET_NOSE_OFFSET.z)

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.01, 10_000)
    this.camera.position.set(0, 0, 0)
    this.turretBase.add(this.camera)

    this.ribbonGeometry = new THREE.PlaneGeometry(1, 1)
    this.coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xe9fdff,
      transparent: true,
      opacity: 0.96,
      toneMapped: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x2fdcff,
      transparent: true,
      opacity: 0.34,
      toneMapped: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
    this.beamGroup = new THREE.Group()
    this.beamGroup.visible = false
    this.beamGroup.renderOrder = 999

    this.glowHorizontal = this.createRibbon(this.glowMaterial, 'horizontal')
    this.glowVertical = this.createRibbon(this.glowMaterial, 'vertical')
    this.coreHorizontal = this.createRibbon(this.coreMaterial, 'horizontal')
    this.coreVertical = this.createRibbon(this.coreMaterial, 'vertical')
    this.beamGroup.add(
      this.glowHorizontal,
      this.glowVertical,
      this.coreHorizontal,
      this.coreVertical,
    )

    this.hitFlashTexture = createSoftDiscTexture('rgba(220,252,255,1)', 'rgba(64,220,255,0.32)')
    this.hitFlashMaterial = new THREE.SpriteMaterial({
      map: this.hitFlashTexture,
      color: 0x9dfbff,
      transparent: true,
      opacity: 0.88,
      toneMapped: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.hitFlash = new THREE.Sprite(this.hitFlashMaterial)
    this.hitFlash.scale.setScalar(BEAM_HIT_FLASH_SCALE)
    this.beamGroup.add(this.hitFlash)

    this.muzzleFlashTexture = createSoftDiscTexture('rgba(150,245,255,0.9)', 'rgba(47,220,255,0.2)')
    this.muzzleFlashMaterial = new THREE.SpriteMaterial({
      map: this.muzzleFlashTexture,
      color: 0x66efff,
      transparent: true,
      opacity: 0.5,
      toneMapped: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.muzzleFlash = new THREE.Sprite(this.muzzleFlashMaterial)
    this.muzzleFlash.position.copy(BEAM_MUZZLE_OFFSET)
    this.muzzleFlash.scale.setScalar(BEAM_MUZZLE_FLASH_SCALE)
    this.beamGroup.add(this.muzzleFlash)

    this.camera.add(this.beamGroup)
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
    this.beamGroup.visible = false
  }

  /** Apply aim state to base + camera rotations. */
  applyAim(state: TurretAimState): void {
    this.turretBase.rotation.set(0, state.baseYaw + SHUTTLE_FORWARD_YAW_OFFSET, 0)
    this.camera.rotation.set(state.conePitch, 0, 0, 'YXZ')
  }

  /**
   * Show the beam at the given length (meters from muzzle along camera forward).
   * `impactInsetMeters` pushes the visible endpoint slightly past the collision
   * shell so close-range hits read as boring into the asteroid instead of
   * merely touching its surface.
   */
  showBeam(lengthMeters: number, impactInsetMeters = 0): void {
    const clamped = Math.min(
      Math.max(lengthMeters + Math.max(0, impactInsetMeters), 0.01),
      TURRET_BEAM_MAX_RANGE,
    )
    const pulse = 0.9 + Math.sin(performance.now() * 0.03) * 0.1
    const midZ = BEAM_MUZZLE_OFFSET.z - clamped * 0.5
    this.beamGroup.visible = true
    this.setRibbonLength(this.glowHorizontal, BEAM_GLOW_WIDTH * pulse, clamped, midZ, 'horizontal')
    this.setRibbonLength(this.glowVertical, BEAM_GLOW_WIDTH * 0.72 * pulse, clamped, midZ, 'vertical')
    this.setRibbonLength(this.coreHorizontal, BEAM_CORE_WIDTH * pulse, clamped, midZ, 'horizontal')
    this.setRibbonLength(this.coreVertical, BEAM_CORE_WIDTH * 0.72 * pulse, clamped, midZ, 'vertical')
    this.glowMaterial.opacity = 0.34 * pulse
    this.coreMaterial.opacity = 0.9 + (pulse - 0.9) * 0.4
    this.hitFlash.position.set(BEAM_MUZZLE_OFFSET.x, BEAM_MUZZLE_OFFSET.y, BEAM_MUZZLE_OFFSET.z - clamped)
    this.hitFlash.scale.setScalar(BEAM_HIT_FLASH_SCALE * (0.9 + pulse * 0.35))
    this.hitFlashMaterial.opacity = 0.72 * pulse
    this.muzzleFlash.scale.setScalar(BEAM_MUZZLE_FLASH_SCALE * (0.95 + pulse * 0.3))
    this.muzzleFlashMaterial.opacity = 0.45 * pulse
  }

  /** Hide the beam (idle / not firing / out of fuel). */
  hideBeam(): void {
    this.beamGroup.visible = false
  }

  /** Dispose GL resources. */
  dispose(): void {
    this.detach()
    this.ribbonGeometry.dispose()
    this.coreMaterial.dispose()
    this.glowMaterial.dispose()
    this.hitFlashTexture.dispose()
    this.muzzleFlashTexture.dispose()
    this.hitFlashMaterial.dispose()
    this.muzzleFlashMaterial.dispose()
  }

  private createRibbon(
    material: THREE.MeshBasicMaterial,
    orientation: 'horizontal' | 'vertical',
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(this.ribbonGeometry, material)
    if (orientation === 'horizontal') {
      mesh.rotation.x = -Math.PI / 2
    } else {
      mesh.rotation.y = Math.PI / 2
    }
    mesh.frustumCulled = false
    return mesh
  }

  private setRibbonLength(
    mesh: THREE.Mesh,
    width: number,
    length: number,
    zMid: number,
    orientation: 'horizontal' | 'vertical',
  ): void {
    if (orientation === 'horizontal') {
      mesh.scale.set(width, length, 1)
    } else {
      mesh.scale.set(length, width, 1)
    }
    mesh.position.set(BEAM_MUZZLE_OFFSET.x, BEAM_MUZZLE_OFFSET.y, zMid)
  }
}
