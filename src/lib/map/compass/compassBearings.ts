/**
 * Pure helpers for building map compass bearings from ship + camera state.
 *
 * Bearings are computed relative to the camera's XZ look direction so the
 * compass strip matches what the player sees on screen regardless of the
 * OrbitControls orbit angle.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-05-map-shuttle-player-design.md
 */
import type { CompassBearing } from '@/lib/ShuttleTelemetry'

/** Short compass label lookup keyed by solar-body id (sun + every planet in the catalog). */
export const COMPASS_LABELS: Record<string, string> = {
  sun: 'Sol',
  mercury: 'Me',
  venus: 'Ve',
  earth: 'Ea',
  mars: 'Ma',
  ceres: 'Ce',
  jupiter: 'Ju',
  saturn: 'Sa',
  uranus: 'Ur',
  neptune: 'Ne',
  pluto: 'Pl',
}

/** One compass target (Sun or planet) expressed in XZ world units. */
export interface CompassTargetInput {
  /** Short compass label; two-letter convention, pulled from {@link COMPASS_LABELS} where possible. */
  label: string
  /** CSS color string used by the HUD tick (`accentColor` for planets, warm yellow for the sun). */
  color: string
  /** Target world-space X. */
  x: number
  /** Target world-space Z. */
  z: number
}

/** Input bundle for {@link computeCompassBearings}. */
export interface CompassBearingsInput {
  /** Ship world-space X. */
  shipX: number
  /** Ship world-space Z. */
  shipZ: number
  /** Camera world-space X (used to derive the look direction on the XZ plane). */
  cameraX: number
  /** Camera world-space Z. */
  cameraZ: number
  /** OrbitControls target X; the camera "look at" point. */
  targetX: number
  /** OrbitControls target Z. */
  targetZ: number
  /** Targets to project into the compass strip (Sun first, then planets). */
  targets: CompassTargetInput[]
}

/** Camera look direction must have at least this XZ magnitude for bearings to be valid. */
const MIN_LOOK_XZ = 0.0001

/**
 * Project a list of compass targets into bearings relative to the camera view direction.
 *
 * - The camera's (target - position) vector is projected onto the XZ plane to form the
 *   local forward axis; the right axis is forward rotated 90° clockwise.
 * - `atan2(right·dir, forward·dir)` produces a signed angle: 0 = dead-ahead, positive = right.
 * - Returns an empty array when the camera is looking straight up or down (`<MIN_LOOK_XZ`).
 *
 * @param input - Ship + camera + target bundle, see {@link CompassBearingsInput}.
 * @returns One {@link CompassBearing} per target, in the same order as `input.targets`.
 */
export function computeCompassBearings(input: CompassBearingsInput): CompassBearing[] {
  const lookX = input.targetX - input.cameraX
  const lookZ = input.targetZ - input.cameraZ
  const lookLen = Math.hypot(lookX, lookZ)
  if (lookLen < MIN_LOOK_XZ) return []

  const fwdX = lookX / lookLen
  const fwdZ = lookZ / lookLen
  // Right vector is forward rotated 90° clockwise in XZ.
  const rightX = -fwdZ
  const rightZ = fwdX

  const bearings: CompassBearing[] = []
  for (const target of input.targets) {
    const dx = target.x - input.shipX
    const dz = target.z - input.shipZ
    const fwd = dx * fwdX + dz * fwdZ
    const rgt = dx * rightX + dz * rightZ
    bearings.push({
      label: target.label,
      bearingRad: Math.atan2(rgt, fwd),
      color: target.color,
    })
  }
  return bearings
}
