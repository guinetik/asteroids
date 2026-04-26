/**
 * Mining gameplay constants.
 *
 * Centralized tuning values for the universal rock-mining loop. Kept in
 * its own module so tests and tuning passes can import without dragging
 * the full {@link RockYieldSystem} graph.
 *
 * @author guinetik
 * @date 2026-04-18
 * @spec docs/superpowers/specs/2026-04-18-gather-mission-design.md
 */

/**
 * Kilograms of mineral packed per asteroid-meter of rock diameter.
 *
 * Bumped 2026-04-18 (8 → 14) so visibly larger boulders read as
 * tougher targets — combined with `MAX_ROCK_YIELD_KG` below the
 * biggest rocks now take ~5× the hits of the smallest ones to break.
 */
export const MINERAL_KG_PER_DIAMETER_UNIT = 14

/** Lower clamp on rock yield. Smallest pebbles still drop a usable nugget. */
export const MIN_ROCK_YIELD_KG = 6

/**
 * Upper clamp on rock yield. Massive boulders cap out so a single
 * rock can't trivialise an entire quota, but the cap is high enough
 * that a 24m boulder takes roughly 60 drill bolts to break.
 */
export const MAX_ROCK_YIELD_KG = 240

/** Kilograms removed by a single drill bolt impact. */
export const BOLT_DAMAGE_KG_PER_HIT = 4

/** Fraction of total kg used to derive a rock's science HP (prospecting). */
export const SCIENCE_HP_RATIO = 0.1

/** Lower clamp on the bonus grant kg from a depleted prospected rock. */
export const MIN_PROSPECT_BONUS_KG = 2

/** Bonus grant kg = max(MIN_PROSPECT_BONUS_KG, ceil(totalKg * PROSPECT_BONUS_RATIO)). */
export const PROSPECT_BONUS_RATIO = 0.1

/** Probability that a depleted prospected rock fires a second composition-weighted grant. */
export const PROSPECT_SECOND_ROLL_CHANCE = 0.25

/** Salt for the trigger draw that decides whether the second roll fires. */
export const PROSPECT_TRIGGER_SALT = 0x9e3779b9

/** Salt for the bonus item-id draw, distinct from PROSPECT_TRIGGER_SALT so the two are uncorrelated. */
export const PROSPECT_ITEM_SALT = 0x85ebca77
