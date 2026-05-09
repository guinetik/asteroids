/**
 * Counter-top record player prop. Mounts on the habitat sideboard top surface
 * with its base flush — host scene only needs to set {@link group} world
 * position + rotation.
 *
 * @author guinetik
 * @date 2026-05-09
 * @spec docs/superpowers/specs/2026-04-06-habitat-interior-design.md
 */
import * as THREE from 'three'
import { loadGLB } from '@/three/loadGLB'

/** Asset URL for the record player GLB. */
const RECORD_PLAYER_MODEL_URL = '/models/record_player.glb'

/** Target longest-dimension size of the record player in world units. */
const RECORD_PLAYER_TARGET_LONGEST_DIMENSION = 0.7

/** Maximum metalness clamp for imported PBR materials. */
const RECORD_PLAYER_METALNESS_CLAMP = 0.45

/** Minimum roughness clamp for imported PBR materials. */
const RECORD_PLAYER_ROUGHNESS_CLAMP = 0.5

/** Maximum emissive intensity allowed on imported materials (vu meters / LEDs). */
const RECORD_PLAYER_EMISSIVE_CLAMP = 0.4

/**
 * Record player model wrapper. Designed to mount on the sideboard top — the
 * inner GLB is dropped so its base sits at group-local Y=0; callers place
 * {@link group} at the sideboard's world top Y plus a tiny clearance.
 */
export class HabitatRecordPlayerModel {
  /** Public scene-graph node — host scene parents this into the cabin. */
  readonly group: THREE.Group

  /** Inner GLB scene root once loaded. */
  private inner: THREE.Group | null = null

  /** Guards against repeated load() calls. */
  private loaded = false

  /** Build an empty wrapper. Call {@link load} before adding {@link group} to the scene. */
  constructor() {
    this.group = new THREE.Group()
    this.group.name = 'habitatRecordPlayer'
  }

  /**
   * Stream the GLB, normalize materials, scale to {@link RECORD_PLAYER_TARGET_LONGEST_DIMENSION},
   * and drop the base to local Y=0 so the host scene can mount the unit on a flat surface.
   */
  async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true

    const inner = await loadGLB(RECORD_PLAYER_MODEL_URL)
    this.tameMaterials(inner)

    const tempBox = new THREE.Box3().setFromObject(inner)
    const size = tempBox.getSize(new THREE.Vector3())
    const longest = Math.max(size.x, size.y, size.z)
    if (longest > 0) {
      inner.scale.setScalar(RECORD_PLAYER_TARGET_LONGEST_DIMENSION / longest)
    }

    inner.updateMatrixWorld(true)
    const scaledBox = new THREE.Box3().setFromObject(inner)
    const centre = scaledBox.getCenter(new THREE.Vector3())
    inner.position.x -= centre.x
    inner.position.z -= centre.z
    inner.position.y -= scaledBox.min.y

    this.group.add(inner)
    this.inner = inner
  }

  /**
   * Release the inner GLB geometries and materials.
   */
  dispose(): void {
    if (!this.inner) return
    this.inner.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        for (const mat of mats) mat.dispose()
      }
    })
    this.group.remove(this.inner)
    this.inner = null
  }

  /**
   * Tame imported PBR materials so the asset reads under cabin lighting without
   * chrome highlights or bright VU meter LEDs.
   *
   * @param root - Loaded GLB scene group.
   */
  private tameMaterials(root: THREE.Group): void {
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.material) return
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (const mat of mats) {
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.metalness = Math.min(mat.metalness, RECORD_PLAYER_METALNESS_CLAMP)
          mat.roughness = Math.max(mat.roughness, RECORD_PLAYER_ROUGHNESS_CLAMP)
          if (mat.emissiveIntensity > RECORD_PLAYER_EMISSIVE_CLAMP) {
            mat.emissiveIntensity = RECORD_PLAYER_EMISSIVE_CLAMP
          }
          mat.needsUpdate = true
        }
      }
    })
  }
}
