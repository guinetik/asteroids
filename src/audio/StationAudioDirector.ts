/**
 * Single owner for station-interior audio: the looping ambiance bed,
 * door open/close cues, terminal beeps, and the lava-hazard composite
 * (trigger one-shot, looping alarm, per-tick burn sizzle).
 *
 * The `/station` view used to drive every one of these inline against
 * `useAudio()`, which meant the same edge-detect bookkeeping (hazard
 * enter/exit, ambient lifecycle) lived next to entrance prompts and
 * starfield wiring. This director consolidates those handles + edge
 * state into one place so the view can just call high-level methods
 * (`notifyDoorOpen`, `update({ inHazard })`).
 *
 * Audio explicitly **not** owned here:
 * - Player-bound loops (footsteps, breathing, hazard grunt) — those
 *   live in {@link FpsAudioDirector}, which the station view also owns.
 *
 * @author guinetik
 * @date 2026-05-14
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */

import { useAudio } from './useAudio'
import type { AudioPlaybackHandle } from './audioTypes'

/** Per-frame state pushed by the host view. */
export interface StationAudioState {
  /** True while the player's footprint sits inside any active hazard rect. */
  inHazard: boolean
}

/**
 * Audio orchestrator for the station interior. Single-instance per
 * controller. Lifecycle: `start()` on view init, `update()` every frame
 * while the player is alive, `stop()` on death (silences the alarm
 * loop without tearing down ambient), `dispose()` on view teardown.
 */
export class StationAudioDirector {
  private readonly audio = useAudio()
  /** Looping ambiance bed handle. Lives from `start()` to `dispose()`. */
  private ambient: AudioPlaybackHandle | null = null
  /** Looping "you are being microwaved" alarm. Null when not in hazard. */
  private hazardAlarm: AudioPlaybackHandle | null = null
  /** Looping burn sizzle. Null when not in hazard. */
  private hazardBurn: AudioPlaybackHandle | null = null
  /** True last tick we were inside a hazard rect — drives trigger/alarm edges. */
  private wasInHazard = false
  /** True between {@link StationAudioDirector.start} and {@link StationAudioDirector.dispose}. */
  private active = false

  /**
   * Begin station audio output. Starts the ambiance bed and resets
   * edge-detect state. Idempotent — repeated calls without an
   * intervening {@link StationAudioDirector.dispose} are no-ops.
   */
  start(): void {
    if (this.active) return
    this.active = true
    this.wasInHazard = false
    this.ambient = this.audio.play('ambient.station', { loop: true })
  }

  /**
   * Per-frame state update. Currently just drives the hazard cue stack:
   * fires a one-shot trigger on the rising edge of `inHazard`, starts
   * the looping alarm, and plays a rate-limited burn sizzle on every
   * tick the player stays in the hazard. Exit edge stops the alarm.
   *
   * @param _dt - Frame delta in seconds (unused; reserved for future
   *              hold-timers / fades).
   * @param state - Per-frame state from the host view.
   */
  update(_dt: number, state: StationAudioState): void {
    if (!this.active) return

    if (state.inHazard && !this.wasInHazard) {
      this.audio.play('sfx.station.trigger')
      this.hazardAlarm = this.audio.play('sfx.station.alarm', { loop: true })
      this.hazardBurn = this.audio.play('sfx.burn', { loop: true })
    } else if (!state.inHazard && this.wasInHazard) {
      this.stopHazardLoops()
    }
    this.wasInHazard = state.inHazard
  }

  /** One-shot door open whoosh. Fire on `triggerOpen`. */
  notifyDoorOpen(): void {
    this.audio.play('sfx.station.door')
  }

  /** One-shot door close whoosh. Fire on the open → closing transition. */
  notifyDoorClose(): void {
    this.audio.play('sfx.station.door.close')
  }

  /** One-shot beep fired when the player presses F on a station prop. */
  notifyTerminalInteract(): void {
    this.audio.play('sfx.terminal.interact')
  }

  /**
   * Silence the looping hazard alarm and reset the hazard edge. Called
   * from the host view's death handler so the alarm doesn't keep
   * screaming over the YOU DIED overlay. Ambient stays on so the bed
   * still plays under the death cinematic.
   */
  stopHazard(): void {
    this.stopHazardLoops()
    this.wasInHazard = false
  }

  /**
   * Tear down every handle the director owns. Safe to call from the
   * view's dispose path.
   */
  dispose(): void {
    this.active = false
    this.stopHazardLoops()
    if (this.ambient) {
      this.ambient.stop()
      this.ambient = null
    }
    this.wasInHazard = false
  }

  /** Stop both hazard loops (alarm + burn) if they're active. */
  private stopHazardLoops(): void {
    if (this.hazardAlarm) {
      this.hazardAlarm.stop()
      this.hazardAlarm = null
    }
    if (this.hazardBurn) {
      this.hazardBurn.stop()
      this.hazardBurn = null
    }
  }
}
