/**
 * Compass bearing math for the FPS compass HUD.
 *
 * Converts Three.js Y-rotation (radians, CCW) to compass degrees
 * (0 = north, CW) and computes relative bearings between positions.
 *
 * Coordinate system: XZ ground plane, Y up.
 * Three.js: heading 0 = facing +Z, increases CCW.
 * Compass: 0 = north (+Z), 90 = east (+X), increases CW.
 *
 * @author guinetik
 * @date 2026-04-07
 * @spec docs/superpowers/specs/2026-04-07-objective-waypoints-design.md
 */

/**
 * Normalize degrees to [0, 360).
 *
 * @param d - Degrees (any range).
 * @returns Normalized degrees in [0, 360).
 */
export function normalizeCompassDeg(d: number): number {
  return ((d % 360) + 360) % 360
}

/**
 * Convert a Three.js Y-rotation (radians) to compass degrees.
 * Three.js: 0 = +Z forward, increases CCW.
 * Compass: 0 = north (+Z), increases CW.
 *
 * @param headingRad - Y-axis rotation in radians.
 * @returns Compass degrees [0, 360).
 */
export function headingRadToCompassDeg(headingRad: number): number {
  return normalizeCompassDeg((-headingRad * 180) / Math.PI)
}

/**
 * Absolute compass bearing from one XZ position to another.
 *
 * @param fromX - Origin X.
 * @param fromZ - Origin Z.
 * @param toX - Target X.
 * @param toZ - Target Z.
 * @returns Compass degrees [0, 360) from origin to target.
 */
export function worldBearingDegTo(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
): number {
  const dx = toX - fromX
  const dz = toZ - fromZ
  const rad = Math.atan2(-dx, dz)
  return normalizeCompassDeg((-rad * 180) / Math.PI)
}

/**
 * Signed relative bearing from a compass heading to an absolute bearing.
 * Returns the shortest turn angle: negative = left, positive = right.
 *
 * @param fromDeg - Current compass heading in degrees.
 * @param toDeg - Target compass bearing in degrees.
 * @returns Signed degrees in (-180, 180].
 */
export function signedRelativeBearingDeg(fromDeg: number, toDeg: number): number {
  const a = normalizeCompassDeg(fromDeg)
  const b = normalizeCompassDeg(toDeg)
  let d = b - a
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return d
}
