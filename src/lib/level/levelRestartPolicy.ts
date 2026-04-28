/**
 * Restart policy for level death overlays.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */

/** Failure cause fragment emitted when all rescue hostages are lost. */
const RESCUE_FAIL_CAUSE_FRAGMENT = 'survivors lost'

/** Failure cause fragment emitted when the bunker operator dies inside the interior. */
const BUNKER_FAIL_CAUSE_FRAGMENT = 'operator kia'

/**
 * Whether a level death-overlay restart should hard-refresh the page.
 *
 * Some objective failures leave stateful scene/controller graphs that are not
 * safe to rebuild in place. Those cases use a page refresh so the next run
 * starts from a clean level boot.
 *
 * @param cause - Death/failure cause shown by the overlay.
 * @returns True when the restart button should call `window.location.reload()`.
 */
export function shouldHardReloadLevelRestart(cause: string): boolean {
  const normalized = cause.toLowerCase()
  return (
    normalized.includes(RESCUE_FAIL_CAUSE_FRAGMENT) ||
    normalized.includes(BUNKER_FAIL_CAUSE_FRAGMENT)
  )
}
