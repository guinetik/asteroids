/**
 * Instanced GLB for hostages (`public/models/hostage.glb`).
 *
 * Mixamo-rigged mesh with no embedded clips. Animations come from
 * {@link HostageAnimations} — three FBX clips (praying / walking / dying) borrowed
 * onto the GLB's skeleton via a per-instance {@link THREE.AnimationMixer}.
 *
 * The default state is `'tpose'` (raw bind pose, mixer idle) which the rescue
 * minigame uses to convey "something is wrong" while hostages are contained
 * inside the virus. {@link FpsHostageController} flips them to `'praying'` once
 * they hit the ground.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/asteroid-lander-gdd.md
 */
import * as THREE from 'three'
import { clone as cloneSkinnedScene } from 'three/addons/utils/SkeletonUtils.js'
import { loadGLB } from './loadGLB'
import { loadHostageClips } from './HostageAnimations'

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

/** Default crossfade between animation states (seconds). */
const STATE_CROSSFADE_DURATION = 0.25

/** Options for {@link HostageModel.create}. */
export interface HostageModelCreateOptions {
  /** Uniform scale applied to the clone (default {@link DEFAULT_HOSTAGE_SCALE}). */
  scale?: number
  /** When false, meshes do not cast shadows (default {@link DEFAULT_CAST_SHADOW}). */
  castShadow?: boolean
  /** When false, meshes do not receive shadows (default {@link DEFAULT_RECEIVE_SHADOW}). */
  receiveShadow?: boolean
}

let hostageTemplate: THREE.Group | null = null
let hostageTemplatePromise: Promise<THREE.Group> | null = null

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

/** Duration of heal/damage emissive pulse on the rig (seconds). */
const FEEDBACK_FLASH_DURATION = 0.35

/** Emissive tint strength during feedback. */
const FEEDBACK_EMISSIVE_INTENSITY = 0.85

/**
 * Animation state for a hostage rig.
 *
 * - `'tpose'`: raw bind pose, mixer never started — the contained-in-virus look.
 * - `'praying'`: bow-down loop on a ping-pong cycle (frames 0-125 of `praying.fbx`).
 * - `'standing-up'`: one-shot rise from kneel (frames 126-206), clamps on last frame.
 * - `'walking'`: forward walk cycle with hips translation stripped.
 * - `'dying'`: one-shot collapse, clamps on last frame so the corpse stays grounded.
 */
export type HostageAnimationState =
  | 'tpose'
  | 'praying'
  | 'standing-up'
  | 'walking'
  | 'dying'

/**
 * Mixamo hostage prop — add {@link group} to the scene after {@link HostageModel.create}.
 *
 * Materials are cloned per instance so damage/heal emissive pulses stay local.
 * Animation state defaults to {@link HostageAnimationState} `'tpose'`; call
 * {@link playPraying} / {@link playDying} / etc. to drive the rig.
 */
export class HostageModel {
  /** Parent group for placement. */
  readonly group = new THREE.Group()

  /** Materials that support emissive tint for hit/heal feedback. */
  private readonly feedbackMaterials: (THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial)[] =
    []
  private feedbackTimer = 0

  /** Root the mixer drives — the cloned skinned scene under {@link group}. */
  private readonly skinnedRoot: THREE.Object3D
  /** Lazily created on first `play*()` call so T-pose hostages pay nothing. */
  private mixer: THREE.AnimationMixer | null = null
  private currentAction: THREE.AnimationAction | null = null
  private state: HostageAnimationState = 'tpose'

