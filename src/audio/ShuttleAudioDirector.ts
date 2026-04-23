/**
 * Single owner for shuttle gameplay audio in the map view
 * ({@link views.MapViewController}).
 *
 * Mirrors the {@link FpsAudioDirector} metaphor: the host view pushes
 * per-frame state via {@link ShuttleAudioDirector.update} and fires
 * one-shot / edge events via the `notify*` methods. The director owns
 * every loop handle and edge-detection flag it touches, so the view,
 * orbit facade, mission facade, lifecycle facade, and shuttle
 * controller no longer thread Howler handles through their own state.
 *
 * Audio owned here:
 * - `ambient.space`           — main map ambient bed; active whenever
 *   the player is flying the shuttle (i.e. not inside the habitat).
 * - `ambient.habitat`         — habitat ambient bed; active while
 *   inside the parked shuttle interior.
 * - `ambient.engine`          — layered with habitat while inside the
 *   parked shuttle (idle systems hum).
 * - `ambient.shuttleMission`  — canvas orbital minigame bed (`shuttle.mp3`).
 * - `ambient.anomaly`         — gravitational anomaly proximity loop;
 *   gated by {@link notifyAnomalyProximityStart} / {@link notifyAnomalyProximityEnd}.
 * - `sfx.slingshot.charge`    — slingshot charge whine loop; gated by
 *   {@link ShuttleAudioState.slingshotCharging} on the per-frame update.
 * - `sfx.wormhole`            — manifold tunnel loop; rate-adjusted to
 *   match the surf travel time so the clip lasts the full ride.
 * - `sfx.cargo.open` / `.close` — cargo bay doors (one-shots).
 * - `sfx.orbitCapture`        — orbit-capture sting (one-shot).
 * - `sfx.slingshot` + `sfx.slingshot.burst` — slingshot release (one-shots).
 * - `sfx.mission.shuttle.clear` — mission delivered sting (one-shot).
 * - `sfx.geiger`               — geiger-counter clicker loop; gated by
 *   {@link ShuttleAudioDirector.tickRadiationTelemetry}.
 *
 * Audio explicitly **not** owned here:
 * - Shuttle main engine, RCS, brake — owned by
 *   {@link three.ThrusterEffectController} (already nicely
 *   encapsulated; trying to relocate would only break the existing
 *   envelope handling).
 * - Habitat interior FPS audio — owned by the habitat scene.
 * - Level/EVA on-foot audio — owned by {@link FpsAudioDirector}.
 *
 * @author guinetik
 * @date 2026-04-19
 */

import { useAudio } from './useAudio'
import type { AudioPlaybackHandle } from './audioTypes'

/**
 * Manifold tunnel rate clamp. Howler's playback rate is restricted to
 * `[0.5, 2]` for compatibility, so we mirror those bounds when stretching
 * the wormhole clip across the dive duration.
 */
const WORMHOLE_RATE_MIN = 0.5
const WORMHOLE_RATE_MAX = 2.0

/** Fuel fraction at or below which `sfx.fuelWarning` may fire (shuttle). */
const SHUTTLE_LOW_FUEL_FRACTION = 0.2
/** Hysteresis: latch clears above this fraction to avoid boundary flutter. */
const SHUTTLE_LOW_FUEL_CLEAR_FRACTION = 0.22

/** Per-frame state pushed by the host view. */
export interface ShuttleAudioState {
  /**
   * True while the player is actively charging the slingshot
   * (orbiting + `orbitAction` held). The director starts the charge
   * loop on the rising edge and stops it on the falling edge.
   */
  slingshotCharging: boolean
}

/**
 * Audio orchestrator for the shuttle gameplay layer in the map view.
 * Single-instance per controller; safe to keep alive across pause/resume
 * by toggling {@link ShuttleAudioDirector.start} /
 * {@link ShuttleAudioDirector.stop}.
 */
export class ShuttleAudioDirector {
  private readonly audio = useAudio()

