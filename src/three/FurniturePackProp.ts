/**
 * Generic GLB-child loader for `/models/furniture_pack.glb`. Each
 * instance picks one named subtree out of the shared pack, deep-clones
 * it, and centres the clone so that:
 *   - the local origin's XZ projection matches the subtree's bbox
 *     centre (`group.position` controls placement),
 *   - the clone's lowest Y sits at `group.position.y` (the floor).
 *
 * The GLB is fetched once and cached at module scope, so adding 12
 * filler boxes to a room costs one network request total. Cloning is
 * deep but materials and geometries are shared — disposal is a no-op
 * on the underlying buffers (the pack lives for the app's lifetime).
 *
 * @author guinetik
 * @date 2026-05-15
 * @spec docs/space-station-update-gdd.md
 */
import * as THREE from 'three'
import { loadGLB } from '@/three/loadGLB'

/** Public-folder URL for the optimized furniture pack GLB. */
const FURNITURE_PACK_MODEL_URL = '/models/furniture_pack.glb'

/**
 * Default target size, in metres, for a prop's longest visible
 * dimension. Per-prop overrides via {@link FurniturePackPropOptions}
 * are encouraged — a crate wants a different size than a table.
 */
export const DEFAULT_FURNITURE_TARGET_LONGEST = 1

/** Module-level cache so multiple instances share one fetch + parse. */
let packPromise: Promise<THREE.Group> | null = null

/**
 * Lazy-load the furniture pack scene once per session. All callers
 * await the same promise; subsequent calls are O(1).
 */
function getFurniturePackScene(): Promise<THREE.Group> {
  if (!packPromise) packPromise = loadGLB(FURNITURE_PACK_MODEL_URL)
  return packPromise
}

/** Constructor options for {@link FurniturePackProp}. */
export interface FurniturePackPropOptions {
  /**
   * Target size in metres for the prop's longest visible dimension.
   * The loader measures the cloned subtree in world space (after
   * baking in any Sketchfab ancestor transforms) and scales
   * uniformly so its longest axis hits this value. Defaults to
   * {@link DEFAULT_FURNITURE_TARGET_LONGEST}.
   */
  targetLongest?: number
}

/**
 * One furniture-pack subtree mounted as a station prop. Construct
 * with the authored node name (e.g. `'box'`, `'chair'`); the GLB is
 * loaded async and the clone is added to {@link group} as soon as
 * it's ready.
 */
export class FurniturePackProp {
  /** Public scene-graph node — host scene parents this into its room. */
  readonly group: THREE.Group

  private inner: THREE.Object3D | null = null
  private loadStarted = false
  private loaded = false
  private readonly targetLongest: number

  /**
   * @param nodeName - Authored top-level node name in
   *   `furniture_pack.glb` (e.g. `'box'`, `'chair'`, `'table'`).
   * @param options - Per-prop overrides, currently just `targetLongest`.
   */
  constructor(
    private readonly nodeName: string,
    options: FurniturePackPropOptions = {},
  ) {
    this.group = new THREE.Group()
    this.group.name = `furniturePack/${nodeName}`
    this.targetLongest = options.targetLongest ?? DEFAULT_FURNITURE_TARGET_LONGEST
    void this.load()
  }

  /**
   * Stream the pack, locate the named subtree, deep-clone it (baking
   * in ancestor transforms), auto-scale to {@link targetLongest},
   * and mount the clone with bbox centred on XZ and base on Y = 0.
   * Idempotent.
   */
  async load(): Promise<void> {
    if (this.loadStarted) return
    this.loadStarted = true

    const scene = await getFurniturePackScene()
    scene.updateMatrixWorld(true)
    const node = scene.getObjectByName(this.nodeName)
    if (!node) {
      console.warn(
        `[FurniturePackProp] node '${this.nodeName}' not found in furniture_pack.glb`,
      )
      return
    }

    const clone = node.clone(true)
    // Bake the source node's full ancestor-product transform into the
    // clone's own local matrix. Without this, Sketchfab's wrapper
    // transforms (often a 100x or 0.01x rescale) are lost the moment
    // we detach the leaf node from its parent chain.
    node.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale)
    clone.updateMatrixWorld(true)

    const rawBbox = new THREE.Box3().setFromObject(clone)
    if (!rawBbox.isEmpty()) {
      const rawSize = rawBbox.getSize(new THREE.Vector3())
      const rawLongest = Math.max(rawSize.x, rawSize.y, rawSize.z)
      if (rawLongest > 0) {
        const fitScale = this.targetLongest / rawLongest
        clone.scale.multiplyScalar(fitScale)
        clone.updateMatrixWorld(true)
      }
      const finalBbox = new THREE.Box3().setFromObject(clone)
      const center = finalBbox.getCenter(new THREE.Vector3())
      clone.position.x -= center.x
      clone.position.z -= center.z
      clone.position.y -= finalBbox.min.y
    }

    this.group.add(clone)
    this.inner = clone
    this.loaded = true
  }

  /** Whether the GLB has finished loading and the clone is mounted. */
  isLoaded(): boolean {
    return this.loaded
  }

  /**
   * Detach the inner clone from the scene graph. Geometries and
   * materials are shared with the cached pack, so this does NOT
   * dispose them — the pack lives for the app's lifetime.
   */
  dispose(): void {
    if (this.inner) {
      this.group.remove(this.inner)
      this.inner = null
    }
  }
}
