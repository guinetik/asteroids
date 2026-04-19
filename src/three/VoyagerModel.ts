/**
 * GLB prop for `public/models/voyager.glb`. Minimal loader — one-shot template with
 * per-instance {@link cloneSkinnedScene} so geometries stay shared. Mirrors the
 * HubbleModel / SatelliteModel pattern so all EVA POI props are authored GLBs.
 *
 * @author guinetik
 * @date 2026-04-19
 * @spec docs/superpowers/specs/2026-04-18-visit-relay-mission-design.md
 */
import * as THREE from 'three'
import { clone as cloneSkinnedScene } from 'three/addons/utils/SkeletonUtils.js'
import { fixMaterials, loadGLB } from './loadGLB'
import { MaintenanceBeacon, type MaintenanceBeaconState } from './MaintenanceBeacon'

/** Public URL path served from `public/models/voyager.glb`. */
export const VOYAGER_MODEL_PUBLIC_PATH = '/models/voyager.glb'

/** Default uniform scale applied to the cloned Voyager before optional per-instance tuning. */
const DEFAULT_VOYAGER_SCALE = 1

/** Default shadow flags for Voyager meshes. */
const DEFAULT_CAST_SHADOW = true
const DEFAULT_RECEIVE_SHADOW = true

let voyagerTemplate: THREE.Group | null = null
let voyagerTemplatePromise: Promise<THREE.Group> | null = null
let loggedTemplateStructure = false

/**
 * Load the Voyager GLB once and cache the root group for cloning.
 */
async function ensureVoyagerTemplate(): Promise<THREE.Group> {
  if (voyagerTemplate) return voyagerTemplate
  if (!voyagerTemplatePromise) {
    voyagerTemplatePromise = loadGLB(VOYAGER_MODEL_PUBLIC_PATH).then((scene) => {
      fixMaterials(scene)
      voyagerTemplate = scene
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
          `[VoyagerModel] loaded mesh list (raw size ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}):\n`
          + parts.join('\n'),
        )
      }
      return scene
    })
  }
  return voyagerTemplatePromise
}

/** Options for {@link VoyagerModel.create}. */
export interface VoyagerModelCreateOptions {
  /** Uniform scale applied to the cloned Voyager (default 1). */
  scale?: number
  /** When false, meshes do not cast shadows (default true). */
  castShadow?: boolean
  /** When false, meshes do not receive shadows (default true). */
  receiveShadow?: boolean
  /** Euler rotation applied to the cloned scene (radians) — reorients the asset's axes. */
  rotation?: { x?: number; y?: number; z?: number }
  /** Optional maintenance-light state; when omitted the cloned model has no beacon. */
  maintenanceState?: MaintenanceBeaconState
}

const VOYAGER_MAINTENANCE_BEACON_OFFSET = new THREE.Vector3(0, -0.18, 0.25)

/**
 * Decorative Voyager relay GLB — add {@link group} to your scene after
 * {@link VoyagerModel.create}. Geometries are shared with the preload template;
 * {@link dispose} detaches this instance's meshes from the group.
 */
export class VoyagerModel {
  /** Parent group for positioning; contains the cloned mesh hierarchy. */
  readonly group: THREE.Group
  private readonly beacon: MaintenanceBeacon | null

  private constructor(group: THREE.Group, beacon: MaintenanceBeacon | null) {
    this.group = group
    this.beacon = beacon
  }

  /** Warm the Voyager GLB so the first {@link VoyagerModel.create} does not hitch. */
  static async preload(): Promise<void> {
    await ensureVoyagerTemplate()
  }

  /** Create a new Voyager instance from the shared template. */
  static async create(options?: VoyagerModelCreateOptions): Promise<VoyagerModel> {
    const template = await ensureVoyagerTemplate()
    const sceneClone = cloneSkinnedScene(template) as THREE.Group

    const scale = options?.scale ?? DEFAULT_VOYAGER_SCALE
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
        offset: VOYAGER_MAINTENANCE_BEACON_OFFSET,
        initialState: options.maintenanceState,
        radius: 0.03,
        distance: 7,
      })
      : null
    return new VoyagerModel(group, beacon)
  }

  /** Set yaw in radians around world +Y. */
  setYaw(yawRadians: number): void {
    this.group.rotation.y = yawRadians
  }

  setMaintenanceState(state: MaintenanceBeaconState): void {
    this.beacon?.setState(state)
  }

  tick(dt: number): void {
    this.beacon?.tick(dt)
  }

  /** Detach cloned meshes from this group. */
  dispose(): void {
    this.beacon?.dispose()
    this.group.clear()
  }
}