  /** Map ambient bed; active between {@link start} and {@link notifyEnterHabitat}. */
  private spaceAmbient: AudioHandle = null
  /** Habitat ambient bed; active between {@link notifyEnterHabitat} and {@link notifyExitHabitat}. */
  private habitatAmbient: AudioHandle = null
  /** Engine idle bed; layered with {@link habitatAmbient} in the habitat. */
  private engineAmbient: AudioHandle = null
  /** Interactive orbital minigame canvas bed; gated by {@link notifyShuttleMissionBed}. */
  private shuttleMissionBed: AudioHandle = null
  /** Anomaly proximity loop; active while inside a gravitational disturbance. */
  private anomalyAmbient: AudioHandle = null
  /** Slingshot charge whine loop; gated by per-frame {@link update}. */
  private chargeLoop: AudioHandle = null
  /** Manifold tunnel loop; rate-adjusted to match surf travel time. */
  private wormholeLoop: AudioHandle = null
  /** Low-fuel alarm loop; active while fuel fraction is below {@link SHUTTLE_LOW_FUEL_FRACTION}. */
  private fuelWarningLoop: AudioHandle = null
  /**
   * Geiger-counter clicker loop. Active for as long as
   * {@link ShuttleAudioDirector.tickRadiationTelemetry} reports
   * {@link lib.shipHealth.ShipHealth.isTakingRadiationDamage} as true.
   * Single-instance via the manifest plus this nullable handle so concurrent
   * ticks can never spawn overlapping loops.
   */
  private radiationLoop: AudioHandle = null

  /** True between {@link start} and {@link stop}. */
  private active = false
  /** True when the player is currently inside the habitat interior. */
  private insideHabitat = false

  /**
   * Begin shuttle audio output. Starts the map (space) ambient bed.
   * Idempotent — repeated calls without an intervening
   * {@link ShuttleAudioDirector.stop} are no-ops.
   */
  start(): void {
    if (this.active) return
    this.active = true
    this.insideHabitat = false
    this.spaceAmbient = this.audio.play('ambient.space', { loop: true })
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
    this.insideHabitat = false
    this.tearDownLoops()
  }

  /**
   * Per-frame state update. Drives the slingshot charge loop on the
   * rising / falling edge of {@link ShuttleAudioState.slingshotCharging}.
   *
   * Cheap (no allocations); safe to call every frame regardless of
   * whether {@link start} has run — inactive ticks short-circuit before
   * touching any audio handles.
   *
   * @param _dt   - Seconds since the previous tick (unused; kept for
   *                symmetry with {@link FpsAudioDirector.update}).
   * @param state - Per-frame shuttle audio state.
   */
  update(_dt: number, state: ShuttleAudioState): void {
    if (!this.active) return

    if (state.slingshotCharging) {
      if (this.chargeLoop === null) {
        this.chargeLoop = this.audio.play('sfx.slingshot.charge', { loop: true })
      }
    } else if (this.chargeLoop !== null) {
      this.chargeLoop.stop()
      this.chargeLoop = null
    }
  }

  /**
   * Per-frame shuttle fuel check for the map view. Plays `sfx.fuelWarning`
   * once when fraction drops through ~20%.
   *
   * @param fuelLevel    - Current fuel units.
   * @param fuelCapacity - Tank capacity (must be &gt; 0).
   * @param shuttleAlive - False skips the check (e.g. destroyed shuttle).
   */
  tickShuttleFuelTelemetry(fuelLevel: number, fuelCapacity: number, shuttleAlive: boolean): void {
    if (!shuttleAlive || fuelCapacity <= 0) return
    const ratio = fuelLevel / fuelCapacity
    if (ratio <= SHUTTLE_LOW_FUEL_FRACTION) {
      if (this.fuelWarningLoop === null) {
        this.fuelWarningLoop = this.audio.play('sfx.fuelWarning', { loop: true })
      }
    } else if (ratio > SHUTTLE_LOW_FUEL_CLEAR_FRACTION && this.fuelWarningLoop !== null) {
      this.fuelWarningLoop.stop()
      this.fuelWarningLoop = null
    }
  }

  /**
   * Per-frame radiation exposure check. Spins up the looping geiger-counter
   * clicker on the rising edge of `damageActive` and tears it down on the
   * falling edge. No hysteresis is needed because the source signal
   * ({@link lib.shipHealth.ShipHealth.isTakingRadiationDamage}) is itself
   * driven by zone boundaries and tick-rate-stable.
   *
   * Inactive director ticks short-circuit so callers can fire this every
   * frame regardless of whether {@link start} has run.
   *
   * @param damageActive - True when the hull is currently losing HP to
   *                       radiation. False at all other times — including
   *                       safely shielded inside a radiation zone.
   */
  tickRadiationTelemetry(damageActive: boolean): void {
    if (!this.active) return
    if (damageActive) {
      if (this.radiationLoop === null) {
        this.radiationLoop = this.audio.play('sfx.geiger', { loop: true })
      }
      return
    }
    if (this.radiationLoop !== null) {
      this.radiationLoop.stop()
      this.radiationLoop = null
    }
  }

