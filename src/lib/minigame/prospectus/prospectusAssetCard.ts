/**
 * Build the Society's prospectus asset card from an asteroid catalog entry.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-29-jovian-prospectus-minigame-design.md
 */
import { getAsteroidById } from '@/lib/asteroids/catalog'

/** Hardcoded Society ledger ref for Hektor (per spec asset-card section). */
const HEKTOR_ASSET_REF = 'ASSET 2306-J'

/** Hardcoded recommendation copy — the dramatic beat. */
const RECOMMENDATION_BODY =
  'Asset is composition-rich and volatiles-positive. Asset is recommended for full extraction queue. Estimated yield value: ~2.8B credits over a 14-month demolition cycle. No habitation. No biological signature. No protected status.'

/** Composition row mirrors `MineralEntry` from the asteroid catalog. */
export interface ProspectusCompositionRow {
  /** Display name (e.g. `'Carbonaceous Chondrite'`). */
  name: string
  /** Percentage `0..100`. */
  percentage: number
}

/** Asset-card data shape consumed by the overlay template. */
export interface ProspectusAssetCard {
  /** Society ledger label (e.g. `'ASSET 2306-J'`). */
  assetRef: string
  /** Astronomical cross-ref line (e.g. `'Cross-ref: 624 HEKTOR (L4)'`). */
  crossRef: string
  /** Region label (e.g. `'Jovian Trojans · L4 leading cluster'`). */
  region: string
  /** Composition class string (e.g. `'D-type · contact binary'`). */
  classLabel: string
  /** Mean diameter in km (real-world IAU value, not in-game geometry). */
  diameterKm: number
  /** Composition rows for the photometry/DAN summary text. */
  composition: ProspectusCompositionRow[]
  /** Fixed recommendation flavor body. */
  recommendation: string
}

/**
 * Build the prospectus asset card for a given catalog body. Returns `null`
 * when the body id is unknown — overlay falls back to a placeholder card.
 *
 * @param bodyId - Asteroid catalog id (e.g. `'hektor'`).
 * @returns Card data or `null`.
 */
export function buildProspectusAssetCard(bodyId: string): ProspectusAssetCard | null {
  const def = getAsteroidById(bodyId)
  if (!def) return null
  return {
    assetRef: HEKTOR_ASSET_REF,
    crossRef: `Cross-ref: ${def.designation.toUpperCase()} (L4)`,
    region: 'Jovian Trojans · L4 leading cluster',
    classLabel: 'D-type · contact binary',
    diameterKm: def.physical.meanDiameterKm,
    composition: def.composition.map((c) => ({ name: c.name, percentage: c.percentage })),
    recommendation: RECOMMENDATION_BODY,
  }
}
