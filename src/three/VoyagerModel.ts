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

/**
 * Load the Voyager GLB once and cache the root group for cloning.
 */
async function ensureVoyagerTemplate(): Promise<THREE.Group> {
  if (voyagerTemplate) return voyagerTemplate
  if (!voyagerTemplatePromise) {
    voyagerTemplatePromise = loadGLB(VOYAGER_MODEL_PUBLIC_PATH).then((scene) => {
      fixMaterials(scene)
      voyagerTemplate = scene
      // Debug mesh-list dump — re-enable when diagnosing beacon anchor or scale issues.
      // if (!loggedTemplateStructure) {
      //   loggedTemplateStructure = true
      //   const parts: string[] = []
      //   scene.traverse((child) => {
      //     if ((child as THREE.Mesh).isMesh) {
      //       const mesh = child as THREE.Mesh
      //       const mat = mesh.material as THREE.Material | undefined
      //       const geom = mesh.geometry
      //       if (!geom.boundingBox) geom.computeBoundingBox()
      //       const sz = new THREE.Vector3()
      //       geom.boundingBox!.getSize(sz)
      //       const ctr = new THREE.Vector3()
      //       geom.boundingBox!.getCenter(ctr)
      //       parts.push(
      //         `• mesh="${mesh.name}" material="${mat?.name ?? '<unnamed>'}" size=${sz.x.toFixed(2)}x${sz.y.toFixed(2)}x${sz.z.toFixed(2)} center=${ctr.x.toFixed(2)},${ctr.y.toFixed(2)},${ctr.z.toFixed(2)}`,
      //       )
      //     }
      //   })
      //   const box = new THREE.Box3().setFromObject(scene)
      //   const size = new THREE.Vector3()
      //   box.getSize(size)
      //   console.info(
      //     `[VoyagerModel] loaded mesh list (raw size ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}):\n` +
      //       parts.join('\n'),
      //   )
      // }
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

/** Mesh name in `voyager.glb` that the beacon anchors to (high-gain antenna dish). */
const VOYAGER_ANTENNA_MESH_NAME = 'voyager_antenna'

/**
 * Anchor the beacon at the geometric center of the named antenna mesh, computed in
 * the mesh's LOCAL geometry space and then transformed to world. The world-AABB
 * approach is unreliable here — the antenna mesh's rotated AABB picks up boom/strut
 * extents and shifts the "center" off the dish; the geometry bbox is just the dish
 * itself, so its center is reliably inside the parabolic bowl.
 */
function computeAntennaBeaconAnchor(root: THREE.Object3D): THREE.Vector3 {
  let antennaNode: THREE.Object3D | null = null
  root.traverse((child) => {
    if (antennaNode) return
    if (child.name === VOYAGER_ANTENNA_MESH_NAME) antennaNode = child
  })
  let antennaMesh: THREE.Mesh | null = null
  if (antennaNode) {
    ;(antennaNode as THREE.Object3D).traverse((child) => {
      if (antennaMesh) return
      const mesh = child as THREE.Mesh
      if (mesh.isMesh) antennaMesh = mesh
    })
  }
  const anchor = new THREE.Vector3()
  if (!antennaMesh) {
    new THREE.Box3().setFromObject(root).getCenter(anchor)
    // console.warn(
    //   `[VoyagerModel] antenna mesh "${VOYAGER_ANTENNA_MESH_NAME}" not found — beacon falling back to root center ${anchor.toArray().map((v) => v.toFixed(2)).join(',')}`,
    // )
    return anchor
  }
  const mesh = antennaMesh as THREE.Mesh
  const geom = mesh.geometry
  if (!geom.boundingBox) geom.computeBoundingBox()
  geom.boundingBox!.getCenter(anchor)
  mesh.updateWorldMatrix(true, false)
  anchor.applyMatrix4(mesh.matrixWorld)
  // console.info(
  //   `[VoyagerModel] beacon anchor on "${mesh.name}" → ${anchor.toArray().map((v) => v.toFixed(2)).join(',')}`,
  // )
  return anchor
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
    // Anchor on the named `voyager_antenna` mesh and nudge along world +Z so the bulb
    // sits at the dish's outer face — the GLB is solid so a beacon at the geometric
    // center would be hidden inside the hull.
    const beaconOffset = computeAntennaBeaconAnchor(sceneClone)
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