  private constructor(sceneClone: THREE.Group) {
    this.skinnedRoot = sceneClone
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
   * Warm the hostage GLB and FBX clips so the first {@link HostageModel.create} and
   * first state transition do not hitch.
   */
  static async preload(): Promise<void> {
    await Promise.all([ensureHostageTemplate(), loadHostageClips()])
  }

  /**
   * Spawn a hostage instance.
   *
   * Newly created hostages are in `'tpose'`; nothing animates until a `play*()`
   * call promotes them to a state that drives a clip.
   *
   * @param options - Scale and shadow toggles
   * @returns Ready-to-place hostage
   */
  static async create(options?: HostageModelCreateOptions): Promise<HostageModel> {
    const template = await ensureHostageTemplate()
    const sceneClone = cloneSkinnedScene(template) as THREE.Group

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

  /** Current animation state. */
  getState(): HostageAnimationState {
    return this.state
  }

  /**
   * Loop the praying bow on ping-pong (0 → 125 → 0 → 125 …).
   * Hard cut from `'tpose'` (the release moment is supposed to feel sudden);
   * crossfade from any other state.
   */
  async playPraying(): Promise<void> {
    if (this.state === 'praying') return
    const clips = await loadHostageClips()
    const action = this.ensureMixer().clipAction(clips.prayingLoop)
    action.loop = THREE.LoopPingPong
    action.clampWhenFinished = false
    action.repetitions = Infinity
    const hardCut = this.state === 'tpose'
    this.transitionTo(action, 'praying', hardCut)
  }

  /**
   * Play the kneel-to-stand rise once and clamp. Intended as the lead-in to
   * {@link playWalking} when the rescue follow behaviour exists.
   */
  async playStandUp(): Promise<void> {
    if (this.state === 'standing-up') return
    const clips = await loadHostageClips()
    const action = this.ensureMixer().clipAction(clips.prayingStandUp)
    action.loop = THREE.LoopOnce
    action.clampWhenFinished = true
    action.repetitions = 1
    this.transitionTo(action, 'standing-up', false)
  }

  /** Loop the walk cycle. */
  async playWalking(): Promise<void> {
    if (this.state === 'walking') return
    const clips = await loadHostageClips()
    const action = this.ensureMixer().clipAction(clips.walking)
    action.loop = THREE.LoopRepeat
    action.clampWhenFinished = false
    action.repetitions = Infinity
    this.transitionTo(action, 'walking', false)
  }

  /**
   * Play the death collapse once and clamp. Mixer continues to update so the
   * pose is held on the last frame.
   */
  async playDying(): Promise<void> {
    if (this.state === 'dying') return
    const clips = await loadHostageClips()
    const action = this.ensureMixer().clipAction(clips.dying)
    action.loop = THREE.LoopOnce
    action.clampWhenFinished = true
    action.repetitions = 1
    this.transitionTo(action, 'dying', false)
  }

  /**
   * Advance the per-instance mixer. No-op while in `'tpose'` (mixer is null).
   * Safe to call every frame from a controller tick.
   *
   * @param dt - Delta time in seconds
   */
  tickAnimation(dt: number): void {
    this.mixer?.update(dt)
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
   * cached GLB's textures; disposing would break the template and other instances.
   */
  dispose(): void {
    if (this.mixer) {
      this.mixer.stopAllAction()
      this.mixer.uncacheRoot(this.skinnedRoot)
      this.mixer = null
    }
    this.currentAction = null
    this.feedbackMaterials.length = 0
    this.group.clear()
  }

  /** Lazily build the per-instance mixer the first time a clip is requested. */
  private ensureMixer(): THREE.AnimationMixer {
    if (!this.mixer) {
      this.mixer = new THREE.AnimationMixer(this.skinnedRoot)
    }
    return this.mixer
  }

  /**
   * Swap the active action, optionally crossfading from the previous one.
   *
   * @param next     - New action to drive the rig
   * @param state    - State label to record after the swap
   * @param hardCut  - Skip the crossfade (used for `tpose → praying` release moment)
   */
  private transitionTo(
    next: THREE.AnimationAction,
    state: HostageAnimationState,
    hardCut: boolean,
  ): void {
    const previous = this.currentAction
    next.reset()
    next.enabled = true
    next.setEffectiveTimeScale(1)
    next.setEffectiveWeight(1)
    next.play()

    if (previous && previous !== next && !hardCut) {
      previous.crossFadeTo(next, STATE_CROSSFADE_DURATION, true)
    } else if (previous && previous !== next) {
      previous.stop()
    }

    this.currentAction = next
    this.state = state
  }
}
