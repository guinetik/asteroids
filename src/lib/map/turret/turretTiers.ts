/**
 * Asteroid tier classification by radius for map-turret mining.
 *
 * Tiers are size-derived; each tier owns an HP budget and a lootId
 * pointing into {@link ASTEROID_BELT_LOOT}.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-turret-mode-design.md
 */
import { ASTEROID_BELT_LOOT, TURRET_TIER_CONFIG } from './turretConstants'
import type { MineralEntry } from '@/lib/asteroids/types'

/** Discrete asteroid size/yield tier. */
export type TurretTierId = 'small' | 'medium' | 'large'

/** Classified tier entry — what {@link pickTier} returns. */
export interface TurretTier {
  /** Tier identifier. */
  readonly id: TurretTierId
  /** Upper-bound radius (exclusive) for this tier. */
  readonly radiusMax: number
  /** HP in kg — total damage needed to deplete. */
  readonly hpKg: number
  /** Loot table id (key into {@link ASTEROID_BELT_LOOT}). */
  readonly lootId: string
  /** Resolved loot composition entries. */
  readonly composition: readonly MineralEntry[]
}

/** All tiers resolved with their loot composition. */
export const TURRET_TIERS: Record<TurretTierId, TurretTier> = {
  small: {
    id: 'small',
    radiusMax: TURRET_TIER_CONFIG.small.radiusMax,
    hpKg: TURRET_TIER_CONFIG.small.hpKg,
    lootId: TURRET_TIER_CONFIG.small.lootId,
    composition: ASTEROID_BELT_LOOT[TURRET_TIER_CONFIG.small.lootId] ?? [],
  },
  medium: {
    id: 'medium',
    radiusMax: TURRET_TIER_CONFIG.medium.radiusMax,
    hpKg: TURRET_TIER_CONFIG.medium.hpKg,
    lootId: TURRET_TIER_CONFIG.medium.lootId,
    composition: ASTEROID_BELT_LOOT[TURRET_TIER_CONFIG.medium.lootId] ?? [],
  },
  large: {
    id: 'large',
    radiusMax: TURRET_TIER_CONFIG.large.radiusMax,
    hpKg: TURRET_TIER_CONFIG.large.hpKg,
    lootId: TURRET_TIER_CONFIG.large.lootId,
    composition: ASTEROID_BELT_LOOT[TURRET_TIER_CONFIG.large.lootId] ?? [],
  },
}

/**
 * Classify an asteroid instance by its collision radius.
 *
 * @param radius - Per-instance collision radius in belt-local units.
 * @returns The matching tier. Radii above all cutoffs fall into `large`.
 */
export function pickTier(radius: number): TurretTier {
  if (radius < TURRET_TIERS.small.radiusMax) return TURRET_TIERS.small
  if (radius < TURRET_TIERS.medium.radiusMax) return TURRET_TIERS.medium
  return TURRET_TIERS.large
}
