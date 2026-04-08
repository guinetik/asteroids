/**
 * Instanced GLB for cuffed hostages (`public/models/hostage.glb`).
 *
 * Mixamo-rigged mesh with no embedded clips; {@link applyCuffedStandingPoseToObject}
 * applies local rotation deltas so arms hang beside the body instead of a T-pose.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/asteroid-lander-gdd.md
 */
import * as THREE from 'three'
import { clone as cloneSkinnedScene } from 'three/addons/utils/SkeletonUtils.js'
import { loadGLB } from './loadGLB'

/** Public URL path served from `public/models/hostage.glb`. */
export const HOSTAGE_MODEL_PUBLIC_PATH = '/models/hostage.glb'

/**
 * Uniform scale from GLB bind units to world meters.
 * Tuned between 1 (too small in the FPS scene) and ~18 (too large); adjust with
 * {@link HostageModelCreateOptions.scale} per level if needed.
 */
const BASE_HOSTAGE_ASSET_SCALE = 2.5

/** Default uniform scale multiplier for new instances. */
const DEFAULT_HOSTAGE_SCALE = 1

/** Default shadow flags. */
const DEFAULT_CAST_SHADOW = true
const DEFAULT_RECEIVE_SHADOW = true

/** Euler order for procedural pose deltas (matches typical Mixamo export). */
const HOSTAGE_POSE_EULER_ORDER: THREE.EulerOrder = 'XYZ'

const DEG = THREE.MathUtils.degToRad

/**
 * Ordered local-space rotation deltas (radians) applied on top of the bind T-pose.
 * Tune these if the rig export or cuffs clip; names match Mixamo `mixamorig:` bones.
 */
const HOSTAGE_CUFFED_POSE_STEPS: ReadonlyArray<{
  /** Mixamo joint name */
  name: string
  /** Local Euler X delta */
  x: number
  /** Local Euler Y delta */
  y: number
  /** Local Euler Z delta */
  z: number
}> = [
  { name: 'mixamorig:LeftShoulder', x: DEG(8), y: 0, z: DEG(-14) },
  { name: 'mixamorig:RightShoulder', x: DEG(8), y: 0, z: DEG(14) },
  { name: 'mixamorig:LeftArm', x: DEG(82), y: DEG(10), z: DEG(-26) },
  { name: 'mixamorig:RightArm', x: DEG(82), y: DEG(-10), z: DEG(26) },
  { name: 'mixamorig:LeftForeArm', x: DEG(32), y: DEG(6), z: 0 },
  { name: 'mixamorig:RightForeArm', x: DEG(32), y: DEG(-6), z: 0 },
  { name: 'mixamorig:LeftHand', x: DEG(4), y: DEG(22), z: DEG(12) },
  { name: 'mixamorig:RightHand', x: DEG(4), y: DEG(-22), z: DEG(-12) },
]

const poseEulerScratch = new THREE.Euler(0, 0, 0, HOSTAGE_POSE_EULER_ORDER)
const poseDeltaQuatScratch = new THREE.Quaternion()

/** Options for {@link HostageModel.create}. */
export interface HostageModelCreateOptions {
  /** Uniform scale applied to the clone (default {@link DEFAULT_HOSTAGE_SCALE}). */
  scale?: number
  /** When false, meshes do not cast shadows (default {@link DEFAULT_CAST_SHADOW}). */
  castShadow?: boolean
  /** When false, meshes do not receive shadows (default {@link DEFAULT_RECEIVE_SHADOW}). */
  receiveShadow?: boolean
  /**
   * When true (default), applies {@link applyCuffedStandingPoseToObject} after clone.
   * Set false to keep the raw GLB bind pose (e.g. T-pose).
   */
  applyCuffedStandingPose?: boolean
}

let hostageTemplate: THREE.Group | null = null
let hostageTemplatePromise: Promise<THREE.Group> | null = null

/**
 * Find a bone by name on a skeleton.
 *
 * @param skeleton - Skin skeleton from a {@link THREE.SkinnedMesh}
 * @param boneName - Exact glTF joint name (e.g. `mixamorig:LeftArm`)
 */
export function findHostageBone(skeleton: THREE.Skeleton, boneName: string): THREE.Bone | undefined {
  return skeleton.bones.find((b) => b.name === boneName)
}

/**
 * Apply cuffed standing arm pose to every unique armature under `root`.
 *
 * Uses {@link THREE.SkinnedMesh.isSkinnedMesh} (not `instanceof`) so posing still runs when
 * the bundler dedupes Three differently than this module. Body + helmet each own a
 * {@link THREE.Skeleton} instance but share the same cloned {@link THREE.Bone} objects;
 * dedupe by the `mixamorig:Hips` bone so deltas are not applied twice.
 *
 * @param root - Cloned scene or group containing skinned meshes
 */
export function applyCuffedStandingPoseToObject(root: THREE.Object3D): void {
  const posedHipBones = new WeakSet<THREE.Bone>()

  root.traverse((obj) => {
    const mesh = obj as THREE.SkinnedMesh
    if (!mesh.isSkinnedMesh) return

    const { skeleton } = mesh
    const hips = findHostageBone(skeleton, 'mixamorig:Hips')
    const armatureKey = hips ?? skeleton.bones[0]
    if (!armatureKey || posedHipBones.has(armatureKey)) return
    posedHipBones.add(armatureKey)

    for (const step of HOSTAGE_CUFFED_POSE_STEPS) {
      const bone = findHostageBone(skeleton, step.name)
      if (!bone) continue
      poseEulerScratch.set(step.x, step.y, step.z)
      poseDeltaQuatScratch.setFromEuler(poseEulerScratch)
      bone.quaternion.multiply(poseDeltaQuatScratch)
    }

    hips?.updateMatrixWorld(true)
    skeleton.update()
  })
}

