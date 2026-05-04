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
          `[VoyagerModel] loaded mesh list (raw size ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}):\n` +
            parts.join('\n'),
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

/**
 * Beacon `PointLight.distance` (world-space, unscaled by parent) per unit of model
 * `scale`. Picked to match the halo/body ratio the beacon had at the original 0.1
 * voyager scale (7 world-unit distance ÷ 0.1 scale).
 */
const VOYAGER_BEACON_DISTANCE_PER_SCALE = 70

/** Matching per-scale bulb radius so the emissive bulb mesh stays body-proportional. */
const VOYAGER_BEACON_RADIUS_PER_SCALE = 0.3

/**
 * Max longest-axis : shortest-axis ratio for a mesh to count as a "body" candidate
 * when picking the beacon anchor. Anything more elongated (booms, magnetometer mast,
 * RTG truss) is excluded so the beacon doesn't land on a stick.
 */
const VOYAGER_BODY_MAX_ELONGATION = 4

/** Pick the center of the largest non-elongated mesh under `root` — the dish or bus. */
function computeBodyCenter(root: THREE.Object3D): THREE.Vector3 {
  let bestVolume = -1
  const bestCenter = new THREE.Vector3()
  const size = new THREE.Vector3()
  const box = new THREE.Box3()
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    box.setFromObject(mesh)
    if (box.isEmpty()) return
    box.getSize(size)
    const longest = Math.max(size.x, size.y, size.z)
    const shortest = Math.max(Math.min(size.x, size.y, size.z), 1e-6)
    if (longest / shortest > VOYAGER_BODY_MAX_ELONGATION) return
    const volume = size.x * size.y * size.z
    if (volume > bestVolume) {
      bestVolume = volume
      box.getCenter(bestCenter)
    }
  })
  if (bestVolume < 0) {
    new THREE.Box3().setFromObject(root).getCenter(bestCenter)
  }
  return bestCenter
}

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
    // Whole-model bbox center is biased upward by the long booms / cradle truss, so
    // the beacon lands in empty space above the bus. Instead pick the center of the
    // largest non-elongated mesh — the dish or bus — which is reliably "inside" the
    // hull regardless of GLB origin.
    const beaconOffset = computeBodyCenter(sceneClone)
    const beacon = options?.maintenanceState
      ? new MaintenanceBeacon(group, {
          offset: beaconOffset,
          initialState: options.maintenanceState,
          // PointLight.distance is in world units and is NOT scaled by the parent; tie
          // it to `scale` so the halo stays body-proportional at any model size.
          distance: scale * VOYAGER_BEACON_DISTANCE_PER_SCALE,
          radius: scale * VOYAGER_BEACON_RADIUS_PER_SCALE,
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
