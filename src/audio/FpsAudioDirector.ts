/**
 * Single owner for all FPS player-movement audio (footsteps, breathing,
 * floating, contact-damage loop, ranged-damage composite).
 *
 * Both {@link views.FpsViewController} (sandbox) and
 * {@link views.LevelViewController} (full game) used to maintain identical
 * loop handles, hold timers, and edge-detection state side-by-side. The
 * sandbox path ended up missing several cues (breathing, floating,
 * footsteps) and the Level path quietly diverged on others, so feedback
 * that worked in one view didn't survive in the other.
 *
 * This director consolidates every player-bound loop and per-event cue
 * tied to the on-foot character into one place. Views push frame state
 * via {@link FpsAudioDirector.update} and fire one-shot notifications via
 * the `notify*` methods; the director owns all Howler handles, hold
 * timers, and rising-edge tracking.
 *
 * Audio explicitly **not** owned here:
 * - Jump cues — already centralised inside {@link FpsPlayerController}
 *   (a single, authoritative call site that both views share).
 * - World ambient (asteroid wind, lander cockpit hum, mission cues like
 *   pickups / explosions) — those are scene/mission-scoped, not player
 *   movement.
 *
 * @author guinetik
 * @date 2026-04-18
 */

import { EvaRcsSound } from './EvaRcsSound'
import { useAudio } from './useAudio'
import { FootstepSystem, MIN_MOVE_SPEED, type FootstepSurface } from '@/lib/fps/footstepSystem'

/** Seconds airborne before the floating ambient loop starts. */
const FLOAT_SOUND_DELAY = 0.5
/** Fade-in duration (ms) for the floating ambient loop. */
const FLOAT_FADE_IN_MS = 600
/** Master SFX gain applied to the procedural hover-RCS bed. */
const FPS_HOVER_RCS_VOLUME = 0.26
/**
 * How long (seconds) the contact-damage loop is held after the most recent
 * melee tick before fading. Sized larger than a typical melee tick interval
 * (~0.2 s) plus a couple of 60 Hz frames of jitter so the loop doesn't
 * flicker between hits when one or many enemies are mauling the player.
 */
const CONTACT_DAMAGE_LOOP_HOLD = 0.4

/** Base volume of the fall-damage thump at zero severity (still audible). */
const FALL_LANDING_VOL_BASE = 0.15
/** Volume range added to the thump as severity climbs to 1. */
const FALL_LANDING_VOL_RANGE = 0.4
/**
 * Base volume of the layered fall-damage grunt. Floored well above zero
 * so the vocal cue is always at least audible when it plays — the
 * sub-threshold filter happens at the host (via the no-damage early
 * return), so any call into {@link FpsAudioDirector.notifyFallDamage}
 * is a fall worth voicing.
 */
const FALL_GRUNT_VOL_BASE = 0.35
/** Volume range added to the grunt as severity climbs to 1. */
const FALL_GRUNT_VOL_RANGE = 0.5

/** Convenience alias for a Howler-backed playback handle. */
type AudioHandle = ReturnType<ReturnType<typeof useAudio>['play']>

/** Per-frame movement state pushed by the host view. */
export interface FpsAudioMovementState {
  /** True if the player body is currently in contact with the ground. */
  grounded: boolean
  /**
   * True if the player controller reports an *engaged* sprint (not just
   * Shift held). Honours the sprint-lockout state so the run-breath loop
   * doesn't chatter on every frame of recovered stamina while the player
   * keeps Shift down through exhaustion.
   */
  sprinting: boolean
  /**
   * Lateral player speed (units/s). Compared against
   * {@link MIN_MOVE_SPEED} to gate footstep playback so standing-still
   * micro-jitter doesn't trigger steps.
   */
  speed: number
  /**
   * True while the player is actively holding hover thrust in mid-air.
   * This is narrower than plain airtime so falling keeps using the
   * quieter floating bed while upward suit jets add the RCS texture.
   */
  hovering: boolean
}

/**
 * Audio orchestrator for the on-foot FPS player. Single-instance per
 * controller; safe to keep alive across pause/resume by toggling
 * {@link FpsAudioDirector.start} / {@link FpsAudioDirector.stop}.
 */
export class FpsAudioDirector {
  private readonly audio = useAudio()
  /**
   * Procedural footstep synth. Owned here (not in the views) so the
   * sandbox and the level both render the same step cadence and timbre
   * without the views having to know which surface preset to construct.
   * Surface can be swapped at runtime via {@link FpsAudioDirector.setSurface}.
   */
  private readonly footsteps: FootstepSystem
  /** Procedural suit-jet bed used while the player hovers on jump thrusters. */
  private readonly hoverRcs = new EvaRcsSound()

