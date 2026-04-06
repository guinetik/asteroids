/**
 * Slingshot launch release rules shared by map-view orbit controls.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-orbit-capture-slingshot-design.md
 */

/** Charge threshold required for a valid slingshot release. */
export const FULL_SLINGSHOT_CHARGE = 1

/**
 * Returns whether the player can release a charged slingshot right now.
 *
 * A launch is only valid at full charge and only when the projected
 * trajectory is not blocked by the captured body.
 *
 * @param chargeLevel - Current slingshot charge in the 0..1 range.
 * @param trajectoryBlocked - True when the current arrow points into a blocked path.
 * @returns True when releasing should trigger the slingshot launch.
 */
export function canReleaseSlingshot(chargeLevel: number, trajectoryBlocked: boolean): boolean {
  return chargeLevel >= FULL_SLINGSHOT_CHARGE && !trajectoryBlocked
}
