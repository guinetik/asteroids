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
 * That leaves the "miscellaneous level events" — resource pickups and
 * objective (nest / virus) explosions — which were the last two
 * `useAudio().play(...)` call sites left in the level controller.
 * Centralising them here keeps the director metaphor consistent: the
 * view fires `notify*` events, the director owns the volume curves and
 * audio plumbing.
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

/**
 * Audio orchestrator for miscellaneous level events. Single-instance
 * per controller; safe to keep alive across the entire level lifetime.
 */
export class LevelAudioDirector {
  private readonly audio = useAudio()

  /**
   * Player just successfully picked up a mineral / resource. Plays the
   * pickup chime at a fixed, gentle volume — the cue is informational
   * rather than dramatic, so it reads the same regardless of yield.
   */
  notifyResourcePickup(): void {
    this.audio.play('sfx.pickup', { volume: PICKUP_VOLUME })
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

  /**
   * Final cleanup. No-op today (the director holds no loops), but
   * provided for symmetry with {@link FpsAudioDirector.dispose} and
   * {@link LanderAudioDirector.dispose} so the host can wire up all
   * directors uniformly in its own dispose path.
   */
  dispose(): void {
    // Intentional no-op. Reserved for future loops / handles.
  }
}

/** Clamp a number into the inclusive `[0, 1]` interval. */
function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}
