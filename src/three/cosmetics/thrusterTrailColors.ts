/**
 * Resolve cosmetic thruster-trail catalog rows into runtime particle colors.
 *
 * Each `shuttle-thruster-trail` and `lander-thruster-trail` cosmetic carries a
 * three-stop gradient that drives the shop swatch. In-game, the additive
 * particle emitters are single-color, so the gradient is collapsed back into
 * two named slots:
 *
 *   - `core`  → `gradientStops[1]` (themed midtone — the *named* color of the
 *               trail). Used by every plume the player thinks of as "the
 *               cosmetic color": main thrust, lander main flame, RCS quads,
 *               wingtip RCS puffs, idle nozzle glow sprites.
 *   - `wake`  → `gradientStops[2]` (deepest stop — falloff / retro). Only the
 *               shuttle's inertial-dampener brake emitter uses this so the
 *               counter-thrust beat reads visually distinct from forward
 *               thrust.
 *
 * RCS specifically uses `core` (not the lightest stop) because the SKU names
 * — "Cyan RCS", "Magenta RCS", "Amber RCS" — refer to the *midtone*. Sampling
 * `gradientStops[0]` ("ecfeff", "ffe4e6", "fffbeb", …) bleached the puffs back
 * to nearly white and made the cosmetic feel unapplied. The smoky puff
 * quality is a property of the soft radial particle texture + spread +
 * sizeGrowth, not the color, so swapping in the themed midtone preserves the
 * cold-gas look while actually reading as cyan / magenta / amber.
 *
 * Falling back through the chain `[1] → [0] → [2] → '#ffffff'` keeps two-stop
 * pennant-style gradients (e.g. flag rows) working even though they are never
 * actually selected for the trail categories.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-pimp-my-shuttle-thruster-trails.md
 */

import * as THREE from 'three'
import { findCosmeticOptionById } from '@/lib/cosmetics/catalog'
import type { CosmeticCategory } from '@/lib/cosmetics/types'

/**
 * Per-emitter colors derived from one trail catalog row. Each `THREE.Color`
 * is a fresh instance; callers can safely mutate / copy without touching the
 * shared catalog.
 */
export interface ThrusterTrailColors {
  /**
   * Themed midtone (`gradientStops[1]`). Drives every emitter the cosmetic
   * is "named after" — main thrust, lander flame, RCS quads, wingtip RCS,
   * and idle / nozzle-glow sprite tints.
   */
  readonly core: THREE.Color
  /**
   * Deepest stop (`gradientStops[2]`). Drives the shuttle's inertial-dampener
   * brake plume so the retro beat reads cooler than forward thrust. Lander
   * has no separate brake emitter so this slot is unused on lander wiring.
   */
  readonly wake: THREE.Color
}

/** Last-resort default when a catalog row is missing every stop. */
const TRAIL_FALLBACK_HEX = '#ffffff'

/**
 * Read the gradient stops of a trail catalog row and translate them into the
 * named slots above. Unknown ids and category mismatches return `null` so
 * callers can no-op cleanly.
 *
 * @param optionId - Catalog row id from `pimp-my-shuttle.json`.
 * @param expectedCategory - Category the caller wants to enforce (e.g. `'shuttle-thruster-trail'`).
 */
export function resolveThrusterTrailColors(
  optionId: string,
  expectedCategory: CosmeticCategory,
): ThrusterTrailColors | null {
  const option = findCosmeticOptionById(optionId)
  if (!option || option.category !== expectedCategory) return null
  const stops = option.gradientStops
  const stop1 = stops[1] ?? stops[0] ?? stops[2] ?? TRAIL_FALLBACK_HEX
  const stop2 = stops[2] ?? stops[1] ?? stops[0] ?? TRAIL_FALLBACK_HEX
  return {
    core: new THREE.Color(stop1),
    wake: new THREE.Color(stop2),
  }
}
