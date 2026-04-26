/**
 * Asteroid tier classification by radius for map-turret mining.
 *
 * Each belt owns its own tier set (main belt = rocky/metallic loot, Kuiper
 * belt = ice/organics) so {@link pickTier} must be told which belt the
 * instance came from.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-turret-mode-design.md
 */
import { ASTEROID_BELT_LOOT, TURRET_TIER_CONFIG } from './turretConstants'
import type { MineralEntry } from '@/lib/asteroids/types'

/** Discrete asteroid size/yield tier. */
export type TurretTierId = 'small' | 'medium' | 'large'

/** Belt ids that have a turret tier table. */
export type TurretBeltId = 'main-belt' | 'kuiper-belt'

/** Default belt id used when a caller doesn't pass one. */
export const DEFAULT_TURRET_BELT_ID: TurretBeltId = 'main-belt'

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

/** One belt's small/medium/large tier set. */
export type TurretTierSet = Record<TurretTierId, TurretTier>

/** Raw JSON shape expected for a single tier entry. */
interface RawTierEntry {
  readonly radiusMax: number
  readonly hpKg: number
  readonly lootId: string
}

/**
 * Resolve one tier entry from JSON into a typed {@link TurretTier}, pulling
 * its composition table from {@link ASTEROID_BELT_LOOT}.
 */
function resolveTier(id: TurretTierId, entry: RawTierEntry): TurretTier {
  return {
    id,
    radiusMax: entry.radiusMax,
    hpKg: entry.hpKg,
    lootId: entry.lootId,
    composition: ASTEROID_BELT_LOOT[entry.lootId] ?? [],
  }
}

/**
 * Resolve one belt's full tier set from its raw JSON block. Throws if any
 * of the expected tier keys is missing so misconfigurations fail loudly at
 * boot rather than producing silent mis-tinted asteroids.
 */
function resolveTierSet(
  beltId: TurretBeltId,
  raw: Record<TurretTierId, RawTierEntry> | undefined,
): TurretTierSet {
  if (!raw) {
    throw new Error(`turret-config.json: missing tiers for belt "${beltId}"`)
  }
  return {
    small: resolveTier('small', raw.small),
    medium: resolveTier('medium', raw.medium),
    large: resolveTier('large', raw.large),
  }
}

/** Per-belt resolved tier sets. Indexed by belt id. */
export const TURRET_TIER_SETS: Record<TurretBeltId, TurretTierSet> = {
  'main-belt': resolveTierSet(
    'main-belt',
    TURRET_TIER_CONFIG['main-belt'] as Record<TurretTierId, RawTierEntry> | undefined,
  ),
  'kuiper-belt': resolveTierSet(
    'kuiper-belt',
    TURRET_TIER_CONFIG['kuiper-belt'] as Record<TurretTierId, RawTierEntry> | undefined,
  ),
}

/**
 * Back-compat alias — the legacy single-belt table used before Kuiper was
 * added. Tests and older callers that don't pass a belt id continue to see
 * the main-belt set.
 */
export const TURRET_TIERS: TurretTierSet = TURRET_TIER_SETS[DEFAULT_TURRET_BELT_ID]

/**
 * Classify an asteroid instance by its collision radius within its belt.
 *
 * @param radius - Per-instance collision radius in belt-local units.
 * @param beltId - Which belt the instance belongs to. Defaults to main belt.
 * @returns The matching tier. Radii above all cutoffs fall into `large`.
 */
export function pickTier(
  radius: number,
  beltId: TurretBeltId = DEFAULT_TURRET_BELT_ID,
): TurretTier {
  const tiers = TURRET_TIER_SETS[beltId]
  if (radius < tiers.small.radiusMax) return tiers.small
  if (radius < tiers.medium.radiusMax) return tiers.medium
  return tiers.large
}
