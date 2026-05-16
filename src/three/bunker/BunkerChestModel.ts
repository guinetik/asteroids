/**
 * Bunker / station loot chest, backed by an authored GLB.
 *
 * The asset ships in its open pose (cover + cover_decals tilted back ~45°).
 * For now the model loads statically and re-uses the legacy emissive-trim
 * recolour cue when looted; cover hinge animation will be wired in a
 * follow-up once placement is dialled in.
 *
 * @author guinetik
 * @date 2026-05-16
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */
import * as THREE from 'three'
import { loadGLB } from '@/three/loadGLB'

/** Asset URL for the optimised chest GLB. */
const CHEST_MODEL_URL = '/models/chest.glb'

/** Emissive colour applied to the chest trim once it has been looted. */
const LOOTED_EMISSIVE_COLOR = 0x5ce7ff

/**
 * Yaw applied to the loaded GLB so the chest's lock face aligns with the
 * group's local -Z axis (Three.js default "forward"). This lets call
 * sites reason about chest facing in the usual way without knowing the
 * Sketchfab asset's authoring orientation.
 */
const CHEST_BASE_YAW = Math.PI / 2

/**
 * Three.js model for the bunker / station loot chest. Construct, add
 * {@link group} to the scene, optionally await {@link load}.
 */
export class BunkerChestModel {
  /** Public scene-graph node — host scene parents this into its room. */
  readonly group = new THREE.Group()

  /** Whether {@link open} has been triggered. Drives interaction prompts. */
  opened = false

  private inner: THREE.Group | null = null
  private emissiveMaterials: THREE.MeshStandardMaterial[] = []
  private loaded = false
  private loadStarted = false

  /** Build an empty wrapper and start streaming the GLB. */
  constructor() {
    this.group.name = 'bunkerChest'
    void this.load()
  }

  /** Stream the GLB and collect emissive materials for the looted recolour. Idempotent. */
  async load(): Promise<void> {
    if (this.loadStarted) return
    this.loadStarted = true

    const inner = await loadGLB(CHEST_MODEL_URL)
    this.inner = inner
    inner.rotation.y = CHEST_BASE_YAW
    this.group.add(inner)
    this.centerAndGround(inner)
    this.collectEmissiveMaterials(inner)

    this.loaded = true
  }

  /** Whether the GLB has finished loading. */
  isLoaded(): boolean {
    return this.loaded
  }

  /**
   * Mark the chest as looted and recolour the emissive trim to cyan.
   * The cover hinge animation will be added in a follow-up — for now
   * this is a static state flip used by the looted-at-distance cue.
   */
  open(): void {
    if (this.opened) return
    this.opened = true

    for (const mat of this.emissiveMaterials) {
      mat.color?.setHex(LOOTED_EMISSIVE_COLOR)
      mat.emissive.setHex(LOOTED_EMISSIVE_COLOR)
    }
  }

  /** Release GPU resources. */
  dispose(): void {
    if (this.inner) {
      this.inner.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          const mats = Array.isArray(child.material) ? child.material : [child.material]
          for (const m of mats) if (m instanceof THREE.Material) m.dispose()
        }
      })
    }
    this.inner = null
    this.emissiveMaterials = []
  }

  /**
   * Translate the loaded GLB so its bounding-box centre sits on the
   * group's X/Z origin and its base rests at Y=0. Sketchfab pivots are
   * usually off-axis, which makes placement math drift otherwise.
   */
  private centerAndGround(inner: THREE.Group): void {
    inner.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(inner)
    if (box.isEmpty()) return
    const center = box.getCenter(new THREE.Vector3())
    inner.position.x -= center.x
    inner.position.z -= center.z
    inner.position.y -= box.min.y
  }

  /**
   * Walk the loaded scene and collect every material with an active
   * emissive colour. Those are the trim materials that get swapped to
   * the looted cyan on {@link open}.
   */
  private collectEmissiveMaterials(inner: THREE.Group): void {
    inner.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.material) return
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (const m of mats) {
        if (m instanceof THREE.MeshStandardMaterial && m.emissive && m.emissive.getHex() > 0) {
          this.emissiveMaterials.push(m)
        }
      }
    })
  }
}
