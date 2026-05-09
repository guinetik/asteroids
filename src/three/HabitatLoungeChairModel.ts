/**
 * Free-standing lounge chair tucked into the corner between the telescope wall
 * (−X) and the hatch wall (−Z). Optional appliance — only loaded when the
 * player profile has the corresponding habitat-appliance unlock flag.
 *
 * @author guinetik
 * @date 2026-05-09
 * @spec docs/superpowers/specs/2026-04-06-habitat-interior-design.md
 */
import * as THREE from 'three'
import { loadGLB } from '@/three/loadGLB'

/** Asset URL for the lounge chair GLB. */
const LOUNGE_CHAIR_MODEL_URL = '/models/lounge_chair.glb'

/**
 * Target longest-dimension size of the lounge chair in world units. Sized so
 * the silhouette reads as a single seat without crowding the corner posters.
 */
const LOUNGE_CHAIR_TARGET_LONGEST_DIMENSION = 2.0

/** Maximum metalness clamp for imported PBR materials. Vinyl/leather, not chrome. */
const LOUNGE_CHAIR_METALNESS_CLAMP = 0.3

/** Minimum roughness clamp for imported PBR materials. */
const LOUNGE_CHAIR_ROUGHNESS_CLAMP = 0.55

/** Maximum emissive intensity allowed on imported materials. */
const LOUNGE_CHAIR_EMISSIVE_CLAMP = 0.3

/**
 * GLB material name owned by the cushion / shell mesh (`Object_4`). The shipped
 * asset paints this in mustard yellow (`#5c2600`); we override it to flat white
 * so the chair reads as cabin furniture rather than a curio-shop accent.
 */
const LOUNGE_CHAIR_CUSHION_MATERIAL_NAME = 'material'

/** Flat white base colour applied to the cushion / shell mesh. */
const LOUNGE_CHAIR_CUSHION_COLOR = 0xeeeeee

/**
 * Lounge chair model wrapper. Drops the inner GLB so its base sits at
 * group-local Y=0; callers place {@link group} at the desired floor spot.
 */
export class HabitatLoungeChairModel {
  /** Public scene-graph node — host scene parents this into the cabin. */
  readonly group: THREE.Group

  /** Inner GLB scene root once loaded. */
  private inner: THREE.Group | null = null

  /** Cached world-space bbox used for player obstacle collision. */
  private readonly worldAabb = new THREE.Box3()

  /** Guards against repeated load() calls. */
  private loaded = false

  /** Build an empty wrapper. Call {@link load} before adding {@link group} to the scene. */
  constructor() {
    this.group = new THREE.Group()
    this.group.name = 'habitatLoungeChair'
  }

  /**
   * Stream the GLB, normalize materials, and scale to
   * {@link LOUNGE_CHAIR_TARGET_LONGEST_DIMENSION}. Idempotent.
   */
  async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true

    const inner = await loadGLB(LOUNGE_CHAIR_MODEL_URL)
    this.tameMaterials(inner)

    const tempBox = new THREE.Box3().setFromObject(inner)
    const size = tempBox.getSize(new THREE.Vector3())
    const longest = Math.max(size.x, size.y, size.z)
    if (longest > 0) {
      inner.scale.setScalar(LOUNGE_CHAIR_TARGET_LONGEST_DIMENSION / longest)
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
   * Recompute the cached world-space AABB. Call after any change to
   * {@link group}'s transform so {@link getCollisionAabb} reflects the new pose.
   */
  refreshAabb(): void {
    this.group.updateMatrixWorld(true)
    if (this.inner) this.worldAabb.setFromObject(this.group)
    else this.worldAabb.makeEmpty()
  }

  /**
   * Returns the cached world-space AABB. Callers should treat the returned value as
   * read-only — clone it before mutating.
   */
  getCollisionAabb(): Readonly<THREE.Box3> {
    return this.worldAabb
  }

  /** Release the inner GLB geometries and materials. */
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
   * Tame imported PBR materials so the asset reads under cabin lighting.
   *
   * @param root - Loaded GLB scene group.
   */
  private tameMaterials(root: THREE.Group): void {
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.material) return
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (const mat of mats) {
        if (mat instanceof THREE.MeshStandardMaterial) {
          if (mat.name === LOUNGE_CHAIR_CUSHION_MATERIAL_NAME) {
            mat.color.setHex(LOUNGE_CHAIR_CUSHION_COLOR)
          }
          mat.metalness = Math.min(mat.metalness, LOUNGE_CHAIR_METALNESS_CLAMP)
          mat.roughness = Math.max(mat.roughness, LOUNGE_CHAIR_ROUGHNESS_CLAMP)
          if (mat.emissiveIntensity > LOUNGE_CHAIR_EMISSIVE_CLAMP) {
            mat.emissiveIntensity = LOUNGE_CHAIR_EMISSIVE_CLAMP
          }
          mat.needsUpdate = true
        }
      }
    })
  }
}