  /** Resting breath loop. Active whenever the director is started and the player is not sprinting. */
  private breathingWalk: AudioHandle | null = null
  /** Exertion breath loop. Replaces the walk loop while sprinting. */
  private breathingRun: AudioHandle | null = null
  /** Floating ambient loop. Created after {@link FLOAT_SOUND_DELAY} of continuous airtime. */
  private floating: AudioHandle | null = null
  /** Sustained "being mauled" loop. Refreshed by {@link FpsAudioDirector.notifyContactDamage}. */
  private contactLoop: AudioHandle | null = null

  /** Continuous-airtime accumulator that gates the floating loop start. */
  private floatTimer = 0
  /** Hold-timer that keeps the contact-damage loop alive between melee ticks. */
  private contactHold = 0
  /** Edge-detect state for the breathing walk → run swap. */
  private prevSprinting = false
  /** True between {@link FpsAudioDirector.start} and {@link FpsAudioDirector.stop}. */
  private active = false

  /**
   * @param surface - Initial surface preset for the footstep synth.
   *                  Defaults to `'asteroid'` since both shipping FPS
   *                  surfaces (sandbox + asteroid level) use it; callers
   *                  can swap at runtime via
   *                  {@link FpsAudioDirector.setSurface}.
   */
  constructor(surface: FootstepSurface = 'asteroid') {
    this.footsteps = new FootstepSystem(surface)
  }

  /**
   * Swap the footstep surface preset (e.g. when the player crosses
   * from asteroid regolith into a habitat module). Resets the cadence
   * timer so the next step lands cleanly on the new material's
   * interval.
   */
  setSurface(surface: FootstepSurface): void {
    this.footsteps.setSurface(surface)
  }

  /**
   * Begin FPS audio output. Starts the resting breath loop and resets all
   * edge-detect state so subsequent updates produce clean transitions.
   *
   * Idempotent — repeated calls without an intervening
   * {@link FpsAudioDirector.stop} are no-ops.
   */
  start(): void {
    if (this.active) return
    this.active = true
    this.prevSprinting = false
    this.floatTimer = 0
    this.breathingWalk = this.audio.play('sfx.breathing.walk', { loop: true })
  }

  /**
   * Halt every loop the director currently owns and reset transient
   * state. Safe to call from death handlers, scene transitions, or
   * top-level dispose paths.
   */
  stop(): void {
    if (!this.active) {
      // Defensive: caller may have already tripped stop via a state
      // transition; cleaning up handles that linger from earlier mis-sequenced
      // starts is cheap and keeps the assertion "after stop() nothing
      // sounds" honest.
      this.tearDownLoops()
      return
    }
    this.active = false
    this.tearDownLoops()
  }

  /**
   * Per-frame state update. Drives breathing crossfade, floating onset,
   * and contact-loop decay. Cheap (no allocations); safe to call every
   * frame regardless of whether {@link FpsAudioDirector.start} has run —
   * inactive ticks short-circuit before touching any audio handles.
   *
   * @param dt    - Seconds since the previous tick.
   * @param state - Player movement state for this frame.
   */
  update(dt: number, state: FpsAudioMovementState): void {
    if (!this.active) {
      // Even when inactive, age out the contact-damage hold so a paused
      // session resumes silent rather than spawning a phantom loop.
      this.contactHold = Math.max(0, this.contactHold - dt)
      this.hoverRcs.stop()
      return
    }

    // ── Footsteps ───────────────────────────────────────────────
    // The synth itself debounces and ignores out-of-cadence ticks, so
    // we just hand it the raw movement state every frame.
    this.footsteps.update(
      dt,
      state.speed > MIN_MOVE_SPEED,
      state.grounded,
      state.sprinting,
    )

    // ── Breathing crossfade ─────────────────────────────────────
    if (state.sprinting !== this.prevSprinting) {
      if (state.sprinting) {
        this.breathingWalk?.stop()
        this.breathingWalk = null
        this.breathingRun = this.audio.play('sfx.breathing.run', { loop: true })
      } else {
        this.breathingRun?.stop()
        this.breathingRun = null
        this.breathingWalk = this.audio.play('sfx.breathing.walk', { loop: true })
      }
      this.prevSprinting = state.sprinting
    }

    // ── Floating loop with delayed onset + fade-in ─────────────
    if (!state.grounded) {
      this.floatTimer += dt
      if (this.floatTimer >= FLOAT_SOUND_DELAY && this.floating === null) {
        this.floating = this.audio.play('sfx.floating', {
          loop: true,
          fadeInMs: FLOAT_FADE_IN_MS,
        })
      }
    } else {
      this.floatTimer = 0
      if (this.floating !== null) {
        this.floating.stop()
        this.floating = null
      }
    }

    // ── Hover RCS bed ───────────────────────────────────────────
    if (state.hovering) {
      this.audio.unlock()
      this.hoverRcs.update(
        {
          forward: 0,
          back: 0,
          left: 0,
          right: 0,
          up: 1,
          down: 0,
          sfxVolume: this.audio.getCategoryVolume('sfx') * FPS_HOVER_RCS_VOLUME,
        },
        dt,
      )
    } else {
      this.hoverRcs.stop()
    }

    // ── Contact-damage loop maintenance ─────────────────────────
    if (this.contactLoop !== null) {
      this.contactHold -= dt
      if (this.contactHold <= 0) {
        this.contactLoop.stop()
        this.contactLoop = null
        this.contactHold = 0
      }
    }
  }

