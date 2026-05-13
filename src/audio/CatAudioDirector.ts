/**
 * 3D positional audio for Sushi the cat inside the habitat module.
 *
 * Owns four cues, each panned + attenuated per frame by the cat's position
 * relative to the FPS camera so they read as coming from his actual location:
 *
 * - **purr loop** while love ≥ {@link CAT_PURR_LOVE_THRESHOLD} and Sushi is
 *   in a calm state (idle / sit / eat / walk / chaseRest).
 * - **sleep loop** while Sushi is asleep AND the player is within
 *   {@link CAT_SLEEP_AUDIBLE_DISTANCE} of the cat house.
 * - **happy meow** one-shot, fired once per idle entry when love is high.
 * - **alert meow** one-shot, fired once per idle entry when at least one need
 *   is unmet (hungry, needy, full bladder, exhausted).
 *
 * The director never reads stores directly — the host scene (typically
 * {@link three.HabitatInteriorScene}) gathers per-frame state and calls
 * {@link CatAudioDirector.update}.
 *
 * @author guinetik
 * @date 2026-05-08
 */

import * as THREE from 'three'
import { useAudio } from './useAudio'
import type { CatState } from '@/three/CatController'

/**
 * Love threshold (0..100) at or above which the purr loop is allowed to play.
 * Matches the user-facing "high love" tier so a fed-and-pet cat purrs noticeably
 * around the cabin without dribbling on at neutral affection.
 */
const CAT_PURR_LOVE_THRESHOLD = 75

/** Hunger ≤ this counts as "starving" for the alert-meow trigger (matches HUNGER_HUNGRY_THRESHOLD). */
const CAT_HUNGER_HUNGRY_THRESHOLD = 30
/** Love ≤ this counts as "needy" for the alert-meow trigger (matches LOVE_NEEDY_THRESHOLD). */
const CAT_LOVE_NEEDY_THRESHOLD = 30
/** Bladder ≥ this counts as "full" for the alert-meow trigger (matches BLADDER_FULL_THRESHOLD). */
const CAT_BLADDER_FULL_THRESHOLD = 70
/** Tired ≥ this counts as "exhausted" for the alert-meow trigger (matches TIRED_FULL_THRESHOLD). */
const CAT_TIRED_FULL_THRESHOLD = 80

/**
 * Distance (world units) at which a cat-positioned cue is fully audible. Inside
 * this radius the falloff stays at 1.0 so a sleeping kitten next to the player
 * is full-volume.
 */
const CAT_AUDIO_NEAR_DISTANCE = 1.5
/**
 * Distance (world units) at which cat-positioned cues fade to silence. Past this
 * the gain is clamped to zero so faint loops don't bleed across the whole cabin.
 */
const CAT_AUDIO_FAR_DISTANCE = 9

/**
 * Peak volume scalar applied to the purr loop on top of the distance falloff.
 * The purr is a continuous bed sound so it sits a touch lower than the one-shot
 * meows and the snore loop — easy to hear up close, easy to ignore from across
 * the cabin. Tuned by ear; lower if it starts to feel intrusive.
 */
const CAT_PURR_PEAK_VOLUME = 0.55

/**
 * Maximum distance (world units) from the cat house for the sleep loop to be
 * audible. Player has to walk over and listen — passing by from across the
 * cabin shouldn't broadcast Sushi's snores.
 */
const CAT_SLEEP_AUDIBLE_DISTANCE = 3.5

/**
 * Calm state set in which the purr loop is allowed to run. Includes idle wander
 * (walk/follow) so a happy cat purrs while padding around the cabin. Excludes
 * laser chasing (he's panting too hard to purr), sleeping (the sleep loop owns
 * that), and goal-driven errands (goToBowl/goToLitter/goToHouse/goToBedSide)
 * so the purr doesn't bleed onto purposeful behaviour.
 */
const PURR_ALLOWED_STATES: ReadonlySet<CatState> = new Set<CatState>([
  'idle',
  'walk',
  'sit',
  'eat',
  'follow',
  'idleNearPlayer',
  'sitOnBed',
  'sitOnSideboard',
  'sitOnLocker',
  'sitOnTable',
  'chaseRest',
])

/** Convenience alias for a Howler-backed playback handle. */
type AudioHandle = ReturnType<ReturnType<typeof useAudio>['play']>