  /**
   * Starts or stops the orbital minigame ambient bed (`ambient.shuttleMission`).
   *
   * @param active - True while a canvas shuttle mission overlay is visible.
   */
  notifyShuttleMissionBed(active: boolean): void {
    if (active) {
      if (this.shuttleMissionBed === null) {
        this.shuttleMissionBed = this.audio.play('ambient.shuttleMission', { loop: true })
      }
      return
    }
    if (this.shuttleMissionBed !== null) {
      this.shuttleMissionBed.stop()
      this.shuttleMissionBed = null
    }
    this.audio.stopSound('ambient.shuttleMission')
  }

  /**
   * Player just entered the habitat (parked shuttle interior). Swaps
   * the space ambient bed for the habitat ambient bed.
   *
   * Idempotent — repeated calls without an intervening
   * {@link notifyExitHabitat} keep the existing habitat handle.
   */
  notifyEnterHabitat(): void {
    if (this.insideHabitat) return
    this.insideHabitat = true
    if (this.spaceAmbient !== null) {
      this.spaceAmbient.stop()
      this.spaceAmbient = null
    }
    this.audio.stopSound('ambient.space')
    if (this.habitatAmbient === null) {
      this.habitatAmbient = this.audio.play('ambient.habitat', { loop: true })
    }
    if (this.engineAmbient === null) {
      this.engineAmbient = this.audio.play('ambient.engine', { loop: true })
    }
  }

  /**
   * Player just left the habitat. Swaps habitat ambient back to the
   * map (space) ambient bed.
   */
  notifyExitHabitat(): void {
    if (!this.insideHabitat) return
    this.insideHabitat = false
    if (this.habitatAmbient !== null) {
      this.habitatAmbient.stop()
      this.habitatAmbient = null
    }
    this.audio.stopSound('ambient.habitat')
    if (this.engineAmbient !== null) {
      this.engineAmbient.stop()
      this.engineAmbient = null
    }
    this.audio.stopSound('ambient.engine')
    if (this.active && this.spaceAmbient === null) {
      this.spaceAmbient = this.audio.play('ambient.space', { loop: true })
    }
  }

  /**
   * Player has entered the influence radius of a gravitational
   * anomaly. Starts the anomaly proximity loop.
   *
   * Idempotent — overlapping anomalies reuse the same handle.
   */
  notifyAnomalyProximityStart(): void {
    if (this.anomalyAmbient !== null) return
    this.anomalyAmbient = this.audio.play('ambient.anomaly', { loop: true })
  }

  /**
   * Player has left the influence radius (or the anomaly expired).
   * Stops the anomaly proximity loop.
   */
  notifyAnomalyProximityEnd(): void {
    if (this.anomalyAmbient !== null) {
      this.anomalyAmbient.stop()
      this.anomalyAmbient = null
      return
    }
    // Belt-and-braces: an external caller may have nuked the handle via
    // `stopSound('ambient.anomaly')` (e.g. a death sweep). Issue an
    // extra stop in case our reference was orphaned.
    this.audio.stopSound('ambient.anomaly')
  }

  /**
   * Cargo bay doors just toggled open or closed. Plays the matching
   * one-shot.
   *
   * @param open - True if the doors are now opening, false if closing.
   */
  notifyCargoDoorsToggled(open: boolean): void {
    this.audio.play(open ? 'sfx.cargo.open' : 'sfx.cargo.close')
  }

  /**
   * Player just engaged orbit capture around a body. Plays the capture
   * sting one-shot.
   */
  notifyOrbitCapture(): void {
    this.audio.play('sfx.orbitCapture')
  }

  /**
   * Player just released the slingshot. Fires both the launch sting
   * and the burst layer. The charge loop will be stopped on the next
   * {@link update} tick once the host reports `slingshotCharging:
   * false`; callers that want an instant cut can also call
   * {@link cancelSlingshotCharge}.
   */
  notifySlingshotRelease(): void {
    this.audio.play('sfx.slingshot')
    this.audio.play('sfx.slingshot.burst')
  }

  /**
   * Force the slingshot charge loop to stop immediately, regardless of
   * the per-frame state. Useful for failure paths where the host won't
   * call {@link update} again before the next frame.
   */
  cancelSlingshotCharge(): void {
    if (this.chargeLoop !== null) {
      this.chargeLoop.stop()
      this.chargeLoop = null
    }
  }

  /**
   * Manifold (orbital surf) coupling just engaged. Starts the wormhole
   * tunnel loop. Subsequent {@link notifyManifoldDiveStarted} calls can
   * stretch the clip across the full dive duration via playback rate.
   */
  notifyManifoldCouplingStart(): void {
    if (this.wormholeLoop !== null) return
    this.wormholeLoop = this.audio.play('sfx.wormhole')
  }

