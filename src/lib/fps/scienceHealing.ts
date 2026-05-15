/**
 * Shared per-shot multiplier for SCI-bolt repair / heal contexts.
 *
 * The `multitoolScience` upgrade scales mission CR (in `/level`),
 * SCI mode recharge rate (in `buildMultiToolConfig`), and the
 * inverse-damage SCI bolts deal to broken targets. For the **healing
 * equipment** path specifically — satellite servicing, station
 * power-gen repair, future heal-bolt mechanics — we apply *double* the
 * authored upgrade curve so investing in SCI feels dramatic. Stock is
 * already ×2 against breakage; an L3 player tears through a damaged
 * panel ~3.5× faster than stock used to.
 *
 * Kept in one helper so future repair targets pick up the same
 * doubling automatically instead of each call site spelling out the
 * formula.
 *
 * @author guinetik
 * @date 2026-05-15
 * @spec docs/superpowers/specs/2026-04-07-upgrade-system-design.md
 */
import { getCurrentUpgradeValue } from '@/lib/upgrades'

/**
 * Multiplier the authored upgrade curve is scaled by in healing
 * contexts. Exposed so tests and tuning can reason about the doubling
 * directly.
 */
export const SCIENCE_HEALING_DOUBLER = 2

/**
 * Per-shot inverse-damage scale for SCI-bolt repair mechanics. Always
 * `>= 1` so a missing upgrade table can't stall a repair, and always
 * twice the authored upgrade curve so the player feels the doubling.
 *
 * Curve at the current upgrade tuning ([1.0, 1.25, 1.5, 1.75]):
 * - L0: ×2.0
 * - L1: ×2.5
 * - L2: ×3.0
 * - L3: ×3.5
 *
 * @returns Per-shot hit multiplier ready to subtract from the target's
 *   remaining-hit counter.
 */
export function getScienceHealingMultiplier(): number {
  return Math.max(1, SCIENCE_HEALING_DOUBLER * getCurrentUpgradeValue('multitoolScience'))
}
