/**
 * Drone combat finite-state machine.
 *
 * Gates the controller's combat intent — when the FSM is in `firing`, the
 * controller may pull the trigger (subject to its own per-shot/burst timers,
 * which mirror the turret's structure). The FSM itself does not own burst
 * cadence; that seam is deliberate so the per-shot timing logic stays in the
 * controller, identical to the turret.
 *
 * Pure TS — no Three.js, no Vue. Tested deterministically with synthetic inputs.
 *
 * @author guinetik
 * @date 2026-05-16
 * @spec docs/superpowers/specs/2026-05-16-station-drone-enemy-design.md
 */

import {
  DRONE_ALERT_SECONDS,
  DRONE_COOLING_SECONDS,
  DRONE_DETECT_RANGE,
  DRONE_DETECT_RANGE_HYSTERESIS,
} from './droneConfig'

/**
 * Discrete combat state for a single drone. Transitions are driven by
 * {@link DroneFsm.tick} based on alive-ness, distance to player, and
 * line-of-sight.
 */
export type DroneState = 'patrolling' | 'alerting' | 'firing' | 'cooling' | 'dead'

/**
 * Per-tick output of {@link DroneFsm.tick} consumed by the controller. The
 * controller layers per-shot burst timing on top of `wantsToFire`.
 */
export interface DroneIntent {
  /**
   * True only while the FSM is in `firing`. The controller decides when
   * inside a burst to actually spawn a dart.
   */
  wantsToFire: boolean
  /**
   * True when the drone should yaw toward the player — `alerting`, `firing`,
   * and `cooling` all enable facing so the player gets a consistent visual
   * tell that "this drone has seen you".
   */
  shouldFacePlayer: boolean
  /**
   * True when the drone should display its alert emissive color (red tint)
   * instead of the patrol baseline. Active in `alerting` and `firing`.
   */
  shouldAlertColor: boolean
}

/**
 * Per-tick input to {@link DroneFsm.tick}. Pure data; the controller computes
 * LOS and alive-ness from its own scene knowledge.
 */
export interface DroneFsmInput {
  /** Delta time for this tick, in seconds. */
  dt: number
  /** Current 3D distance from drone to player, in world units. */
  distanceToPlayer: number
  /** Whether the controller's line-of-sight check against the player succeeded. */
  hasLineOfSight: boolean
  /** Whether the drone is still alive. False forces a one-way transition to `dead`. */
  isAlive: boolean
}

/**
 * Drone combat FSM. One instance per drone.
 *
 * State machine:
 * - `patrolling` → `alerting` when alive + LOS + within {@link DRONE_DETECT_RANGE}.
 * - `alerting` → `firing` after {@link DRONE_ALERT_SECONDS} elapsed (still engageable).
 * - `alerting`/`firing` → `cooling` when LOS breaks or distance exceeds
 *   {@link DRONE_DETECT_RANGE_HYSTERESIS}.
 * - `cooling` → `patrolling` after {@link DRONE_COOLING_SECONDS} elapsed AND
 *   player still beyond the hysteresis range.
 * - Any state → `dead` when `!isAlive`. Terminal.
 *
 * @author guinetik
 * @date 2026-05-16
 * @spec docs/superpowers/specs/2026-05-16-station-drone-enemy-design.md
 */
export class DroneFsm {
  /** Current discrete combat state. Public for inspection (e.g. tests, debug HUD). */
  state: DroneState = 'patrolling'

  /** Seconds spent in the current state — drives `alerting` and `cooling` timers. */
  private secondsInState = 0

  /**
   * Advance the FSM by `dt` and return the controller's intent for this tick.
   * Mutates internal state.
   *
   * @param input - Per-tick inputs.
   * @returns Combat intent.
   */
  tick(input: DroneFsmInput): DroneIntent {
    // Death is terminal and overrides any other transition.
    if (!input.isAlive) {
      if (this.state !== 'dead') {
        this.state = 'dead'
        this.secondsInState = 0
      }
      return DEAD_INTENT
    }

    this.secondsInState += input.dt

    const engageable = input.hasLineOfSight && input.distanceToPlayer <= DRONE_DETECT_RANGE
    const lostContact =
      !input.hasLineOfSight || input.distanceToPlayer > DRONE_DETECT_RANGE_HYSTERESIS

    switch (this.state) {
      case 'patrolling': {
        if (engageable) this.transitionTo('alerting')
        break
      }
      case 'alerting': {
        if (lostContact) {
          this.transitionTo('cooling')
        } else if (this.secondsInState >= DRONE_ALERT_SECONDS) {
          this.transitionTo('firing')
        }
        break
      }
      case 'firing': {
        if (lostContact) this.transitionTo('cooling')
        break
      }
      case 'cooling': {
        if (this.secondsInState >= DRONE_COOLING_SECONDS && lostContact) {
          this.transitionTo('patrolling')
        } else if (engageable && this.secondsInState >= DRONE_COOLING_SECONDS) {
          // If the player walked back into range while we were cooling, jump
          // straight back into alerting rather than patrolling for a frame.
          this.transitionTo('alerting')
        }
        break
      }
      case 'dead': {
        return DEAD_INTENT
      }
    }

    return this.intentForState()
  }

  /**
   * Mutate state and zero the in-state timer. Centralized so callers can't
   * forget the timer reset.
   *
   * @param next - State to enter.
   */
  private transitionTo(next: DroneState): void {
    this.state = next
    this.secondsInState = 0
  }

  /**
   * Build the per-tick intent for the current state. Pure function of `state`.
   *
   * @returns Combat intent.
   */
  private intentForState(): DroneIntent {
    const firing = this.state === 'firing'
    const alerting = this.state === 'alerting'
    const cooling = this.state === 'cooling'
    return {
      wantsToFire: firing,
      shouldFacePlayer: alerting || firing || cooling,
      shouldAlertColor: alerting || firing,
    }
  }
}

/** Frozen intent returned in the `dead` state — no inputs respected. */
const DEAD_INTENT: DroneIntent = Object.freeze({
  wantsToFire: false,
  shouldFacePlayer: false,
  shouldAlertColor: false,
})