  /**
   * Player just took ranged (projectile) damage. Fires the composite
   * cue: per-hit thud + (rate-limited) grunt + (rate-limited) helmet
   * alarm. Cooldowns are enforced at the manifest level via
   * `playback: 'rate-limited'`, so calling this for every projectile
   * hit is safe — dropped requests are silently ignored.
   */
  notifyProjectileDamage(): void {
    this.audio.play('sfx.suit.impact')
    this.audio.play('sfx.grunt.damage')
    this.audio.play('sfx.suit.alarm')
  }

  /**
   * Player is currently being meleed by an enemy. Refreshes the hold
   * timer that keeps the {@link sfx.damage.slash} loop alive; if no
   * loop is active, starts one. Multiple concurrent attackers all bump
   * the same timer and short-circuit on the existing handle, so only
   * one audible loop ever runs.
   */
  notifyContactDamage(): void {
    this.contactHold = CONTACT_DAMAGE_LOOP_HOLD
    if (this.contactLoop === null) {
      this.contactLoop = this.audio.play('sfx.damage.slash', { loop: true })
    }
  }

  /**
   * **On-foot** player just took non-lethal fall damage from impacting
   * the ground at speed (jumping into a crater, dropping off a ledge
   * during EVA). This is the FPS character's body landing — *not* the
   * lander vehicle's touchdown, which is owned by
   * {@link three.LanderController} via `sfx.touchdown` / `sfx.collision`.
   *
   * Plays the composite cue: a thump (`sfx.landing`) layered with a
   * vocal grunt (`sfx.grunt`), both volume-scaled by severity so a
   * graze barely registers and a hard slam thuds.
   *
   * `sfx.grunt` uses `playback: 'restart'` in the manifest, so
   * rapid-fire bad falls cut off the previous sample instead of
   * stacking into a chorus — the director just hands the play
   * request through and the manifest enforces single-instance
   * voicing.
   *
   * The host is expected to filter sub-threshold falls (normal jumps,
   * walking off a curb) before calling — every invocation here
   * produces audible output.
   *
   * @param severity - Normalised fall-damage severity in `[0, 1]`,
   *                   typically `damage / FALL_DAMAGE_MAX` from the
   *                   gameplay-side fall-damage curve. Values outside
   *                   the range are clamped.
   */
  notifyFallDamage(severity: number): void {
    const s = clamp01(severity)
    this.audio.play('sfx.landing', { volume: FALL_LANDING_VOL_BASE + FALL_LANDING_VOL_RANGE * s })
    this.audio.play('sfx.grunt', { volume: FALL_GRUNT_VOL_BASE + FALL_GRUNT_VOL_RANGE * s })
  }

  /**
   * Final cleanup. Equivalent to {@link FpsAudioDirector.stop}; provided
   * for symmetry with other view-owned subsystems that have an explicit
   * dispose path.
   */
  dispose(): void {
    this.stop()
    this.hoverRcs.dispose()
  }

  /** Internal: stop and null every handle, reset hold + edge state. */
  private tearDownLoops(): void {
    this.breathingWalk?.stop()
    this.breathingWalk = null
    this.breathingRun?.stop()
    this.breathingRun = null
    this.floating?.stop()
    this.floating = null
    this.contactLoop?.stop()
    this.contactLoop = null
    this.hoverRcs.stop()
    this.floatTimer = 0
    this.contactHold = 0
    this.prevSprinting = false
    // Clear cadence so the next time we start, the very first step
    // doesn't fire mid-stride against stale timing from the last run.
    this.footsteps.reset()
  }
}

/** Clamp a number into the inclusive `[0, 1]` interval. */
function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}
