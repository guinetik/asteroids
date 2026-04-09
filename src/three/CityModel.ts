/**
 * Instanced GLB prop for `public/models/city.glb`.
 *
 * Preloads once, then clones the scene (via SkeletonUtils `clone`) so geometries
 * stay shared with the cached template. Materials are tuned with {@link fixMaterials}
 * for the shuttle scene point light. Pass {@link CityModelCreateOptions.hologram} to use
 * the shared TRON hologram shader (map intro cloud city).
 *
 * @author guinetik
 * @date 2026-04-09
 * @spec docs/superpowers/specs/2026-04-09-shuttle-city-glb.md
 */
import * as THREE from 'three'
import { clone as cloneSkinnedScene } from 'three/addons/utils/SkeletonUtils.js'
import { fixMaterials, loadGLB } from './loadGLB'
import {
  createTronHologramMaterial,
  disposeTronHologramMaterials,
  syncTronHologramTimeSeconds,
} from './tronHologramMaterial'

/** Public URL path served from `public/models/city.glb`. */
export const CITY_MODEL_PUBLIC_PATH = '/models/city.glb'

/** Uniform scale applied to the cloned city before optional per-instance tuning. */
const DEFAULT_CITY_SCALE = 1

/** Default shadow flags for city meshes. */
const DEFAULT_CAST_SHADOW = true
const DEFAULT_RECEIVE_SHADOW = true

/** Hologram tint — celestial ice-blue for the cloud city. */
const HOLOGRAM_COLOR = new THREE.Color(0x88ccff)

/** Grid-line tint (subtle cool tone). */
const CITY_GRID_TINT = new THREE.Color(0.05, 0.08, 0.12)

/** Options for {@link CityModel.create}. */
export interface CityModelCreateOptions {
  /** Uniform scale applied to the cloned city (default 1). */
  scale?: number
  /** When false, meshes do not cast shadows (default {@link DEFAULT_CAST_SHADOW}). */
  castShadow?: boolean
  /** When false, meshes do not receive shadows (default {@link DEFAULT_RECEIVE_SHADOW}). */
  receiveShadow?: boolean
  /** When true, replaces all materials with a tron hologram shader. */
  hologram?: boolean
}

let cityTemplate: THREE.Group | null = null
let cityTemplatePromise: Promise<THREE.Group> | null = null

/**
 * Load the city GLB once and cache the root group for cloning.
 *
 * @returns The frozen template scene (do not add directly — use {@link CityModel.create})
 */
async function ensureCityTemplate(): Promise<THREE.Group> {
  if (cityTemplate) return cityTemplate
  if (!cityTemplatePromise) {
    cityTemplatePromise = loadGLB(CITY_MODEL_PUBLIC_PATH).then((scene) => {
      fixMaterials(scene)
      cityTemplate = scene
      return scene
    })
  }
  return cityTemplatePromise
}

/**
 * Decorative city GLB — add {@link group} to your scene after {@link CityModel.create}.
 *
 * Geometries may be shared with the preload template. {@link dispose} clears this
 * instance’s group and disposes a hologram material when used (caller removes from scene).
 */
export class CityModel {
  /** Parent group for positioning; contains the cloned mesh hierarchy. */
  readonly group = new THREE.Group()
  /** Present when created with `hologram: true`; disposed in {@link dispose}. */
  private readonly tronMaterial: THREE.ShaderMaterial | null
  private timeSyncMesh: THREE.Mesh | null = null

  private constructor(sceneClone: THREE.Group, tronMaterial: THREE.ShaderMaterial | null) {
    this.tronMaterial = tronMaterial
    this.group.add(sceneClone)
  }

  /**
   * Warm the city GLB so the first {@link CityModel.create} does not hitch.
   */
  static async preload(): Promise<void> {
    await ensureCityTemplate()
  }

  /**
   * Create a new city instance from the shared template.
   *
   * @param options - Scale, shadow tuning, and optional hologram shader
   * @returns A city ready to place via {@link group}
   */
  static async create(options?: CityModelCreateOptions): Promise<CityModel> {
    const template = await ensureCityTemplate()
    const sceneClone = cloneSkinnedScene(template) as THREE.Group

    const scale = options?.scale ?? DEFAULT_CITY_SCALE
    sceneClone.scale.setScalar(scale)

    const castShadow = options?.castShadow ?? DEFAULT_CAST_SHADOW
    const receiveShadow = options?.receiveShadow ?? DEFAULT_RECEIVE_SHADOW
    const useHologram = options?.hologram ?? false
    let tronMaterial: THREE.ShaderMaterial | null = null
    const meshesForTimeSync: THREE.Mesh[] = []

    sceneClone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        mesh.castShadow = castShadow
        mesh.receiveShadow = receiveShadow
        if (useHologram) {
          if (!tronMaterial) {
            tronMaterial = createTronHologramMaterial({
              color: HOLOGRAM_COLOR,
              gridTint: CITY_GRID_TINT,
            })
          }
          mesh.material = tronMaterial
          meshesForTimeSync.push(mesh)
        }
      }
    })

    const model = new CityModel(sceneClone, tronMaterial)
    const timeSyncTarget = meshesForTimeSync[0]
    if (timeSyncTarget && tronMaterial) {
      const mat = tronMaterial
      model.timeSyncMesh = timeSyncTarget
      timeSyncTarget.onBeforeRender = () => {
        syncTronHologramTimeSeconds([mat], performance.now() * 0.001)
      }
    }
    return model
  }

  /**
   * Place the city so it sits above the “north pole” of a sphere at the origin.
   *
   * @param sphereRadius - Radius of the sphere (e.g. shuttle sun visual radius)
   * @param clearance - Extra world units above the sphere surface along +Y
   */
  placeOnTopOfSphere(sphereRadius: number, clearance: number): void {
    this.group.position.set(0, sphereRadius + clearance, 0)
  }

  /**
   * Set yaw in radians around world +Y.
   *
   * @param yawRadians - Rotation about +Y
   */
  setYaw(yawRadians: number): void {
    this.group.rotation.y = yawRadians
  }

  /**
   * Detach cloned meshes from this group. Disposes the hologram material when
   * {@link CityModelCreateOptions.hologram} was used. Does not dispose template geometry.
   */
  dispose(): void {
    if (this.timeSyncMesh) {
      this.timeSyncMesh.onBeforeRender = () => {}
      this.timeSyncMesh = null
    }
    if (this.tronMaterial) {
      disposeTronHologramMaterials([this.tronMaterial])
    }
    this.group.clear()
  }
}