/** Per-frame state pushed by the host scene into {@link CatAudioDirector.update}. */
export interface CatAudioState {
  /** Current cat FSM state. */
  catState: CatState
  /** True when the cat is in the live `'sleeping'` state. */
  isSleeping: boolean
  /** Current love value (0..100). */
  love: number
  /** Current hunger value (0..100). */
  hunger: number
  /** Current bladder value (0..100). */
  bladder: number
  /** Current tired value (0..100). */
  tired: number
  /** Cat world position (used for stereo pan + distance falloff). */
  catWorldPos: THREE.Vector3
  /** Cat house world position (used for the sleep-loop audibility check). */
  houseWorldPos: THREE.Vector3
}

/**
 * Audio orchestrator for Sushi the cat. Single-instance per habitat scene; safe
 * to keep alive across scene transitions by toggling
 * {@link CatAudioDirector.start} / {@link CatAudioDirector.stop}.
 */
export class CatAudioDirector {
  private readonly audio = useAudio()
  /** Looping purr handle (null when below threshold or in a non-calm state). */
  private purr: AudioHandle | null = null
  /** Looping snore handle (null when not asleep or player too far from house). */
  private sleep: AudioHandle | null = null
  /** Looping crunch handle (null when Sushi is not in the `'eat'` state). */
  private eat: AudioHandle | null = null
  /** Looping litter-scratch handle (null when Sushi is not in the `'useLitter'` state). */
  private litter: AudioHandle | null = null
  /** Looping sprint handle (null when Sushi is not in the `'chase'` state). */
  private run: AudioHandle | null = null
  /** Cached previous-frame state used to edge-detect "just entered idle". */
  private prevCatState: CatState | null = null
  /** True between {@link start} and {@link stop}. */
  private active = false

  /** Reused vector for camera-space projection of the cat. */
  private readonly _localCat = new THREE.Vector3()
  /** Reused matrix snapshot of the camera's world inverse for the per-frame transform. */
  private readonly _camInverse = new THREE.Matrix4()
  /** Most recent stereo pan derived from the cat's camera-space X (refreshed by {@link update}). */
  private lastPan = 0
  /** Most recent distance falloff derived from the cat→listener XZ range (refreshed by {@link update}). */
  private lastFalloff = 1

  /**
   * Begin audio output. Idempotent — repeated calls without an intervening
   * {@link stop} are no-ops.
   */
  start(): void {
    if (this.active) return
    this.active = true
    this.prevCatState = null
  }

  /**
   * Halt every loop the director currently owns and reset edge state.
   */
  stop(): void {
    if (!this.active) {
      this.tearDownLoops()
      return
    }
    this.active = false
    this.tearDownLoops()
  }

  /**
   * Per-frame update. Drives the two loops' volume + pan from the cat/listener
   * geometry, and rises edges on `idle` to fire the appropriate one-shot meow.
   *
   * @param state - Per-frame state snapshot from the host scene.
   * @param camera - Active perspective camera (provides the listener world transform).
   */
  update(state: CatAudioState, camera: THREE.PerspectiveCamera): void {
    if (!this.active) return

    // Pan + falloff are computed once from the cat's position and applied to all
    // currently-active loops, plus to any one-shot we kick off this frame.
    camera.updateMatrixWorld(true)
    this._camInverse.copy(camera.matrixWorldInverse)
    this._localCat.copy(state.catWorldPos).applyMatrix4(this._camInverse)
    const localX = this._localCat.x
    const distanceXZ = Math.hypot(
      state.catWorldPos.x - camera.position.x,
      state.catWorldPos.z - camera.position.z,
    )
    const catFalloff = computeFalloff(distanceXZ, CAT_AUDIO_NEAR_DISTANCE, CAT_AUDIO_FAR_DISTANCE)
    const catPan = computePan(localX, CAT_AUDIO_FAR_DISTANCE)
    this.lastPan = catPan
    this.lastFalloff = catFalloff

    this.tickPurrLoop(state, catPan, catFalloff)
    this.tickSleepLoop(state, camera, catPan)
    this.tickEatLoop(state, catPan, catFalloff)
    this.tickLitterLoop(state, catPan, catFalloff)
    this.tickRunLoop(state, catPan, catFalloff)
    this.tickCatchOneShot(state, catPan, catFalloff)
    this.tickIdleMeows(state, catPan, catFalloff)

    this.prevCatState = state.catState
  }

