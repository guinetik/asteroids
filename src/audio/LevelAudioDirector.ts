/**
 * Single owner for level-wide one-shot gameplay audio in
 * {@link views.LevelViewController} that doesn't belong to any of the
 * more specialised directors:
 *
 * - {@link FpsAudioDirector}   — on-foot player audio (footsteps,
 *   breathing, floating, contact / projectile / fall damage).
 * - {@link LanderAudioDirector} — lander cinematic + environmental
 *   audio (asteroid wind, cockpit hum, separation sting, vibration
 *   shake, fail sweep).
 * - {@link three.LanderController} — internal lander sounds (engine,
 *   RCS, alarms, gyro, touchdown, collision, explosion).
 *
 * That leaves the "miscellaneous level events" — resource pickups,
 * objective (nest / virus) explosions, EVA death stingers, rock-melt
 * one-shots, and the mining/surface-sizzle plumbing that used to live
 * directly in the level controller. Centralising them here keeps the
 * director metaphor consistent: the view fires `notify*` events, the
 * director owns the volume curves, playback handles, and audio
 * plumbing.
 *
 * Unlike the other directors this one holds no loops and no per-frame
 * state, so there's no `update()` / `start()` / `stop()` lifecycle to
 * manage — just a constructor, the `notify*` event API, and a
 * {@link LevelAudioDirector.dispose} hook that exists purely for
 * symmetry with the other directors.
 *
 * @author guinetik
 * @date 2026-04-19
 */

import { useAudio } from './useAudio'
import { getAudioDefinition } from './audioManifest'
import { worldPointToHearing } from '@/lib/audio/worldHearing'
import { Timer, type TimerHandle } from '@/lib/Timer'
import type { AudioPlaybackHandle } from './audioTypes'
import type { PerspectiveCamera, Vector3 } from 'three'

/** Resource pickup chime volume (constant; pickups don't scale by yield). */
const PICKUP_VOLUME = 0.35

/**
 * Objective-explosion (nest / virus) base volume at zero attenuation
 * (i.e. the player is at or past {@link views.EXPLOSION_FEEDBACK_RANGE}).
 * Floored above zero so a distant blast still reads as a faint rumble
 * instead of being silently dropped.
 */
const EXPLOSION_VOL_BASE = 0.3
/**
 * Volume range added on top of {@link EXPLOSION_VOL_BASE} as attenuation
 * climbs toward 1 (player on top of the blast). At full attenuation the
 * total is `EXPLOSION_VOL_BASE + EXPLOSION_VOL_RANGE` = 1.0.
 */
const EXPLOSION_VOL_RANGE = 0.7
/** Seconds the looping mining-contact sizzle is held after the latest hit. */
const MINING_SIZZLE_KEEPALIVE_SECONDS = 0.18
/** One-shot surface-sizzle duration in seconds before its handle is stopped. */
const SIZZLE_IMPACT_DURATION_SEC = 0.1
/** Spatial reference distance for the one-shot surface-sizzle cue. */
const SIZZLE_SPATIAL_REF_DISTANCE = 10
/** Lowest volume scale allowed for a distant one-shot surface-sizzle cue. */
const SIZZLE_SPATIAL_MIN_VOLUME = 0.12
/** Spatial reference distance for the prospect-complete positional cue. */
const PROSPECT_SPATIAL_REF_DISTANCE = 50
/** Lowest volume scale allowed for a distant prospect-complete cue. */
const PROSPECT_SPATIAL_MIN_VOLUME = 0.7

/**
 * Audio orchestrator for miscellaneous level events. Single-instance
 * per controller; safe to keep alive across the entire level lifetime.
 */
export class LevelAudioDirector {
  private readonly audio = useAudio()
  /** Looping rock-contact bed sustained while mining hits keep landing. */
  private miningSizzleHandle: AudioPlaybackHandle | null = null
  /** Time threshold after which the mining-contact bed should stop. */
  private miningSizzleKeepAliveUntil = 0
  /**
   * Pending one-shot impact sizzle entries. Each gets its own
   * audio handle and stop timer so rapid-fire weapon impacts don't
   * leak handles past their {@link SIZZLE_IMPACT_DURATION_SEC}
   * window — the previous implementation only tracked one timer
   * which got cancelled on each new hit, leaving older handles to
   * play out the full audio buffer length unchecked.
   */
  private readonly activeSizzles: Array<{
    handle: AudioPlaybackHandle
    timer: TimerHandle
  }> = []

  /**
   * Player just successfully picked up a mineral / resource. Plays the
   * pickup chime at a fixed, gentle volume — the cue is informational
   * rather than dramatic, so it reads the same regardless of yield.
   */
  notifyResourcePickup(): void {
    this.audio.play('sfx.collect', { volume: PICKUP_VOLUME })
  }

  /**
   * A rock was fully prospected; play the analytical-beep cue as a
   * positional point source so it reads as coming from the rock.
   *
   * @param worldPos - World-space center of the prospected rock.
   * @param camera - FPS camera (for `worldPointToHearing`).
   */
  notifyProspectComplete(worldPos: Vector3, camera: PerspectiveCamera): void {
    const w = worldPointToHearing(camera, worldPos, {
      refDistance: PROSPECT_SPATIAL_REF_DISTANCE,
      minVolumeScale: PROSPECT_SPATIAL_MIN_VOLUME,
    })
    const def = getAudioDefinition('sfx.tool.prospectComplete')
    const handle = this.audio.play('sfx.tool.prospectComplete', {
      volume: def.volume * w.volumeScale,
    })
    handle.setStereo(w.pan)
  }

