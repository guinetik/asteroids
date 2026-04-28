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
