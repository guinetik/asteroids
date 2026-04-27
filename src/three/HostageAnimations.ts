/**
 * Mixamo animation clips for the hostage rig.
 *
 * Loads three FBX clips once, slices `praying.fbx` into a looped bow and a
 * one-shot stand-up, and strips root motion from `walking`. Clips are shared
 * across every {@link HostageModel} instance — only the {@link THREE.AnimationMixer}
 * is per-instance.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/asteroid-lander-gdd.md
 */
import * as THREE from 'three'
import { loadFBX } from './loadFBX'

/** Public URL for the praying source clip (contains both bow loop and stand-up). */
const PRAYING_FBX_PATH = '/models/animations/praying.fbx'
/** Public URL for the walking source clip. */
const WALKING_FBX_PATH = '/models/animations/walking.fbx'
/** Public URL for the dying source clip. */
const DYING_FBX_PATH = '/models/animations/dying.fbx'

/** Mixamo bakes clips at 30fps; subclip frame numbers are interpreted at this rate. */
const MIXAMO_FBX_FPS = 30

/** Last frame of the bow-down loop in `praying.fbx` (frame index, inclusive). */
const PRAYING_LOOP_END_FRAME = 125
/** First frame of the stand-up motion in `praying.fbx`. */
const PRAYING_STAND_UP_START_FRAME = 126
/** Last frame of the stand-up motion in `praying.fbx`. */
const PRAYING_STAND_UP_END_FRAME = 206

/** Public clip names — kept stable so callers can lookup by name. */
export const HOSTAGE_CLIP_PRAYING_LOOP = 'hostage-praying-loop'
export const HOSTAGE_CLIP_PRAYING_STAND_UP = 'hostage-praying-stand-up'
export const HOSTAGE_CLIP_WALKING = 'hostage-walking'
export const HOSTAGE_CLIP_DYING = 'hostage-dying'

/** All clips needed by {@link HostageModel}. Shared across every instance. */
export interface HostageClips {
  /** Frames 0-125 of `praying.fbx` — looped ping-pong (bow → unbow → bow). */
  prayingLoop: THREE.AnimationClip
  /** Frames 126-206 of `praying.fbx` — one-shot rise from kneel to standing. */
  prayingStandUp: THREE.AnimationClip
  /** Forward walk cycle with the hips translation track stripped. */
  walking: THREE.AnimationClip
  /** One-shot collapse — clamp on last frame to leave the body grounded. */
  dying: THREE.AnimationClip
}

let clipsCache: HostageClips | null = null
let clipsPromise: Promise<HostageClips> | null = null

/**
 * Drop the `mixamorig:Hips.position` track. Mixamo FBX exports record this in
 * centimeters while the GLB hostage rig is in meters, so playing the raw track
 * teleports the rig ~80m off-screen. The hips *quaternion* track is preserved
 * (units don't matter for rotation), so kneel/collapse poses still read fine
 * from the leg + spine bends. We also lose the controller-vs-clip double
 * translation issue that affects walking.
 *
 * @param clip - Clip to mutate in place
 */
function stripHipsTranslation(clip: THREE.AnimationClip): void {
  clip.tracks = clip.tracks.filter((track) => {
    const isHipsPosition = track.name.endsWith('.position') && track.name.includes('Hips')
    return !isHipsPosition
  })
}

/**
 * Pull the first animation off an FBX result. Mixamo exports always carry the
 * clip on `.animations[0]`; throws if the file shipped without one.
 *
 * @param group - Loaded FBX scene
 * @param sourceLabel - Label used in the thrown error message
 */
function takeFirstClip(group: THREE.Group, sourceLabel: string): THREE.AnimationClip {
  const clip = group.animations[0]
  if (!clip) {
    throw new Error(`HostageAnimations: ${sourceLabel} has no embedded animation clip`)
  }
  return clip
}

/**
 * Load every hostage clip exactly once. Subsequent calls return the cached bundle.
 *
 * @returns Shared {@link HostageClips} bundle
 */
export async function loadHostageClips(): Promise<HostageClips> {
  if (clipsCache) return clipsCache
  if (clipsPromise) return clipsPromise

  clipsPromise = (async () => {
    const [prayingFbx, walkingFbx, dyingFbx] = await Promise.all([
      loadFBX(PRAYING_FBX_PATH),
      loadFBX(WALKING_FBX_PATH),
      loadFBX(DYING_FBX_PATH),
    ])

    const prayingSource = takeFirstClip(prayingFbx, 'praying.fbx')
    const walking = takeFirstClip(walkingFbx, 'walking.fbx')
    const dying = takeFirstClip(dyingFbx, 'dying.fbx')

    const prayingLoop = THREE.AnimationUtils.subclip(
      prayingSource,
      HOSTAGE_CLIP_PRAYING_LOOP,
      0,
      PRAYING_LOOP_END_FRAME,
      MIXAMO_FBX_FPS,
    )
    const prayingStandUp = THREE.AnimationUtils.subclip(
      prayingSource,
      HOSTAGE_CLIP_PRAYING_STAND_UP,
      PRAYING_STAND_UP_START_FRAME,
      PRAYING_STAND_UP_END_FRAME,
      MIXAMO_FBX_FPS,
    )

    walking.name = HOSTAGE_CLIP_WALKING
    dying.name = HOSTAGE_CLIP_DYING

    stripHipsTranslation(prayingLoop)
    stripHipsTranslation(prayingStandUp)
    stripHipsTranslation(walking)
    stripHipsTranslation(dying)

    clipsCache = { prayingLoop, prayingStandUp, walking, dying }
    return clipsCache
  })()

  return clipsPromise
}
