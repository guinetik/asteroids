/**
 * Shared chase-target selection for FPS enemy behaviors.
 *
 * Picks the nearest XZ candidate among the player and optional hostage sites
 * so melee and ranged enemies can aggro rescue targets as well as the player.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/asteroid-lander-gdd.md
 */

/** World position used as a chase / aim target. */
export interface ChaseTargetSite {
  /** World X (meters). */
  x: number
  /** World Y (meters) — used for projectile aim height. */
  y: number
  /** World Z (meters). */
  z: number
}

/**
 * Squared horizontal distance between two XZ points.
 *
 * @param ax - First point X
 * @param az - First point Z
 * @param bx - Second point X
 * @param bz - Second point Z
 */
export function distSqXZ(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx
  const dz = az - bz
  return dx * dx + dz * dz
}

/**
 * Choose the nearest site on the XZ plane: player or any hostage.
 *
 * @param fromX - Enemy X
 * @param fromZ - Enemy Z
 * @param playerX - Player X
 * @param playerY - Player Y (carried through to result)
 * @param playerZ - Player Z
 * @param hostages - Additional sites (alive hostages only); may be empty
 */
export function pickNearestChaseSiteXZ(
  fromX: number,
  fromZ: number,
  playerX: number,
  playerY: number,
  playerZ: number,
  hostages: ReadonlyArray<ChaseTargetSite>,
): ChaseTargetSite {
  let bestX = playerX
  let bestY = playerY
  let bestZ = playerZ
  let bestD = distSqXZ(fromX, fromZ, playerX, playerZ)
  for (const h of hostages) {
    const d = distSqXZ(fromX, fromZ, h.x, h.z)
    if (d < bestD) {
      bestD = d
      bestX = h.x
      bestY = h.y
      bestZ = h.z
    }
  }
  return { x: bestX, y: bestY, z: bestZ }
}