/**
 * Load the hostage GLB once and cache the root group for cloning.
 *
 * @returns The template scene (add instances via {@link HostageModel.create}, not this node)
 */
async function ensureHostageTemplate(): Promise<THREE.Group> {
  if (hostageTemplate) return hostageTemplate
  if (!hostageTemplatePromise) {
    hostageTemplatePromise = loadGLB(HOSTAGE_MODEL_PUBLIC_PATH).then((scene) => {
      hostageTemplate = scene
      return scene
    })
  }
  return hostageTemplatePromise
}

/**
 * Deep-clone every mesh material under `root` so emissive feedback is per-instance.
 *
 * {@link cloneSkinnedScene} keeps material references on the cached template; without this,
 * hit/heal flashes apply to all hostages at once.
 *
 * @param root - Cloned scene root (not the shared template)
 */
function cloneMeshMaterialsDeep(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh || !mesh.material) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const cloned = mats.map((m) => m.clone())
    mesh.material = cloned.length === 1 ? cloned[0]! : cloned
    for (const m of cloned) {
      m.needsUpdate = true
    }
  })
}

/**
 * Mixamo hostage prop — add {@link group} to the scene after {@link HostageModel.create}.
 *
 * Materials are cloned per instance so damage/heal emissive pulses stay local.
 */
/** Duration of heal/damage emissive pulse on the rig (seconds). */
const FEEDBACK_FLASH_DURATION = 0.35

/** Emissive tint strength during feedback. */
const FEEDBACK_EMISSIVE_INTENSITY = 0.85

export class HostageModel {
  /** Parent group for placement. */
  readonly group = new THREE.Group()

  /** Materials that support emissive tint for hit/heal feedback. */
  private readonly feedbackMaterials: (THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial)[] = []
  private feedbackTimer = 0

  private constructor(sceneClone: THREE.Group) {
    this.group.add(sceneClone)
    sceneClone.traverse((child) => {
      if (child instanceof THREE.SkinnedMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        for (const m of mats) {
          if (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhysicalMaterial) {
            this.feedbackMaterials.push(m)
          }
        }
      }
    })
  }

  /**
   * Warm the hostage GLB so the first {@link HostageModel.create} does not hitch.
   */
  static async preload(): Promise<void> {
    await ensureHostageTemplate()
  }

  /**
   * Spawn a hostage instance with optional cuffed arm pose.
   *
   * @param options - Scale, shadows, and pose toggles
   * @returns Ready-to-place hostage
   */
  static async create(options?: HostageModelCreateOptions): Promise<HostageModel> {
    const template = await ensureHostageTemplate()
    const sceneClone = cloneSkinnedScene(template) as THREE.Group

    const wantPose = options?.applyCuffedStandingPose ?? true
    if (wantPose) {
      applyCuffedStandingPoseToObject(sceneClone)
    }

    const scale = options?.scale ?? DEFAULT_HOSTAGE_SCALE
    sceneClone.scale.setScalar(BASE_HOSTAGE_ASSET_SCALE * scale)
    sceneClone.updateMatrixWorld(true)

    cloneMeshMaterialsDeep(sceneClone)

    const castShadow = options?.castShadow ?? DEFAULT_CAST_SHADOW
    const receiveShadow = options?.receiveShadow ?? DEFAULT_RECEIVE_SHADOW
    sceneClone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = castShadow
        child.receiveShadow = receiveShadow
      }
    })

    return new HostageModel(sceneClone)
  }

  /**
   * Set world-space position.
   *
   * @param x - World X
   * @param y - World Y
   * @param z - World Z
   */
  placeAt(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z)
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
   * Brief green emissive pulse — call when a med bolt heals this hostage.
   */
  pulseHealFeedback(): void {
    this.feedbackTimer = FEEDBACK_FLASH_DURATION
    const c = new THREE.Color(0x22ff88)
    for (const mat of this.feedbackMaterials) {
      mat.emissive.copy(c)
      mat.emissiveIntensity = FEEDBACK_EMISSIVE_INTENSITY
    }
  }

  /**
   * Brief red emissive pulse — call when this hostage takes damage.
   */
  pulseDamageFeedback(): void {
    this.feedbackTimer = FEEDBACK_FLASH_DURATION
    const c = new THREE.Color(0xff3333)
    for (const mat of this.feedbackMaterials) {
      mat.emissive.copy(c)
      mat.emissiveIntensity = FEEDBACK_EMISSIVE_INTENSITY
    }
  }

  /**
   * Decay emissive feedback each frame (call from level tick).
   *
   * @param dt - Delta time in seconds
   */
  tickFeedback(dt: number): void {
    if (this.feedbackTimer <= 0) return
    this.feedbackTimer -= dt
    const t = Math.max(0, this.feedbackTimer / FEEDBACK_FLASH_DURATION)
    for (const mat of this.feedbackMaterials) {
      mat.emissiveIntensity = FEEDBACK_EMISSIVE_INTENSITY * t
      if (this.feedbackTimer <= 0) {
        mat.emissive.setHex(0x000000)
        mat.emissiveIntensity = 0
      }
    }
  }

  /**
   * Detach this instance from the scene graph.
   *
   * Does not {@link THREE.Material.dispose} cloned materials — they still reference the
   * cached GLB’s textures; disposing would break the template and other instances.
   */
  dispose(): void {
    this.feedbackMaterials.length = 0
    this.group.clear()
  }
}
