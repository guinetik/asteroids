/**
 * Single owner for lander cinematic + environmental audio in the
 * level view ({@link views.LevelViewController}).
 *
 * Mirrors the {@link FpsAudioDirector} / {@link ShuttleAudioDirector}
 * metaphor: the host view pushes per-frame state via
 * {@link LanderAudioDirector.update} and fires one-shot / edge events
 * via the `notify*` methods. The director owns every loop handle and
 * the engine-vibration shake handle, so the level view no longer has
 * to thread Howler handles through cinematic callbacks, the per-frame
 * thrust-vibration block, or the crash / fail cleanup paths.
 *
 * Audio owned here:
 * - `ambient.asteroid`        — level-wide wind bed; runs from
 *   {@link start} through {@link stop} (the entire level lifetime).
 * - `ambient.landerCockpit`   — cockpit hum during arrival + exfil
 *   cinematics; gated by `notifyArrival*Cinematic` /
 *   `notifyExfil*Cinematic`.
 * - `sfx.lander.shake`        — engine-vibration loop with
 *   intensity-modulated volume; driven by per-frame {@link update}.
 * - `sfx.arrivalSeparation`   — one-shot sting when the dropship
 *   shuttle releases the lander.
 * - `sfx.fuelWarning`         — looping alarm while lander fuel fraction
 *   is below ~20%; gated by {@link LanderAudioDirector.tickLanderFuelTelemetry}.
 *
 * Audio explicitly **not** owned here:
 * - Lander main engine (`sfx.lander.thrusterLoop`), descent /
 *   attitude alarms, gyro, touchdown, collision, explosion — owned by
 *   {@link three.LanderController} (already nicely encapsulated; its
 *   per-system envelopes handle their own fade-out).
 * - FPS / EVA on-foot audio (breathing, floating, contact damage) —
 *   owned by {@link FpsAudioDirector}.
 * - Shuttle gameplay audio in the map view — owned by
 *   {@link ShuttleAudioDirector}.
 *
 * @author guinetik
 * @date 2026-04-19
 */

import { useAudio } from './useAudio'
import type { AudioPlaybackHandle } from './audioTypes'

/** Fuel fraction at or below which `sfx.fuelWarning` may fire (lander). */
const LANDER_LOW_FUEL_FRACTION = 0.2
/** Hysteresis: latch clears above this fraction. */
const LANDER_LOW_FUEL_CLEAR_FRACTION = 0.22

/** Shake-loop volume at minimum vibration (engine just firing at altitude). */
const SHAKE_VOL_MIN = 0.08
/** Shake-loop volume at full vibration (liftoff at ground level). */
const SHAKE_VOL_MAX = 0.55

/** Per-frame state pushed by the host view. */
export interface LanderAudioState {
  /**
   * True while the lander main engine is firing. Gates the shake
   * loop on the rising / falling edge — no firing means no shake.
   */
  engineFiring: boolean
  /**
   * Normalised vibration factor in `[0, 1]`. The host computes this
   * from its altitude-based intensity curve (strongest at liftoff,
   * fades with altitude); the director maps it linearly into the
   * {@link SHAKE_VOL_MIN}–{@link SHAKE_VOL_MAX} volume range. Values
   * outside `[0, 1]` are clamped.
   */
  vibrationFactor: number
}

/**
 * Audio orchestrator for the lander cinematic + environmental layer
 * in the level view. Single-instance per controller; safe to keep
 * alive across pause/resume by toggling {@link start} / {@link stop}.
 */
export class LanderAudioDirector {
  private readonly audio = useAudio()

  /** Level-wide wind bed; active between {@link start} and {@link stop}. */
  private windAmbient: AudioHandle = null
  /** Cockpit hum loop; active during arrival + exfil cinematics. */
  private cockpitAmbient: AudioHandle = null
  /** Engine vibration loop; created lazily on first firing tick. */
  private shakeLoop: AudioHandle = null
  /** Low-fuel alarm loop; active while fuel fraction is below {@link LANDER_LOW_FUEL_FRACTION}. */
  private fuelWarningLoop: AudioHandle = null

  /** True between {@link start} and {@link stop}. */
  private active = false

  /**
   * Begin level audio output. Starts the asteroid wind ambient bed.
   * Idempotent — repeated calls without an intervening
   * {@link stop} are no-ops.
   */
  start(): void {
    if (this.active) return
    this.active = true
    this.windAmbient = this.audio.play('ambient.asteroid', { loop: true })
  }

  /**
   * Halt every loop the director currently owns. Safe to call from
   * dispose paths or scene transitions.
   */
  stop(): void {
    if (!this.active) {
      // Defensive: keep "after stop() nothing sounds" honest even if
      // a caller short-circuited start().
      this.tearDownLoops()
      return
    }
    this.active = false
    this.tearDownLoops()
  }

  /**
   * Per-frame state update. Drives the engine-vibration shake loop:
   * starts / stops it on the firing edge and rescales its volume
   * from the supplied normalised vibration factor.
   *
   * Cheap (no allocations); safe to call every frame regardless of
   * whether {@link start} has run — inactive ticks short-circuit
   * before touching any audio handles.
   *
   * @param _dt   - Seconds since the previous tick (unused; kept for
   *                symmetry with {@link FpsAudioDirector.update}).
   * @param state - Lander vibration state for this frame.
   */
  update(_dt: number, state: LanderAudioState): void {
    if (!this.active) return

    if (state.engineFiring) {
      const factor = clamp01(state.vibrationFactor)
      const vol = SHAKE_VOL_MIN + (SHAKE_VOL_MAX - SHAKE_VOL_MIN) * factor
      if (this.shakeLoop === null) {
        this.shakeLoop = this.audio.play('sfx.lander.shake', { loop: true, volume: vol })
      } else {
        this.shakeLoop.setVolume(vol)
      }
    } else if (this.shakeLoop !== null) {
      this.shakeLoop.stop()
      this.shakeLoop = null
    }
  }

