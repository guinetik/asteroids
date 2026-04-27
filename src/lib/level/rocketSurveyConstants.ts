/**
 * Tunables for the SCI-gun rocket-survey hidden utility.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-26-rocket-survey-design.md
 */

/** Total survey HP for one scan cycle, in damage-equivalent units. */
export const ROCKET_SURVEY_HP = 32

/** Damage applied per science bolt hit on the rocket. ~8 hits per reveal. */
export const ROCKET_SURVEY_DAMAGE_PER_HIT = 4

/** Survey marker beam color (science green). */
export const ROCKET_SURVEY_MARKER_COLOR = 0x22c55e

/** Per-hit rocket flash decay duration in seconds. */
export const ROCKET_SURVEY_FLASH_HIT_DURATION = 0.25

/** Reveal moment flash decay duration in seconds. */
export const ROCKET_SURVEY_FLASH_REVEAL_DURATION = 0.6

/** Survey toast text. RP-flavored, no mineral name. */
export const ROCKET_SURVEY_TOAST_LABEL = 'DEPOSIT SIGNATURE LOCATED'

/** Survey toast lifetime in seconds before it auto-dismisses. */
export const ROCKET_SURVEY_TOAST_LIFETIME_SEC = 5.0
