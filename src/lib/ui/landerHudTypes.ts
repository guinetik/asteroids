/**
 * Shared telemetry contracts for the lander HUD.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */

/**
 * Severity band for landing readouts.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export type LandingWarningLevel = 'safe' | 'warn' | 'danger'

/**
 * Live lander telemetry consumed by the cockpit HUD.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export interface LanderTelemetry {
  /** Altitude above surface in world units, for example `42.7`. */
  altitude: number
  /** Vertical velocity in world units per second, for example `-8.5`. */
  velocityY: number
  /** World X position, for example `120`. */
  posX: number
  /** World Z position, for example `-340`. */
  posZ: number
  /** Remaining shared fuel in the tank, for example `380`. */
  fuelLevel: number
  /** Maximum shared fuel capacity, for example `500`. */
  fuelCapacity: number
  /** Current main-engine thruster charge, for example `12`. */
  mainEngineCharge: number
  /** Maximum main-engine thruster charge, for example `20`. */
  mainEngineCapacity: number
  /** Current RCS thruster charge, for example `6`. */
  rcsCharge: number
  /** Maximum RCS thruster charge, for example `10`. */
  rcsCapacity: number
  /** Current hull HP, for example `74`. */
  hp: number
  /** Maximum hull HP, for example `100`. */
  maxHp: number
  /** Current tilt angle in degrees, for example `18`. */
  tiltAngle: number
  /** Whether the lander is currently grounded. */
  grounded: boolean
  /** Vertical-speed warning state derived from the current descent profile. */
  descentWarning: LandingWarningLevel
  /** Attitude warning state derived from the current tilt. */
  attitudeWarning: LandingWarningLevel
  /** Combined landing safety summary shown to the pilot. */
  landingSafety: LandingWarningLevel
  /** Remaining survey timer in seconds, or `null` when no survey objective is active. */
  surveyTimeRemaining: number | null
  /** Number of collected probes, or `null` when no survey objective is active. */
  surveyProbesCollected: number | null
  /** Total probes required, or `null` when no survey objective is active. */
  surveyProbesTotal: number | null
  /** Label for the active minigame progress denominator, for example `PROBES` or `SCAN`. */
  minigameProgressLabel: string | null
  /** Short active mission instruction, for example `ALIGN WITH TARGET MARKER`. */
  missionInstruction: string | null
}