  /**
   * Per-frame lander fuel check while the player is flying the lander.
   * Plays `sfx.fuelWarning` once when fraction drops through
   * {@link LANDER_LOW_FUEL_FRACTION}.
   *
   * @param fuelLevel    - Current fuel units.
   * @param fuelCapacity - Tank capacity (must be &gt; 0).
   */
  tickLanderFuelTelemetry(fuelLevel: number, fuelCapacity: number): void {
    if (!this.active || fuelCapacity <= 0) return
    const ratio = fuelLevel / fuelCapacity
    if (ratio <= LANDER_LOW_FUEL_FRACTION) {
      if (this.fuelWarningLoop === null) {
        this.fuelWarningLoop = this.audio.play('sfx.fuelWarning', { loop: true })
      }
    } else if (ratio > LANDER_LOW_FUEL_CLEAR_FRACTION && this.fuelWarningLoop !== null) {
      this.fuelWarningLoop.stop()
      this.fuelWarningLoop = null
    }
  }

  /**
   * Call when leaving lander flight (EVA, cinematic, etc.) to stop any
   * active fuel warning loop so the next session starts clean.
   */
  clearLanderFuelWarningLatch(): void {
    this.fuelWarningLoop?.stop()
    this.fuelWarningLoop = null
  }

  /**
   * Arrival cinematic just started — the dropship is descending
   * toward the asteroid with the lander stowed. Starts the cockpit
   * ambient bed for the duration of the cinematic.
   *
   * Idempotent — repeated calls reuse the existing handle.
   */
  notifyArrivalCinematicStart(): void {
    this.startCockpit()
  }

  /**
   * Dropship just released the lander. Fires the one-shot separation
   * sting; cockpit ambient continues until the cinematic ends.
   */
  notifyLanderSeparation(): void {
    this.audio.play('sfx.arrivalSeparation')
  }

  /**
   * Arrival cinematic finished (or was skipped via ESC). Stops the
   * cockpit ambient bed; the wind ambient continues.
   */
  notifyArrivalCinematicEnd(): void {
    this.stopCockpit()
  }

  /**
   * Exfil cinematic just started — the lander is being recovered by
   * the dropship. Restarts the cockpit ambient bed for the duration.
   */
  notifyExfilCinematicStart(): void {
    this.startCockpit()
  }

  /**
   * Exfil cinematic finished. Stops the cockpit ambient bed.
   */
  notifyExfilCinematicEnd(): void {
    this.stopCockpit()
  }

  /**
   * Lander run failed (crash, fuel exhaustion, adrift, hull
   * destruction). Performs a blunt sweep of all in-flight gameplay
   * SFX and stops every loop the director owns *except* the wind
   * bed, which stays alive so the post-fail UI doesn't sit in dead
   * silence.
   *
   * The category sweep is necessary because the {@link LanderController}
   * tickable is unregistered as part of the fail path, so its engine /
   * RCS / alarm envelopes never reach zero on their own.
   */
  notifyLanderRunFailed(): void {
    this.audio.stopCategory('sfx')
    // 'sfx' category sweep silences shake + fuelWarning loops — drop
    // handles so next rising-edge re-creates them cleanly.
    this.shakeLoop = null
    this.fuelWarningLoop = null
    this.stopCockpit()
  }

  /**
   * Final cleanup. Equivalent to {@link stop}; provided for symmetry
   * with other view-owned subsystems that have an explicit dispose
   * path.
   */
  dispose(): void {
    this.stop()
  }

  /** Internal: start cockpit ambient if not already running. */
  private startCockpit(): void {
    if (this.cockpitAmbient !== null) return
    this.cockpitAmbient = this.audio.play('ambient.landerCockpit', { loop: true })
  }

  /** Internal: stop cockpit ambient (idempotent). */
  private stopCockpit(): void {
    if (this.cockpitAmbient !== null) {
      this.cockpitAmbient.stop()
      this.cockpitAmbient = null
      return
    }
    // Belt-and-braces: an external caller may have nuked the handle
    // via `stopSound('ambient.landerCockpit')` (e.g. from a hot-reload
    // or legacy code path). Issue an extra stop so the bed actually
    // quiets even if our reference was orphaned.
    this.audio.stopSound('ambient.landerCockpit')
  }

  /** Internal: stop and null every handle the director owns. */
  private tearDownLoops(): void {
    this.windAmbient?.stop()
    this.windAmbient = null
    this.cockpitAmbient?.stop()
    this.cockpitAmbient = null
    this.shakeLoop?.stop()
    this.shakeLoop = null
    this.fuelWarningLoop?.stop()
    this.fuelWarningLoop = null
    // Belt-and-braces stop on the ambient ids in case Howler still
    // has a stale instance from before our handle was registered.
    this.audio.stopSound('ambient.asteroid')
    this.audio.stopSound('ambient.landerCockpit')
  }
}

/** Convenience alias for a Howler-backed playback handle slot. */
type AudioHandle = AudioPlaybackHandle | null

/** Clamp a number into the inclusive `[0, 1]` interval. */
function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}
