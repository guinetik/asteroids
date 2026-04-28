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
import { applyBunkerMeshStandardSpecularSoften } from '@/three/bunker/bunkerMeshStandardSpecularSoften'
import { ANTECHAMBER, ARENA, CORRIDOR, WALL_THICKNESS } from './BunkerWallBuilder'

/** Door slab width: corridor opening plus wall overlap on both sides. */
const DOOR_WIDTH = CORRIDOR.width + WALL_THICKNESS * 2
/** Door slab height: covers the full antechamber/corridor doorway. */
const DOOR_HEIGHT = Math.max(ANTECHAMBER.height, ARENA.height)
/** Extra vertical clearance after the door reaches its open state. */
const DOOR_OPEN_CLEARANCE = 2.5
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
/** Textured metal slab (antechamber arena door) — base roughness before packed map. */
const ARENA_METAL_SLAB_ROUGHNESS = 0.76
/** Reduced from 0.8 so the brushed map does not read as mirror under EVA light. */
const ARENA_METAL_SLAB_METALNESS = 0.38
const ARENA_METAL_SLAB_ENV_MAP_INTENSITY = 0.16
/** Shader mix after roughness map for the same metal set as {@link BunkerHatchModel} pipe. */
const ARENA_METAL_SLAB_SHADER_ROUGH_MIX = 0.44
const ARENA_METAL_SLAB_SHADER_METAL_SCALE = 0.5

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
   * @param useMetallicTexture - Whether to apply the hatch pipe metallic texture to the door slab
   */
  constructor(tint: number, useMetallicTexture: boolean = false) {
    const matOpts: THREE.MeshStandardMaterialParameters = {
      color: 0x101620,
      emissive: tint,
      emissiveIntensity: 0.08,
      metalness: 0.5,
      roughness: 0.55,
    }
    
    if (useMetallicTexture) {
      const texLoader = new THREE.TextureLoader()
      const colorMap = texLoader.load('/textures/metal/color.webp', (t) => { t.needsUpdate = true })
      const normalMap = texLoader.load('/textures/metal/normal.webp', (t) => { t.needsUpdate = true })
      const roughnessMap = texLoader.load('/textures/metal/roughness.webp', (t) => { t.needsUpdate = true })
      const metalnessMap = texLoader.load('/textures/metal/metalness.webp', (t) => { t.needsUpdate = true })
      
      const setupTex = (t: THREE.Texture) => {
        t.wrapS = THREE.RepeatWrapping
        t.wrapT = THREE.RepeatWrapping
        t.repeat.set(2, 2)
      }
      
      setupTex(colorMap)
      colorMap.colorSpace = THREE.SRGBColorSpace
      setupTex(normalMap)
      setupTex(roughnessMap)
      setupTex(metalnessMap)
      
      matOpts.color = 0xb6bec8
      matOpts.map = colorMap
      matOpts.normalMap = normalMap
      matOpts.roughnessMap = roughnessMap
      matOpts.metalnessMap = metalnessMap
      matOpts.metalness = ARENA_METAL_SLAB_METALNESS
      matOpts.roughness = ARENA_METAL_SLAB_ROUGHNESS
      matOpts.envMapIntensity = ARENA_METAL_SLAB_ENV_MAP_INTENSITY
    }

    this.slabMat = new THREE.MeshStandardMaterial(matOpts)
    if (useMetallicTexture) {
      applyBunkerMeshStandardSpecularSoften(this.slabMat, {
        roughnessMixTowardMatte: ARENA_METAL_SLAB_SHADER_ROUGH_MIX,
        metalnessResponseScale: ARENA_METAL_SLAB_SHADER_METAL_SCALE,
      })
    }
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
    this.slab.position.y = DOOR_HEIGHT / 2 + eased * (DOOR_HEIGHT + DOOR_OPEN_CLEARANCE)
    this.seam.position.y =
      this.slab.position.y -
      DOOR_HEIGHT / 2 +
      DOOR_HEIGHT * SEAM_REST_Y_FRACTION +
      Math.sin(this.elapsed * SEAM_OSCILLATION_RATE) * (DOOR_HEIGHT * SEAM_AMPLITUDE_FRACTION)
    this.seamMat.opacity = (1 - this.currentOpen) * SEAM_MAX_OPACITY
    this.seam.visible = this.currentOpen < 1
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
