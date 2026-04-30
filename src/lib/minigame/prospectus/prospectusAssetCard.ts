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

/** Number of meters per kilometer, used for dimension conversion. */
const METERS_PER_KM = 1000

/** Divisor to compute mean from three axis values. */
const THREE_AXES = 3

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
  /** Mean diameter in km, derived from the catalog's shape dimensions semi-axes. */
  diameterKm: number
  /** Composition rows for the photometry/DAN summary text. */
  composition: ProspectusCompositionRow[]
  /** Fixed recommendation flavor body. */
  recommendation: string
}

/**
 * Compute mean diameter in km from the asteroid's shape dimension semi-axes.
 *
 * The catalog stores dimensions as `[x, y, z]` semi-axes in meters.
 * Mean diameter = 2 * (mean of the three semi-axes) / METERS_PER_KM.
 *
 * @param dimensions - Semi-axes tuple `[x, y, z]` in meters.
 * @returns Mean diameter in km.
 */
function computeMeanDiameterKm(dimensions: [number, number, number]): number {
  const meanSemiAxisM = (dimensions[0] + dimensions[1] + dimensions[2]) / THREE_AXES
  return (meanSemiAxisM * 2) / METERS_PER_KM
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
    diameterKm: computeMeanDiameterKm(def.shape.dimensions),
    composition: def.composition.map((c) => ({ name: c.name, percentage: c.percentage })),
    recommendation: RECOMMENDATION_BODY,
  }
}