  /**
   * Maintain the purr loop: starts when love crosses the threshold and Sushi is
   * in a calm state, stops as soon as either condition lapses. Volume + pan are
   * refreshed every frame from the latest cat→listener geometry.
   */
  private tickPurrLoop(state: CatAudioState, pan: number, falloff: number): void {
    const wantsPurr =
      state.love >= CAT_PURR_LOVE_THRESHOLD && PURR_ALLOWED_STATES.has(state.catState)
    if (!wantsPurr) {
      this.purr?.stop()
      this.purr = null
      return
    }
    const vol = falloff * CAT_PURR_PEAK_VOLUME
    if (this.purr === null) {
      this.purr = this.audio.play('sfx.cat.purr', { loop: true, volume: vol })
    } else {
      this.purr.setVolume(vol)
    }
    this.purr?.setStereo(pan)
  }

  /**
   * Maintain the sleep loop: only audible while Sushi is in the `'sleeping'`
   * state AND the player is close enough to the cat house to hear it. The loop's
   * stereo position tracks the cat's world position even though the cat itself
   * is hidden — the baked sleeping clone sits at the same XZ.
   */
  private tickSleepLoop(
    state: CatAudioState,
    camera: THREE.PerspectiveCamera,
    pan: number,
  ): void {
    const houseDist = Math.hypot(
      state.houseWorldPos.x - camera.position.x,
      state.houseWorldPos.z - camera.position.z,
    )
    const wantsSleep = state.isSleeping && houseDist <= CAT_SLEEP_AUDIBLE_DISTANCE
    if (!wantsSleep) {
      this.sleep?.stop()
      this.sleep = null
      return
    }
    // Use the house-distance falloff (not the cat-distance) so the snore fades
    // as the player walks away from the house, regardless of where the live cat
    // group happens to sit while invisible.
    const falloff = computeFalloff(houseDist, CAT_AUDIO_NEAR_DISTANCE, CAT_SLEEP_AUDIBLE_DISTANCE)
    if (this.sleep === null) {
      this.sleep = this.audio.play('sfx.cat.sleep', { loop: true, volume: falloff })
    } else {
      this.sleep.setVolume(falloff)
    }
    this.sleep?.setStereo(pan)
  }

  /**
   * Fire a one-shot meow on the rising edge of `idle`. Picks `alert` if any
   * need is unmet (so the player gets a directional clue to investigate), else
   * `happy` when love is high. Below both bars Sushi just sits quietly.
   */
  private tickIdleMeows(state: CatAudioState, pan: number, falloff: number): void {
    const enteredIdle = state.catState === 'idle' && this.prevCatState !== 'idle'
    if (!enteredIdle) return

    const needsUnmet =
      state.hunger <= CAT_HUNGER_HUNGRY_THRESHOLD ||
      state.love <= CAT_LOVE_NEEDY_THRESHOLD ||
      state.bladder >= CAT_BLADDER_FULL_THRESHOLD ||
      state.tired >= CAT_TIRED_FULL_THRESHOLD

    // Two happy-meow takes; flip a coin so back-to-back idle entries don't sound
    // like a stuck sample. Alert keeps a single cue — it's a "needs attention"
    // signal, varying it muddles the read.
    let cue: 'sfx.cat.meow.alert' | 'sfx.meow.happy' | 'sfx.cat.meow.variant' | null = null
    if (needsUnmet) cue = 'sfx.cat.meow.alert'
    else if (state.love >= CAT_PURR_LOVE_THRESHOLD) {
      cue = Math.random() < 0.5 ? 'sfx.meow.happy' : 'sfx.cat.meow.variant'
    }
    if (!cue) return

    const handle = this.audio.play(cue, { volume: falloff })
    handle?.setStereo(pan)
  }

  /**
   * Maintain the eat loop: starts on entry to the `'eat'` state, stops as soon as
   * Sushi moves on. The cue is short crunches looped over {@link EAT_DURATION_S}
   * so it sounds continuous regardless of how long the eat state lasts.
   */
  private tickEatLoop(state: CatAudioState, pan: number, falloff: number): void {
    if (state.catState !== 'eat') {
      this.eat?.stop()
      this.eat = null
      return
    }
    if (this.eat === null) {
      this.eat = this.audio.play('sfx.cat.eat', { loop: true, volume: falloff })
    } else {
      this.eat.setVolume(falloff)
    }
    this.eat?.setStereo(pan)
  }

  /**
   * Maintain the litter loop: looping scratch sound while Sushi is using the box.
   * Mirrors {@link tickEatLoop} — gates strictly on the `'useLitter'` state so
   * the loop can't bleed into goToLitter or the post-litter walk-out.
   */
  private tickLitterLoop(state: CatAudioState, pan: number, falloff: number): void {
    if (state.catState !== 'useLitter') {
      this.litter?.stop()
      this.litter = null
      return
    }
    if (this.litter === null) {
      this.litter = this.audio.play('sfx.litter.use', { loop: true, volume: falloff })
    } else {
      this.litter.setVolume(falloff)
    }
    this.litter?.setStereo(pan)
  }

