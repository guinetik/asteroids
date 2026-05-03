/**
 * Shared enemy silhouette palette tiers for bunker difficulty variants.
 *
 * @author guinetik
 * @date 2026-04-28
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */

/** Visual tier used by procedural enemy controllers. */
export type EnemyVisualTier = 'default' | 'medium' | 'hard'

/** Outer-body and accent colors for procedural enemy silhouettes. */
export interface EnemyVisualPalette {
  /** Main silhouette color for hull, membrane, legs, and outer body pieces. */
  silhouette: number
  /** Darker silhouette color for secondary body plates and collars. */
  silhouetteDark: number
  /** Primary feature accent for spikes, hair, eyes, and threat details. */
  feature: number
  /** Brighter feature accent for feature tips and highlights. */
  featureBright: number
}

/** Default easy/readable enemy silhouette: cyan body with magenta features. */
export const DEFAULT_ENEMY_VISUAL_PALETTE: EnemyVisualPalette = {
  silhouette: 0x00d8f0,
  silhouetteDark: 0x00a8c8,
  feature: 0xff3dad,
  featureBright: 0xff00cc,
}

/** Mid-tier bunker variant: amber body with cyan features. */
export const MEDIUM_ENEMY_VISUAL_PALETTE: EnemyVisualPalette = {
  silhouette: 0xffa629,
  silhouetteDark: 0xcc7a12,
  feature: 0x00ffcc,
  featureBright: 0x66fff0,
}

/** Hard bunker variant: magenta-violet body with orange/amber features. */
export const HARD_ENEMY_VISUAL_PALETTE: EnemyVisualPalette = {
  silhouette: 0xb000ff,
  silhouetteDark: 0x6f2cff,
  feature: 0xff9d00,
  featureBright: 0xffcc33,
}

/** Constructor options shared by procedural enemy controllers. */
export interface EnemyVisualControllerOptions {
  /** Difficulty-driven visual tier. Defaults to the normal surface palette. */
  visualTier?: EnemyVisualTier
}

/**
 * Resolve a visual tier to a stable palette object.
 *
 * @param tier - Optional visual tier.
 */
export function enemyVisualPaletteForTier(tier: EnemyVisualTier = 'default'): EnemyVisualPalette {
  if (tier === 'medium') return MEDIUM_ENEMY_VISUAL_PALETTE
  if (tier === 'hard') return HARD_ENEMY_VISUAL_PALETTE
  return DEFAULT_ENEMY_VISUAL_PALETTE
}

/** Upper-inclusive mission difficulty for the `'default'` enemy palette. */
const DEFAULT_VISUAL_TIER_MAX_DIFFICULTY = 4

/** Upper-inclusive mission difficulty for the `'medium'` enemy palette. */
const MEDIUM_VISUAL_TIER_MAX_DIFFICULTY = 7

/**
 * Map a rolled mission difficulty (1–10) to the enemy visual tier used by
 * procedural enemy controllers. Mirrors the bunker palette banding so combat
 * encounters across mission types share the same difficulty → color rules.
 *
 * @param difficulty - Mission difficulty in the 1–10 range.
 */
export function enemyVisualTierForDifficulty(difficulty: number): EnemyVisualTier {
  if (difficulty <= DEFAULT_VISUAL_TIER_MAX_DIFFICULTY) return 'default'
  if (difficulty <= MEDIUM_VISUAL_TIER_MAX_DIFFICULTY) return 'medium'
  return 'hard'
}

/** Contact and enemy-projectile damage multiplier when tier is `'default'`. */
const PLAYER_DAMAGE_MULTIPLIER_DEFAULT = 1
/** Player damage multiplier for the amber medium palette tier (matches rescue tuning). */
const PLAYER_DAMAGE_MULTIPLIER_MEDIUM = 1.5
/** Player damage multiplier for the magenta hard palette tier. */
const PLAYER_DAMAGE_MULTIPLIER_HARD = 2

/** Archetypes that hidden surface disturbance rolls may instantiate. */
export type DisturbanceAmbientViroidKind = 'bacteriophage' | 'spire' | 'chimera'

/**
 * Sanitize mission difficulty to the documented `[1, 10]` band for branching rules.
 *
 * @param missionDifficulty - Raw mission difficulty, e.g. `7`.
 * @returns Integer-ish difficulty pinned to `[1, 10]`; defaults to `1` when NaN.
 */
export function clampMissionDifficultyForEnemyRules(missionDifficulty: number): number {
  if (!Number.isFinite(missionDifficulty)) return 1
  return Math.min(10, Math.max(1, Math.round(missionDifficulty)))
}

/**
 * Map mission difficulty to the viroid archetype pool ambient disturbance rolls
 * sample from — low missions only walkers; mid adds floating Spires; hard adds Chimeras.
 * Uses the same difficulty breakpoints as {@link enemyVisualTierForDifficulty}.
 *
 * @param missionDifficulty - Mission difficulty `[1, 10]`, sanitized when non-finite.
 * @returns Non-empty immutable list rolled uniformly each spawn attempt.
 *
 * @example Low difficulty `[1]` returns `[ 'bacteriophage' ]` only.
 * @example Difficulty `[6]` allows bacteriophage or spire.
 * @example Difficulty `[10]` allows all three archetypes.
 */
export function disturbanceAmbientViroidKindsForMissionDifficulty(
  missionDifficulty: number,
): readonly DisturbanceAmbientViroidKind[] {
  const d = clampMissionDifficultyForEnemyRules(missionDifficulty)

  if (d <= DEFAULT_VISUAL_TIER_MAX_DIFFICULTY) {
    return ['bacteriophage'] as const
  }

  if (d <= MEDIUM_VISUAL_TIER_MAX_DIFFICULTY) {
    return ['bacteriophage', 'spire'] as const
  }

  return ['bacteriophage', 'spire', 'chimera'] as const
}

/**
 * Player-only damage multiplier for contact hits and enemy projectiles matching
 * the mission's visual tier. Mirrors rescue/bunker encounter tuning.
 *
 * @param tier - Palette tier tied to difficulty banding (default / medium / hard).
 *
 * @example `enemyPlayerDamageMultiplierForVisualTier('hard')` returns `2`.
 */
export function enemyPlayerDamageMultiplierForVisualTier(tier: EnemyVisualTier): number {
  if (tier === 'hard') return PLAYER_DAMAGE_MULTIPLIER_HARD
  if (tier === 'medium') return PLAYER_DAMAGE_MULTIPLIER_MEDIUM
  return PLAYER_DAMAGE_MULTIPLIER_DEFAULT
}