  /**
   * The rocket-survey scan revealed a marker; play the analytical-beep
   * cue as a positional point source so it reads as coming from the
   * rocket itself.
   *
   * @param worldPos - World-space position of the rocket group.
   * @param camera - FPS camera (for `worldPointToHearing`).
   */
  notifySurveyReveal(worldPos: Vector3, camera: PerspectiveCamera): void {
    const w = worldPointToHearing(camera, worldPos, {
      refDistance: PROSPECT_SPATIAL_REF_DISTANCE,
      minVolumeScale: PROSPECT_SPATIAL_MIN_VOLUME,
    })
    const def = getAudioDefinition('sfx.tool.surveyReveal')
    const handle = this.audio.play('sfx.tool.surveyReveal', {
      volume: def.volume * w.volumeScale,
    })
    handle.setStereo(w.pan)
  }

  /**
   * An objective (nest, virus, etc.) just detonated. Plays the
   * explosion one-shot volume-scaled by the player's distance-derived
   * attenuation factor so close blasts hit hard and far blasts read as
   * a distant rumble.
   *
   * The host is responsible for computing `attenuation` from its own
   * distance / falloff curve so the director stays decoupled from
   * gameplay constants like the explosion feedback range. Values
   * outside `[0, 1]` are clamped.
   *
   * @param attenuation - Normalised proximity factor in `[0, 1]`.
   *                      `1` = player on top of the blast,
   *                      `0` = at or past the feedback range.
   */
  notifyObjectiveExplosion(attenuation: number): void {
    const a = clamp01(attenuation)
    const volume = EXPLOSION_VOL_BASE + EXPLOSION_VOL_RANGE * a
    this.audio.play('sfx.explosive', { volume })
  }

  /** Player just died during EVA; play the death stingers. */
  notifyEvaDeath(): void {
    this.audio.play('sfx.heartbeat')
    this.audio.play('sfx.flatline')
  }

  /** A rock was fully consumed by mining; play the melt one-shot. */
  notifyRockMelt(): void {
    this.audio.play('sfx.rock.melt')
  }

  /**
   * Extend or start the looping rock-contact sizzle while mining hits keep landing.
   *
   * @param elapsedSeconds - Current controller elapsed time in seconds.
   */
  keepMiningSizzleAlive(elapsedSeconds: number): void {
    this.miningSizzleKeepAliveUntil = elapsedSeconds + MINING_SIZZLE_KEEPALIVE_SECONDS
    if (this.miningSizzleHandle?.playing()) return

    this.audio.unlock()
    this.miningSizzleHandle = this.audio.play('sfx.sizzle', { loop: true })
  }

  /**
   * Stop the looping mining-contact sizzle immediately.
   */
  stopMiningSizzle(): void {
    this.miningSizzleHandle?.stop()
    this.miningSizzleHandle = null
    this.miningSizzleKeepAliveUntil = 0
  }

  /**
   * Release the mining-contact loop once the keepalive window expires.
   *
   * @param elapsedSeconds - Current controller elapsed time in seconds.
   */
  updateMiningSizzle(elapsedSeconds: number): void {
    if (!this.miningSizzleHandle) return
    if (elapsedSeconds <= this.miningSizzleKeepAliveUntil) return
    this.stopMiningSizzle()
  }

  /**
   * Play a brief, spatialized surface-sizzle one-shot at the impact point.
   *
   * @param camera - Active FPS camera for pan/distance hearing, or `null`.
   * @param impactWorld - World-space impact point.
   */
  playShortSurfaceSizzle(camera: PerspectiveCamera | null, impactWorld: Vector3): void {
    this.audio.unlock()
    const def = getAudioDefinition('sfx.sizzle.impact')
    let volume = def.volume
    let pan = 0
    if (camera) {
      const hearing = worldPointToHearing(camera, impactWorld, {
        refDistance: SIZZLE_SPATIAL_REF_DISTANCE,
        minVolumeScale: SIZZLE_SPATIAL_MIN_VOLUME,
      })
      volume = def.volume * hearing.volumeScale
      pan = hearing.pan
    }

    const handle = this.audio.play('sfx.sizzle.impact', { loop: false, volume })
    handle.setStereo(pan)
    const entry = { handle, timer: null as unknown as TimerHandle }
    entry.timer = Timer.after(SIZZLE_IMPACT_DURATION_SEC, () => {
      handle.stop()
      const i = this.activeSizzles.indexOf(entry)
      if (i >= 0) this.activeSizzles.splice(i, 1)
    })
    this.activeSizzles.push(entry)
  }

  /**
   * Final cleanup. No-op today (the director holds no loops), but
   * provided for symmetry with {@link FpsAudioDirector.dispose} and
   * {@link LanderAudioDirector.dispose} so the host can wire up all
   * directors uniformly in its own dispose path.
   */
  dispose(): void {
    this.stopMiningSizzle()
    this.stopAllShortSurfaceSizzles()
  }

  /** Cancel timers and stop every in-flight short-sizzle handle. */
  private stopAllShortSurfaceSizzles(): void {
    for (const entry of this.activeSizzles) {
      Timer.cancel(entry.timer)
      entry.handle.stop()
    }
    this.activeSizzles.length = 0
  }
}

/** Clamp a number into the inclusive `[0, 1]` interval. */
function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}
