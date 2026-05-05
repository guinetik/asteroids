/**
 * Presentation rows for shuttle hull-adjacent debuffs.
 *
 * @author guinetik
 * @date 2026-05-04
 * @spec docs/superpowers/specs/2026-05-04-active-missions-tracker-design.md
 */
import type { GravityWarningState, RadiationWarningState } from '@/lib/ShuttleTelemetry'

/** Gravity proximity where hull-debuff copy escalates from pull to warning. */
const GRAVITY_DANGER_THRESHOLD = 0.3

/** Gravity proximity where hull-debuff copy escalates from warning to critical. */
const GRAVITY_CRITICAL_THRESHOLD = 0.7

/** Visual tone for a hull debuff row. */
export type ShuttleHullDebuffTone = 'radiation' | 'gravity' | 'heat' | 'freeze'

/** A compact debuff row shown above the shuttle hull HP gauge. */
export interface ShuttleHullDebuff {
  /** Stable key for Vue list rendering; examples: `radiation`, `heat`, `freeze`. */
  id: ShuttleHullDebuffTone
  /** Player-facing compact label; examples: `HEAT 87°`, `RADIATION DANGER - HULL EXPOSED`. */
  label: string
  /** Color/animation treatment for the row. */
  tone: ShuttleHullDebuffTone
}

/** Inputs used to derive the current hull-adjacent debuff rows. */
export interface BuildShuttleHullDebuffsInput {
  /** Current signed thermal stress, usually -100..100. Positive is heat, negative is freeze. */
  temperature: number
  /** True when the thermal meter is visible and the thermal value should be surfaced as a debuff. */
  temperatureVisible: boolean
  /** Latest radiation zone state, or undefined before the map health facade has emitted. */
  radiation?: RadiationWarningState
  /** Latest gravity proximity state, or undefined before the map controller has emitted. */
  gravity?: GravityWarningState
}

/**
 * Build compact debuff labels for the hull dock.
 *
 * @param input - Current radiation and thermal HUD state.
 * @returns Ordered debuffs, with radiation first because it directly explains hull HP loss.
 */
export function buildShuttleHullDebuffs(
  input: BuildShuttleHullDebuffsInput,
): ShuttleHullDebuff[] {
  const debuffs: ShuttleHullDebuff[] = []

  if (input.radiation?.visible) {
    debuffs.push({
      id: 'radiation',
      label: `RAD ${radiationTierLabel(input.radiation)} - ${radiationStatusLabel(input.radiation)}`,
      tone: 'radiation',
    })
  }

  if (input.gravity?.visible && input.gravity.bodyName) {
    debuffs.push({
      id: 'gravity',
      label: `${gravityTierLabel(input.gravity)} - ${input.gravity.bodyName}`,
      tone: 'gravity',
    })
  }

  if (!input.temperatureVisible || input.temperature === 0) return debuffs

  const temperature = Math.abs(input.temperature).toFixed(0)
  if (input.temperature > 0) {
    debuffs.push({ id: 'heat', label: `HEAT ${temperature}°`, tone: 'heat' })
  } else {
    debuffs.push({ id: 'freeze', label: `FREEZE ${temperature}°`, tone: 'freeze' })
  }

  return debuffs
}

/** Resolve the compact radiation tier label used in the hull debuff stack. */
function radiationTierLabel(warning: RadiationWarningState): string {
  if (warning.zone >= 3) return 'CRIT'
  if (warning.zone >= 2) return 'DANGER'
  return 'WARN'
}

/** Resolve whether radiation is damaging hull HP or currently shielded. */
function radiationStatusLabel(warning: RadiationWarningState): string {
  return warning.damageActive ? 'EXPOSED' : 'SHIELDED'
}

/** Resolve the compact gravity tier label used in the hull debuff stack. */
function gravityTierLabel(warning: GravityWarningState): string {
  if (warning.proximity >= GRAVITY_CRITICAL_THRESHOLD) return 'GRAV CRIT'
  if (warning.proximity >= GRAVITY_DANGER_THRESHOLD) return 'GRAV WARN'
  return 'GRAV PULL'
}