  /**
   * Dive segment of the manifold surf just began with a known total
   * travel time. Adjusts the wormhole clip's playback rate so it
   * spans the full ride (coupling + dive) without looping or ending
   * early.
   *
   * Rate is clamped to `[0.5, 2]` (Howler's supported range); rides
   * shorter or longer than that interval will simply use the nearest
   * supported rate.
   *
   * @param travelTimeSec      - Dive duration in seconds.
   * @param coupleDurationSec  - Coupling pre-roll duration already
   *                             elapsed since {@link notifyManifoldCouplingStart}.
   */
  notifyManifoldDiveStarted(travelTimeSec: number, coupleDurationSec: number): void {
    if (this.wormholeLoop === null) return
    const clipDuration = this.wormholeLoop.duration()
    if (clipDuration <= 0 || travelTimeSec <= 0) return
    const totalDuration = travelTimeSec + Math.max(0, coupleDurationSec)
    const rate = clamp(clipDuration / totalDuration, WORMHOLE_RATE_MIN, WORMHOLE_RATE_MAX)
    this.wormholeLoop.setRate(rate)
  }

  /**
   * Manifold surf just ended (player exited the tunnel). Stops the
   * wormhole loop.
   */
  notifyManifoldSurfEnd(): void {
    if (this.wormholeLoop !== null) {
      this.wormholeLoop.stop()
      this.wormholeLoop = null
    }
  }

  /**
   * Shuttle mission was delivered at the science station. Plays the
   * mission-clear sting.
   */
  notifyMissionDelivered(): void {
    this.audio.play('sfx.mission.shuttle.clear')
  }

  /**
   * Shuttle was destroyed (crash, frozen, adrift, etc.). Performs a
   * blunt sweep of all in-flight gameplay SFX and stops every loop the
   * director owns *except* the wind / habitat ambient bed (the
   * post-death overlay sits on top of the ambient bed, which would feel
   * off if it cut out as well).
   *
   * The category sweep covers loops the director doesn't own
   * (thruster envelope inside {@link ThrusterEffectController}, alarms,
   * etc.) since their host tickables may have already been frozen and
   * won't reach zero on their own.
   */
  notifyShuttleDestroyed(): void {
    this.audio.stopCategory('sfx')
    this.chargeLoop = null
    this.wormholeLoop = null
    this.fuelWarningLoop = null
    this.radiationLoop = null
    if (this.anomalyAmbient !== null) {
      this.anomalyAmbient.stop()
      this.anomalyAmbient = null
    }
    this.audio.stopSound('ambient.anomaly')
    if (this.shuttleMissionBed !== null) {
      this.shuttleMissionBed.stop()
      this.shuttleMissionBed = null
    }
    this.audio.stopSound('ambient.shuttleMission')
  }

  /**
   * Final cleanup. Equivalent to {@link ShuttleAudioDirector.stop};
   * provided for symmetry with other view-owned subsystems that have
   * an explicit dispose path.
   */
  dispose(): void {
    this.stop()
  }

  /** Internal: stop and null every handle the director owns. */
  private tearDownLoops(): void {
    this.spaceAmbient?.stop()
    this.spaceAmbient = null
    this.habitatAmbient?.stop()
    this.habitatAmbient = null
    this.engineAmbient?.stop()
    this.engineAmbient = null
    this.shuttleMissionBed?.stop()
    this.shuttleMissionBed = null
    this.anomalyAmbient?.stop()
    this.anomalyAmbient = null
    this.chargeLoop?.stop()
    this.chargeLoop = null
    this.wormholeLoop?.stop()
    this.wormholeLoop = null
    this.fuelWarningLoop?.stop()
    this.fuelWarningLoop = null
    this.radiationLoop?.stop()
    this.radiationLoop = null
    // Belt-and-braces stop on the ambient ids in case Howler still has
    // a stale instance from before our handle was registered (e.g.
    // hot-reload or external `play(..., { loop: true })` call).
    this.audio.stopSound('ambient.space')
    this.audio.stopSound('ambient.habitat')
    this.audio.stopSound('ambient.engine')
    this.audio.stopSound('ambient.shuttleMission')
    this.audio.stopSound('ambient.anomaly')
  }
}

/** Convenience alias for a Howler-backed playback handle slot. */
type AudioHandle = AudioPlaybackHandle | null

/** Clamp a number to `[min, max]` (inclusive). */
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}
