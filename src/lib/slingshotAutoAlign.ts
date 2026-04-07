/**
 * Helpers for aligning the shuttle nose with slingshot travel direction.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-orbit-capture-slingshot-design.md
 */

const MIN_PLANAR_SPEED_EPSILON = 0.0001

/**
 * Convert planar velocity into the shuttle yaw that points the nose along travel.
 *
 * @param vx - Planar X velocity.
 * @param vz - Planar Z velocity.
 * @returns Target yaw in radians, or `null` if speed is effectively zero.
 */
export function getVelocityHeading(vx: number, vz: number): number | null {
  if (vx * vx + vz * vz <= MIN_PLANAR_SPEED_EPSILON * MIN_PLANAR_SPEED_EPSILON) {
    return null
  }
  return Math.atan2(-vz, vx)
}

/**
 * Normalize an angle into the range (-π, π].
 *
 * @param a - Angle in radians.
 * @returns Equivalent angle in (-π, π].
 */
function wrapAngle(a: number): number {
  a = a % (2 * Math.PI)
  if (a > Math.PI) a -= 2 * Math.PI
  if (a <= -Math.PI) a += 2 * Math.PI
  return a
}

/**
 * Resolve slingshot auto-align yaw for the current frame.
 * Interpolates along the shortest rotational path to avoid flipping
 * when the target crosses the ±π boundary.
 *
 * @param currentYaw - Current shuttle yaw.
 * @param targetYaw - Current target yaw from travel direction.
 * @param dt - Current frame time.
 * @param remainingTime - Remaining slingshot lock time.
 * @returns Yaw for this frame.
 */
export function getSlingshotAutoAlignYaw(
  currentYaw: number,
  targetYaw: number,
  dt: number,
  remainingTime: number,
): number {
  if (remainingTime <= 0) return targetYaw
  const diff = wrapAngle(targetYaw - currentYaw)
  const t = Math.min(1, dt / remainingTime)
  return wrapAngle(currentYaw + diff * t)
}
