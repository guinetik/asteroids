/**
 * Runtime trigger predicates for level visor tips.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
import type { FpsTelemetry } from '@/lib/ui/fpsHudTypes'
import type { LanderTelemetry, LandingWarningLevel } from '@/lib/ui/landerHudTypes'

/** Fraction below which oxygen guidance should be shown. */
export const LEVEL_TIP_LOW_OXYGEN_RATIO = 0.5

/** Fraction below which RTG guidance should be shown. */
export const LEVEL_TIP_LOW_RTG_RATIO = 0.5

/** Seconds in gather FPS before suggesting the delivery-rocket SCI tracker. */
export const LEVEL_TIP_GATHER_IDLE_SECONDS = 25

/** Player speed above which the drill stance interlock tip can trigger. */
export const LEVEL_TIP_DRILL_WALKING_SPEED = 0.35

/**
 * Check whether a resource has dropped below the provided fraction.
 *
 * @param level - Current resource level.
 * @param capacity - Maximum resource capacity.
 * @param threshold - Fraction threshold in `[0, 1]`.
 * @returns True when capacity is positive and level/capacity is below the threshold.
 */
export function isResourceBelowRatio(
  level: number,
  capacity: number,
  threshold: number,
): boolean {
  return capacity > 0 && level / capacity < threshold
}

/**
 * Check if oxygen has fallen into the low-resource teaching band.
 *
 * @param telemetry - Current FPS telemetry.
 * @returns True when O2 is below half.
 */
export function shouldTriggerLowOxygenTip(telemetry: FpsTelemetry): boolean {
  return isResourceBelowRatio(
    telemetry.o2Level,
    telemetry.o2Capacity,
    LEVEL_TIP_LOW_OXYGEN_RATIO,
  )
}

/**
 * Check if RTG reserve has fallen into the low-resource teaching band.
 *
 * @param telemetry - Current FPS telemetry.
 * @returns True when RTG is below half.
 */
export function shouldTriggerLowRtgTip(telemetry: FpsTelemetry): boolean {
  return isResourceBelowRatio(telemetry.rtgLevel, telemetry.rtgCapacity, LEVEL_TIP_LOW_RTG_RATIO)
}

/**
 * Check if the player is trying to mine while moving enough for stance guidance.
 *
 * @param telemetry - Current FPS telemetry.
 * @returns True when the drill is selected and player movement is non-trivial.
 */
export function shouldTriggerDrillWalkingTip(telemetry: FpsTelemetry): boolean {
  return telemetry.activeMode === 'drill' && telemetry.speed > LEVEL_TIP_DRILL_WALKING_SPEED
}

/**
 * Check if the lander hull has newly lost health.
 *
 * @param previousHp - Previous hull HP, or `null` before the first sample.
 * @param telemetry - Current lander telemetry.
 * @returns True when hull HP decreased and is below max.
 */
export function shouldTriggerLanderHullRepairTip(
  previousHp: number | null,
  telemetry: LanderTelemetry,
): boolean {
  return previousHp !== null && telemetry.hp < previousHp && telemetry.hp < telemetry.maxHp
}

/**
 * Check if a landing warning has entered an advisory band.
 *
 * @param warning - Current landing warning severity.
 * @returns True when the warning is either cautionary or dangerous.
 */
export function shouldTriggerLanderWarningTip(warning: LandingWarningLevel): boolean {
  return warning !== 'safe'
}

/**
 * Check if a gather mission has been idle long enough to suggest rocket SCI tracking.
 *
 * @param elapsedSeconds - Seconds spent in eligible FPS gather play.
 * @param hasMinedRock - Whether a mineral pickup from rock mining has happened.
 * @returns True when enough time passed with no mined rock.
 */
export function shouldTriggerGatherRocketScienceTip(
  elapsedSeconds: number,
  hasMinedRock: boolean,
): boolean {
  return !hasMinedRock && elapsedSeconds >= LEVEL_TIP_GATHER_IDLE_SECONDS
}
