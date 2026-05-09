/**
 * Wall-mounted sideboard / console placed on the hatch wall (−Z), starboard (+X) of
 * the achievement poster grid. Loads `public/models/sideboard.glb`, scales it to a
 * target world size, and exposes a world-space AABB the host scene uses for player
 * obstacle collision.
 *
 * Placement (X, Z, rotation) is driven by the host {@link HabitatInteriorScene}; this
 * class only owns the model + its bbox so future props (coffee machine, record player)
 * can mount on top of {@link group} without coupling to scene geometry.
 *
 * @author guinetik
 * @date 2026-05-09
 * @spec docs/superpowers/specs/2026-04-06-habitat-interior-design.md
 */
import * as THREE from 'three'
import { loadGLB } from '@/three/loadGLB'

/** Asset URL for the sideboard GLB inside the public folder. */
const SIDEBOARD_MODEL_URL = '/models/sideboard.glb'

/**
 * Target longest-dimension size of the sideboard in world units. Tuned so the unit
 * sits comfortably between the hatch grid edge and the +X wall without crowding the
 * cockpit-hatch pressure ring or the bed footprint.
 */
const SIDEBOARD_TARGET_LONGEST_DIMENSION = 1.9

/**
 * Maximum metalness clamp for unknown PBR maps shipped with the GLB. Keeps the
 * sideboard from reading as chrome under the warm interior point light.
 */
const SIDEBOARD_MATERIAL_METALNESS_CLAMP = 0.35

/**
 * Minimum roughness clamp for unknown PBR maps shipped with the GLB. Suppresses
 * mirror-like specular hits from the cabin point light.
 */
const SIDEBOARD_MATERIAL_ROUGHNESS_CLAMP = 0.55

/**
 * Maximum emissive intensity allowed on imported materials. The asset ships with
 * a few panels lit; without a clamp they read as runway lights.
 */
const SIDEBOARD_MATERIAL_EMISSIVE_CLAMP = 0.5

/**
 * Procedural sideboard model wrapper.
 *
 * Instantiate, call {@link load}, then add {@link group} to your scene and set
 * `group.position` / `group.rotation` to taste. Call {@link refreshAabb} after
 * any transform changes to keep {@link getCollisionAabb} in sync.
 */
export class HabitatSideboardModel {
  /** Public scene-graph node — host scene parents this into the cabin. */
  readonly group: THREE.Group

  /** Inner GLB scene root once loaded. */
  private inner: THREE.Group | null = null

  /** Cached world-space bbox used for player obstacle collision. */
  private readonly worldAabb = new THREE.Box3()

  /** Guards against repeated load() calls. */
  private loaded = false

  /**
   * Build an empty wrapper. Call {@link load} before adding {@link group} to the scene.
   */
  constructor() {
    this.group = new THREE.Group()
    this.group.name = 'habitatSideboard'
  }

  /**
   * Stream the GLB, normalize materials, and scale it to {@link
   * SIDEBOARD_TARGET_LONGEST_DIMENSION}. Idempotent — subsequent calls resolve immediately.
   */
  async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true

    const inner = await loadGLB(SIDEBOARD_MODEL_URL)
    this.tameMaterials(inner)

    // Scale to fit the cabin envelope before parenting so the bbox math is stable.
    const tempBox = new THREE.Box3().setFromObject(inner)
    const size = tempBox.getSize(new THREE.Vector3())
    const longest = Math.max(size.x, size.y, size.z)
    if (longest > 0) {
      inner.scale.setScalar(SIDEBOARD_TARGET_LONGEST_DIMENSION / longest)
    }

    // Re-centre on XZ so the wrapper origin sits at the model's footprint centre,
    // and drop the inner so its base rests on group-local Y=0. Host scene then
    // positions group.y = floorY without further offset math.
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

  /**
   * Release the inner GLB geometries and materials. Safe to call before {@link load}
   * resolves; that pending load completes and is then garbage-collected.
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
   * Tame imported PBR materials so the asset reads under the cabin's warm point
   * light without flaring into chrome highlights or runway-bright emissive panels.
   *
   * @param root - Loaded GLB scene group.
   */
  private tameMaterials(root: THREE.Group): void {
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.material) return
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (const mat of mats) {
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.metalness = Math.min(mat.metalness, SIDEBOARD_MATERIAL_METALNESS_CLAMP)
          mat.roughness = Math.max(mat.roughness, SIDEBOARD_MATERIAL_ROUGHNESS_CLAMP)
          if (mat.emissiveIntensity > SIDEBOARD_MATERIAL_EMISSIVE_CLAMP) {
            mat.emissiveIntensity = SIDEBOARD_MATERIAL_EMISSIVE_CLAMP
          }
          mat.needsUpdate = true
        }
      }
    })
  }
}
