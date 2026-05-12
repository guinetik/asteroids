/**
 * Bunker Extract cargo integrity model.
 *
 * The harvested organ wants to stay within the Saturn–Uranus thermal band of
 * the existing solar temperature gradient. Out-of-band, integrity bleeds at a
 * rate that scales with how far past the threshold the ship currently is.
 * Ship Heat/Freeze upgrade levels widen the cargo's tolerated band.
 *
 * In addition to thermal damage, a hard delivery countdown runs from organ
 * dispense. Either reaching zero fails the mission (handled by the runtime
 * consumer, not this module).
 *
 * Pure — no Three.js, no Vue. Plumbed in from the map controller per frame.
 *
 * @author guinetik
 * @date 2026-05-11
 * @spec docs/superpowers/specs/2026-05-11-yamada-mission-pool-design.md
 */
import shipHealthData from '@/data/shuttle/ship-health.json'

/** Baseline safe band inner radius — start of the cold zone (Saturn distance). */
const BASELINE_INNER_SAFE: number = (
  shipHealthData as { coldBoundary: number; coldZone3Boundary: number }
).coldBoundary

/** Baseline safe band outer radius — end of the deep cold zone (Uranus distance). */
const BASELINE_OUTER_SAFE: number = (
  shipHealthData as { coldBoundary: number; coldZone3Boundary: number }
).coldZone3Boundary

/** How far each Heat level above L1 moves the inner safe edge sunward. */
const HEAT_LEVEL_INNER_NARROW_PER_LEVEL = 0.55

/** How far each Freeze level above L1 extends the outer safe edge. */
const FREEZE_LEVEL_OUTER_EXTEND_PER_LEVEL = 3.5

/** Floor on the inner safe radius so it can never reach zero or negative. */
const MIN_INNER_SAFE_RADIUS = 0.1

/** Integrity bled per second per unit of overshoot beyond the band edge. */
const INTEGRITY_BLEED_PER_OVERSHOOT_PER_SECOND = 5.0

/** Maximum cargo integrity (start value). */
const MAX_INTEGRITY = 100

/** Minimum cargo integrity (mission fails when reached). */
const MIN_INTEGRITY = 0

/**
 * Thermal zone classification for cargo.
 * - `safe` — within the tolerated band; no integrity loss.
 * - `hot` — too close to the sun; integrity bleeds.
 * - `cold` — too far from the sun; integrity bleeds.
 */
export type CargoThermalZone = 'safe' | 'hot' | 'cold'

/**
 * Ship upgrade levels that shape the cargo's thermal tolerance band.
 */
export interface CargoUpgradeContext {
  /**
   * `shuttleHeatResistance` upgrade level (1–3).
   * Higher values move the inner safe edge closer to the sun.
   */
  heatLevel: number
  /**
   * `shuttleFreezeResistance` upgrade level (1–3).
   * Higher values extend the outer safe edge further from the sun.
   */
  freezeLevel: number
}

/**
 * A thermal tolerance band in world-space heliocentric radius units.
 * The cargo remains undamaged while the ship's distance is within this band.
 */
export interface CargoThermalBand {
  /**
   * Inner edge (sunward boundary) in heliocentric world units.
   * Smaller values = closer to the sun. Always >= MIN_INNER_SAFE_RADIUS.
   */
  innerSafeRadius: number
  /**
   * Outer edge (deep-space boundary) in heliocentric world units.
   * Always > innerSafeRadius.
   */
  outerSafeRadius: number
}

/**
 * Immutable per-frame cargo integrity state.
 */
export interface CargoState {
  /**
   * Cargo integrity as a percentage (0–100).
   * At 0 the mission is considered failed by the runtime consumer.
   */
  readonly integrity: number
}

/**
 * Input supplied to {@link tickCargo} each frame.
 */
export interface CargoTickInput {
  /**
   * Delta time in seconds. Zero or negative values are no-ops.
   */
  dt: number
  /**
   * Current thermal zone classification for the ship's position.
   */
  zone: CargoThermalZone
  /**
   * World units past the nearest band edge when out-of-band; 0 when safe.
   * Used as the damage scalar — larger overshoot = faster integrity loss.
   */
  overshoot: number
}

/**
 * Compute the safe thermal band for the cargo given the ship's upgrade levels.
 *
 * Each Heat level above L1 brings the inner edge closer to the sun; each
 * Freeze level above L1 pushes the outer edge further out. The inner edge is
 * clamped to {@link MIN_INNER_SAFE_RADIUS} so it never reaches zero.
 *
 * @param ctx - Heat/Freeze upgrade levels.
 * @returns The computed {@link CargoThermalBand}.
 */
