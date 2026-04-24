/**
 * Pure helpers for the map view's ship-health wiring.
 *
 * Kept separate from {@link MapShipHealthFacade} so the config-build and
 * zone-cap math can be unit-tested without mocking a live {@link ShipHealth}
 * instance or the DOM `pagehide` listener.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-thruster-fuel-hud-design.md
 */
import type { ShipHealthConfig } from '@/lib/shipHealth'

/** Temperature ceiling / floor used for thermal cap math (must match shipHealth internals). */
const MAX_TEMP = 100
const MIN_TEMP = -100

/** Temperature value used for full immunity — below the HUD display threshold so the bar stays dark. */
const IMMUNE_CAP = 0

/** Inputs for {@link computeThermalCaps}. */
export interface ThermalCapInput {
  /** Pre-scaled ship health config (distance boundaries are already in world units). */
  config: ShipHealthConfig
  /** Current distance from the Sun in world units. */
  sunDist: number
  /** Player's `shuttleHeatResistance` upgrade level (0..3). */
  heatLevel: number
  /** Player's `shuttleFreezeResistance` upgrade level (0..3). */
  coldLevel: number
}

/** Zone-based thermal protection caps fed into `ShipHealth.tick`. */
export interface ThermalCaps {
  /** Positive temperature clamp (MAX_TEMP = no clamp). */
  heatCap: number
  /** Negative temperature clamp (MIN_TEMP = no clamp). */
  coldCap: number
}

/**
 * Compute zone-based thermal protection caps for the current sun distance.
 *
 * Each thermal upgrade level defines a protection zone keyed to a planet group.
 * Protection has two tiers based on how the player's level compares to the zone:
 *
 * - **Exact match** (`upgradeLevel === zoneLevel`): temperature capped at `protectedTempCap`
 *   (75% bar), hull damage suppressed.
 * - **Over-leveled** (`upgradeLevel > zoneLevel`): full immunity — temperature clamped at 0,
 *   bar invisible, no thermal effect at all.
 * - **Under-leveled** (`upgradeLevel < zoneLevel`): no protection, natural behaviour.
 *
 * Heat zones (inner → outer): Sun proximity (lvl 3) → Mercury (lvl 2) → Venus (lvl 1)
 * Cold zones (closer → farther): Jupiter/Saturn (lvl 2) → Uranus/Neptune/Pluto (lvl 3)
 */
export function computeThermalCaps(input: ThermalCapInput): ThermalCaps {
  const { config: cfg, sunDist, heatLevel, coldLevel } = input
  const partialCap = cfg.protectedTempCap

  let heatZone = 0
  if (sunDist < cfg.hotBoundary) {
    if (sunDist < cfg.heatZone3Boundary) heatZone = 3
    else if (sunDist < cfg.heatZone2Boundary) heatZone = 2
    else heatZone = 1
  }

  let coldZone = 0
  if (sunDist > cfg.coldBoundary) {
    coldZone = sunDist > cfg.coldZone3Boundary ? 3 : 2
  }

  let heatCap = MAX_TEMP
  if (heatZone > 0) {
    if (heatLevel > heatZone) heatCap = IMMUNE_CAP
    else if (heatLevel === heatZone) heatCap = partialCap
  }

  let coldCap = MIN_TEMP
  if (coldZone > 0) {
    if (coldLevel > coldZone) coldCap = -IMMUNE_CAP
    else if (coldLevel === coldZone) coldCap = -partialCap
  }

  return { heatCap, coldCap }
}

/**
 * Construct a world-space ship-health config from raw JSON + runtime scaling.
 *
 * Distance-based boundaries ship in raw catalog units (matching `semiMajorAxis` values
 * in `planetarium.json`); this helper multiplies them by `ORBIT_SCALE` so `shipHealth.ts`
 * always works in world-space. `maxHp` is scaled by the hull upgrade multiplier.
 *
 * @param raw - Raw config from `ship-health.json`.
 * @param hullMultiplier - Current `shuttleHull` upgrade value (1.0..2.0).
 * @param orbitScale - Catalog→world scale factor (`ORBIT_SCALE`).
 * @returns Fully scaled config ready to hand to the {@link ShipHealth} constructor.
 */
export function buildShipHealthConfig(
  raw: ShipHealthConfig,
  hullMultiplier: number,
  orbitScale: number,
): ShipHealthConfig {
  return {
    ...raw,
    maxHp: raw.maxHp * hullMultiplier,
    hotBoundary: raw.hotBoundary * orbitScale,
    heatZone2Boundary: raw.heatZone2Boundary * orbitScale,
    heatZone3Boundary: raw.heatZone3Boundary * orbitScale,
    coldBoundary: raw.coldBoundary * orbitScale,
    coldZone3Boundary: raw.coldZone3Boundary * orbitScale,
    radiationZone1Boundary: raw.radiationZone1Boundary * orbitScale,
    radiationZone2Boundary: raw.radiationZone2Boundary * orbitScale,
    radiationZone3Boundary: raw.radiationZone3Boundary * orbitScale,
  }
}

/**
 * Clamp a saved HP value to the valid range for a freshly-built config.
 *
 * - `undefined` (no save) → full HP.
 * - `<= 0` (old corrupt save) → full HP. Respawn path writes 0 intentionally, but the
 *   respawn flow bumps HP to `maxHp` before this runs, so a 0-save here means a legacy
 *   bug that we heal on load.
 * - Any positive value → clamped to `maxHp`.
 */
export function clampInitialHullHp(
  savedHp: number | undefined,
  maxHp: number,
): number {
  if (savedHp === undefined) return maxHp
  if (savedHp <= 0) return maxHp
  return Math.min(savedHp, maxHp)
}
