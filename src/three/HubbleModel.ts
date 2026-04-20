/**
 * GLB prop for `public/models/hubble.glb`. Minimal loader — one-shot template with
 * per-instance {@link cloneSkinnedScene} so geometries stay shared. No panel/TRON
 * logic; colouring will be revisited in a follow-up pass.
 *
 * @author guinetik
 * @date 2026-04-19
 * @spec docs/superpowers/specs/2026-04-18-visit-relay-mission-design.md
 */
import * as THREE from 'three'
import { clone as cloneSkinnedScene } from 'three/addons/utils/SkeletonUtils.js'
import { fixMaterials, loadGLB } from './loadGLB'
import { MaintenanceBeacon, type MaintenanceBeaconState } from './MaintenanceBeacon'

/** Public URL path served from `public/models/hubble.glb`. */
export const HUBBLE_MODEL_PUBLIC_PATH = '/models/hubble.glb'

/** Default uniform scale applied to the cloned Hubble before optional per-instance tuning. */
const DEFAULT_HUBBLE_SCALE = 1

/** Default shadow flags for Hubble meshes. */
const DEFAULT_CAST_SHADOW = true
const DEFAULT_RECEIVE_SHADOW = true

let hubbleTemplate: THREE.Group | null = null
let hubbleTemplatePromise: Promise<THREE.Group> | null = null
let loggedTemplateStructure = false

/**
 * Load the Hubble GLB once and cache the root group for cloning.
 */
async function ensureHubbleTemplate(): Promise<THREE.Group> {
  if (hubbleTemplate) return hubbleTemplate
  if (!hubbleTemplatePromise) {
    hubbleTemplatePromise = loadGLB(HUBBLE_MODEL_PUBLIC_PATH).then((scene) => {
      fixMaterials(scene)
      hubbleTemplate = scene
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
          `[HubbleModel] loaded mesh list (raw size ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}):\n`
          + parts.join('\n'),
        )
      }
      return scene
    })
  }
  return hubbleTemplatePromise
}

/** Options for {@link HubbleModel.create}. */
export interface HubbleModelCreateOptions {
  /** Uniform scale applied to the cloned Hubble (default 1). */
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

const HUBBLE_MAINTENANCE_BEACON_OFFSET = new THREE.Vector3(0, 0, 0)

/**
 * Decorative Hubble telescope GLB — add {@link group} to your scene after
 * {@link HubbleModel.create}. Geometries are shared with the preload template;
 * {@link dispose} detaches this instance's meshes from the group.
 */
export class HubbleModel {
  /** Parent group for positioning; contains the cloned mesh hierarchy. */
  readonly group: THREE.Group
  private readonly beacon: MaintenanceBeacon | null

  private constructor(group: THREE.Group, beacon: MaintenanceBeacon | null) {
    this.group = group
    this.beacon = beacon
  }

  /**
   * Warm the Hubble GLB so the first {@link HubbleModel.create} does not hitch.
   */
  static async preload(): Promise<void> {
    await ensureHubbleTemplate()
  }

  /**
   * Create a new Hubble instance from the shared template.
   */
  static async create(options?: HubbleModelCreateOptions): Promise<HubbleModel> {
    const template = await ensureHubbleTemplate()
    const sceneClone = cloneSkinnedScene(template) as THREE.Group

    const scale = options?.scale ?? DEFAULT_HUBBLE_SCALE
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
        offset: HUBBLE_MAINTENANCE_BEACON_OFFSET,
        initialState: options.maintenanceState,
        radius: 0.022,
        distance: 5,
      })
      : null
    return new HubbleModel(group, beacon)
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