export function cargoThermalToleranceBand(ctx: CargoUpgradeContext): CargoThermalBand {
  const heatDelta = Math.max(0, ctx.heatLevel - 1) * HEAT_LEVEL_INNER_NARROW_PER_LEVEL
  const freezeDelta = Math.max(0, ctx.freezeLevel - 1) * FREEZE_LEVEL_OUTER_EXTEND_PER_LEVEL
  return {
    innerSafeRadius: Math.max(MIN_INNER_SAFE_RADIUS, BASELINE_INNER_SAFE - heatDelta),
    outerSafeRadius: BASELINE_OUTER_SAFE + freezeDelta,
  }
}

/**
 * Classify a heliocentric distance into `safe`, `hot`, or `cold`.
 * Band edges are inclusive — exactly at the edge counts as safe.
 *
 * @param sunDistance - Heliocentric world-units distance from the sun.
 * @param band - Current safe band.
 * @returns The {@link CargoThermalZone} for this distance.
 */
export function classifyThermalZone(
  sunDistance: number,
  band: CargoThermalBand,
): CargoThermalZone {
  if (sunDistance < band.innerSafeRadius) return 'hot'
  if (sunDistance > band.outerSafeRadius) return 'cold'
  return 'safe'
}

/**
 * Compute the overshoot — world units past the nearest band edge.
 * Returns 0 when the distance is inside the safe band (inclusive of edges).
 *
 * @param sunDistance - Heliocentric world-units distance from the sun.
 * @param band - Current safe band.
 * @returns Non-negative overshoot value; 0 when in-band.
 */
export function computeOvershoot(sunDistance: number, band: CargoThermalBand): number {
  if (sunDistance < band.innerSafeRadius) return band.innerSafeRadius - sunDistance
  if (sunDistance > band.outerSafeRadius) return sunDistance - band.outerSafeRadius
  return 0
}

/**
 * Create a fresh cargo state at full integrity.
 *
 * @returns A new {@link CargoState} with integrity at {@link MAX_INTEGRITY}.
 */
export function createCargoState(): CargoState {
  return { integrity: MAX_INTEGRITY }
}

/**
 * Advance the cargo state by one tick. Pure — returns a new state object.
 *
 * Integrity bleeds when the ship is outside the thermal band, at a rate of
 * `INTEGRITY_BLEED_PER_OVERSHOOT_PER_SECOND * overshoot * dt`. The zone
 * direction (hot vs. cold) does not affect the rate — only the magnitude of
 * overshoot matters. Integrity is clamped to [{@link MIN_INTEGRITY},
 * {@link MAX_INTEGRITY}].
 *
 * @param state - Previous cargo state.
 * @param input - Tick input for this frame.
 * @returns Updated {@link CargoState}.
 */
export function tickCargo(state: CargoState, input: CargoTickInput): CargoState {
  if (state.integrity <= MIN_INTEGRITY || input.dt <= 0) return state
  if (input.zone === 'safe') return state
  const bleed = INTEGRITY_BLEED_PER_OVERSHOOT_PER_SECOND * input.overshoot * input.dt
  const next = Math.max(MIN_INTEGRITY, state.integrity - bleed)
  return { integrity: next }
}

/**
 * Immutable delivery countdown timer state.
 */
export interface DeliveryTimerState {
  /**
   * Total configured seconds set at dispense time. Never changes after creation.
   */
  readonly total: number
  /**
   * Seconds remaining; clamped to 0. Counts down each tick.
   */
  readonly remaining: number
  /**
   * Latched `true` once `remaining` reaches 0. Never reverts.
   */
  readonly expired: boolean
}

/**
 * Build a fresh delivery timer set to `totalSeconds`.
 *
 * @param totalSeconds - Total countdown duration in seconds (set at dispense).
 * @returns A new {@link DeliveryTimerState} with `remaining === total`.
 */
export function createDeliveryTimer(totalSeconds: number): DeliveryTimerState {
  return { total: totalSeconds, remaining: totalSeconds, expired: false }
}

/**
 * Advance the delivery timer by `dt` seconds. Pure — returns a new state.
 *
 * Zero or negative `dt` is a no-op. Once expired the state is returned
 * unchanged (remaining stays 0, expired stays true).
 *
 * @param state - Previous timer state.
 * @param dt - Delta time in seconds.
 * @returns Updated {@link DeliveryTimerState}.
 */
export function tickDeliveryTimer(state: DeliveryTimerState, dt: number): DeliveryTimerState {
  if (state.expired || dt <= 0) return state
  const remaining = Math.max(0, state.remaining - dt)
  return { total: state.total, remaining, expired: remaining === 0 }
}
