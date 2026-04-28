/**
 * Shared telemetry contracts for the FPS HUD.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */

import type { ObjectiveType } from '@/lib/missions/types'

/**
 * Objective marker shown on the compass strip.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export interface CompassObjective {
  /** Stable objective id, for example `obj-collect-1`. */
  id: string
  /** Short uppercase label, for example `GATHER` or `SURVEY`. */
  label: string
  /** Bearing delta from the player's heading in degrees, constrained to `[-180, 180]`. */
  relativeDeg: number
  /** Objective category used to color the compass marker. */
  type: ObjectiveType
}

/**
 * Drill-target readout for the currently-aimed surface rock.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export interface RockTargetInfo {
  /** Human-readable mineral label, for example `Olivine`. */
  label: string
  /** Remaining drillable mass in kilograms, for example `12.4`. */
  remainingKg: number
  /** Original total rock mass in kilograms, for example `30`. */
  totalKg: number
}

/**
 * Live FPS player telemetry consumed by the HUD.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export interface FpsTelemetry {
  /** Current player HP, for example `85`. */
  hp: number
  /** Maximum player HP, for example `100`. */
  maxHp: number
  /** Current oxygen remaining, for example `63`. */
  o2Level: number
  /** Maximum oxygen capacity, for example `100`. */
  o2Capacity: number
  /** Current sprint/stamina charge, for example `22`. */
  sprintCharge: number
  /** Maximum sprint/stamina capacity, for example `50`. */
  sprintCapacity: number
  /** Current lateral speed in world units per second, for example `7.3`. */
  speed: number
  /** Whether the player is grounded this frame. */
  grounded: boolean
  /** Current multi-tool mode selected by the player. */
  activeMode: 'drill' | 'weapon' | 'science'
  /** Whether the player is aiming down sights / focused aim. */
  aiming: boolean
  /** Whether the active tool fired this frame. */
  isFiring: boolean
  /** Current RTG fuel reserve, for example `180`. */
  rtgLevel: number
  /** Maximum RTG fuel reserve, for example `240`. */
  rtgCapacity: number
  /** Current charge for the active tool mode, for example `9`. */
  modeCharge: number
  /** Maximum charge for the active tool mode, for example `20`. */
  modeCapacity: number
  /** Camera heading in radians, typically in the `[-pi, pi]` range. */
  headingRad: number
  /** Compass objectives currently visible to the player. */
  objectives: CompassObjective[]
  /** Optional targeted-rock readout, or `null` when not aiming at a drillable rock. */
  rockTarget?: RockTargetInfo | null
}
