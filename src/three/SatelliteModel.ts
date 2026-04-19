/**
 * GLB prop for `public/models/satellite.glb`.
 *
 * Preloads once, then clones the scene so geometries stay shared with the cached
 * template. Supports a local rotation (to reorient the asset's native axes). The GLB
 * ships fully textured — no TRON-panel override pipeline — so `dispose` only needs to
 * detach the cloned scene.
 *
 * @author guinetik
 * @date 2026-04-18
 * @spec docs/asteroid-lander-gdd.md
 */
import * as THREE from 'three'
import { clone as cloneSkinnedScene } from 'three/addons/utils/SkeletonUtils.js'
import { fixMaterials, loadGLB } from './loadGLB'
import { MaintenanceBeacon, type MaintenanceBeaconState } from './MaintenanceBeacon'

/** Public URL path served from `public/models/satellite.glb`. */
export const SATELLITE_MODEL_PUBLIC_PATH = '/models/satellite.glb'

/** Uniform scale applied to the cloned satellite before optional per-instance tuning. */
const DEFAULT_SATELLITE_SCALE = 1

/** Default shadow flags for satellite meshes. */
const DEFAULT_CAST_SHADOW = true
const DEFAULT_RECEIVE_SHADOW = true

let loggedTemplateStructure = false

/** Options for {@link SatelliteModel.create}. */
export interface SatelliteModelCreateOptions {
  /** Uniform scale applied to the cloned satellite (default 1). */
  scale?: number
  /** When false, meshes do not cast shadows (default true). */
  castShadow?: boolean
  /** When false, meshes do not receive shadows (default true). */
  receiveShadow?: boolean
  /** Euler rotation applied to the cloned scene (radians) — reorients the asset's native axes. */
  rotation?: { x?: number; y?: number; z?: number }
  /** Optional maintenance-light state; when omitted the cloned model has no beacon. */
  maintenanceState?: MaintenanceBeaconState
}

const SATELLITE_MAINTENANCE_BEACON_OFFSET = new THREE.Vector3(0, 0.03, 0)

let satelliteTemplate: THREE.Group | null = null
let satelliteTemplatePromise: Promise<THREE.Group> | null = null

/**
 * Load the satellite GLB once and cache the root group for cloning.
 */
async function ensureSatelliteTemplate(): Promise<THREE.Group> {
  if (satelliteTemplate) return satelliteTemplate
  if (!satelliteTemplatePromise) {
    satelliteTemplatePromise = loadGLB(SATELLITE_MODEL_PUBLIC_PATH).then((scene) => {
      fixMaterials(scene)
      satelliteTemplate = scene
      if (!loggedTemplateStructure) {
        loggedTemplateStructure = true
        const parts: string[] = []
        scene.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh
            const mat = mesh.material as THREE.Material | undefined
            parts.push(`• mesh="${mesh.name}" material="${mat?.name ?? '<unnamed>'}"`)
          }
        })
        const box = new THREE.Box3().setFromObject(scene)
        const size = new THREE.Vector3()
        box.getSize(size)
        console.info(
          `[SatelliteModel] loaded mesh list (raw size ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}):\n`
          + parts.join('\n'),
        )
      }
      return scene
    })
  }
  return satelliteTemplatePromise
}

/**
 * Decorative satellite GLB — add {@link group} to your scene after
 * {@link SatelliteModel.create}. Geometries are shared with the preload template via
 * {@link cloneSkinnedScene}; {@link dispose} clears this instance's group.
 */
export class SatelliteModel {
  /** Parent group for positioning; contains the cloned mesh hierarchy. */
  readonly group: THREE.Group
  private readonly beacon: MaintenanceBeacon | null

  private constructor(group: THREE.Group, beacon: MaintenanceBeacon | null) {
    this.group = group
    this.beacon = beacon
  }

  /**
   * Warm the satellite GLB so the first {@link SatelliteModel.create} does not hitch.
   */
  static async preload(): Promise<void> {
    await ensureSatelliteTemplate()
  }

  /**
   * Create a new satellite instance from the shared template.
   */
  static async create(options?: SatelliteModelCreateOptions): Promise<SatelliteModel> {
    const template = await ensureSatelliteTemplate()
    const sceneClone = cloneSkinnedScene(template) as THREE.Group

    const scale = options?.scale ?? DEFAULT_SATELLITE_SCALE
    sceneClone.scale.setScalar(scale)

    const r = options?.rotation
    if (r) {
      sceneClone.rotation.set(r.x ?? 0, r.y ?? 0, r.z ?? 0)
    }

    const castShadow = options?.castShadow ?? DEFAULT_CAST_SHADOW
    const receiveShadow = options?.receiveShadow ?? DEFAULT_RECEIVE_SHADOW

    sceneClone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        mesh.castShadow = castShadow
        mesh.receiveShadow = receiveShadow
      }
    })

    const group = new THREE.Group()
    group.add(sceneClone)
    const beacon = options?.maintenanceState
      ? new MaintenanceBeacon(group, {
        offset: SATELLITE_MAINTENANCE_BEACON_OFFSET,
        initialState: options.maintenanceState,
      })
      : null
    return new SatelliteModel(group, beacon)
  }

  /**
   * Set yaw in radians around world +Y.
   */
  setYaw(yawRadians: number): void {
    this.group.rotation.y = yawRadians
  }

  setMaintenanceState(state: MaintenanceBeaconState): void {
    this.beacon?.setState(state)
  }

  tick(dt: number): void {
    this.beacon?.tick(dt)
  }

  /** Detach cloned meshes from this group. Shared geometries live in the template. */
  dispose(): void {
    this.beacon?.dispose()
    this.group.clear()
  }
}