  /**
   * Maintain the run loop: looping sprint sound while Sushi is in the `'chase'`
   * state. Stops on entry to `'chaseRest'` (the pounce) and on any other state
   * change so it doesn't bleed into walking or idle.
   */
  private tickRunLoop(state: CatAudioState, pan: number, falloff: number): void {
    if (state.catState !== 'chase') {
      this.run?.stop()
      this.run = null
      return
    }
    if (this.run === null) {
      this.run = this.audio.play('sfx.cat.run', { loop: true, volume: falloff })
    } else {
      this.run.setVolume(falloff)
    }
    this.run?.setStereo(pan)
  }

  /**
   * Fire the catch one-shot on the rising edge of `'chaseRest'` from `'chase'`
   * — the moment Sushi pounces on the laser dot. Edge-detected against the
   * previous-frame state so a player who keeps the dot still doesn't retrigger.
   */
  private tickCatchOneShot(state: CatAudioState, pan: number, falloff: number): void {
    const caughtLaser = state.catState === 'chaseRest' && this.prevCatState === 'chase'
    if (!caughtLaser) return
    const handle = this.audio.play('sfx.cat.catch', { volume: falloff })
    handle?.setStereo(pan)
  }

  /**
   * Fire the pet-reaction one-shots at Sushi's last computed stereo pan + falloff.
   * Plays both the warm melody bed (`sfx.cat.pet`) and a vocal acknowledgement
   * meow (`sfx.cat.meow.pet`) — the melody is the ambient "good interaction"
   * cue, the meow is Sushi's direct reaction, and stacking them reads as one
   * blended response. Called by the host scene the same frame the player
   * presses F to pet.
   */
  playPet(): void {
    if (!this.active) return
    const melody = this.audio.play('sfx.cat.pet', { volume: this.lastFalloff })
    melody?.setStereo(this.lastPan)
    const meow = this.audio.play('sfx.cat.meow.pet', { volume: this.lastFalloff })
    meow?.setStereo(this.lastPan)
  }

  /**
   * Fire the litterbox-scoop one-shot at Sushi's last computed stereo pan +
   * falloff. The litterbox is fixed in space, but using the cat-side pan still
   * reads correctly because the player has to be standing right next to it to
   * trigger the scoop — pan ≈ 0, falloff ≈ 1 in practice.
   */
  playLitterScoop(): void {
    if (!this.active) return
    const handle = this.audio.play('sfx.litter.scoop', { volume: this.lastFalloff })
    handle?.setStereo(this.lastPan)
  }

  /** Final cleanup. */
  dispose(): void {
    this.stop()
  }

  /** Internal: stop and null every handle, clear edge state. */
  private tearDownLoops(): void {
    this.purr?.stop()
    this.purr = null
    this.sleep?.stop()
    this.sleep = null
    this.eat?.stop()
    this.eat = null
    this.litter?.stop()
    this.litter = null
    this.run?.stop()
    this.run = null
    this.prevCatState = null
  }
}

/**
 * Linear distance falloff in [0, 1]. Returns 1 at or below {@link nearDistance},
 * 0 at or beyond {@link farDistance}, and a smooth ramp between them.
 *
 * @param distance - Listener-to-source distance (world units).
 * @param nearDistance - Distance at which the gain is full.
 * @param farDistance - Distance at which the gain reaches zero.
 */
function computeFalloff(distance: number, nearDistance: number, farDistance: number): number {
  if (distance <= nearDistance) return 1
  if (distance >= farDistance) return 0
  return 1 - (distance - nearDistance) / (farDistance - nearDistance)
}

/**
 * Stereo pan in [-1, 1] from the source's camera-space X coordinate. Past
 * {@link maxRange} the pan is hard-clamped to ±1 so distant sources don't keep
 * pulling toward the centre as they approach the camera's forward axis.
 *
 * @param localX - Source X in camera-space (negative = left of camera).
 * @param maxRange - World-unit range over which pan ramps from 0 to ±1.
 */
function computePan(localX: number, maxRange: number): number {
  if (maxRange <= 0) return 0
  const raw = localX / maxRange
  if (raw < -1) return -1
  if (raw > 1) return 1
  return raw
}
