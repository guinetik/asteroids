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
 * biggest rocks now take ~4× the hits of the smallest ones to break.
 */
export const MINERAL_KG_PER_DIAMETER_UNIT = 14

/** Lower clamp on rock yield. Smallest pebbles still drop a usable nugget. */
export const MIN_ROCK_YIELD_KG = 6

/**
 * Upper clamp on rock yield. Massive boulders cap out so a single
 * rock can't trivialise an entire quota, but the cap is high enough
 * that a 24m boulder takes roughly 40 drill bolts to break.
 */
export const MAX_ROCK_YIELD_KG = 240

/** Kilograms removed by a single drill bolt impact. */
export const BOLT_DAMAGE_KG_PER_HIT = 6
