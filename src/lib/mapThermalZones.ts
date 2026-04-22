/**
 * Thermal zone band math for the tactical map overlay.
 *
 * Converts ship-health zone boundaries into a list of world-space annular
 * bands centered on the Sun. The controller projects these to screen space
 * using the same `projectToScreen` helper the gravity rings use; the Vue
 * overlay renders them as transparent SVG ring strokes.
 *
 * @author guinetik
 * @date 2026-04-22
 * @spec docs/superpowers/specs/2026-04-05-ship-health-temperature-design.md
 */
import type { ShipHealthConfig } from '@/lib/shipHealth'

/** Thermal zone identifier — drives the ring color in the overlay. */
export type ThermalZoneKind = 'hot1' | 'hot2' | 'hot3' | 'cold2' | 'cold3'

/** World-space annular band for a single thermal zone. */
export interface ThermalZoneBand {
  /** Zone classification used for styling. */
  kind: ThermalZoneKind
  /** Inner edge of the band in world units from the Sun (0 for the innermost disc). */
  innerWorldRadius: number
  /** Outer edge of the band in world units from the Sun. */
  outerWorldRadius: number
}

/**
 * Multiplier applied to `coldZone3Boundary` to extend the outermost cold band
 * past the visible map. The frustum clips anything outside, so a generous
 * sentinel guarantees the band reaches the edge at any zoom level.
 */
const COLD3_OUTER_SENTINEL_FACTOR = 10

/**
 * Build the ordered list of thermal zone bands from ship-health boundaries.
 * All radii are already in world units (pre-scaled by ORBIT_SCALE when the
 * config is constructed in MapViewController).
 *
 * @param cfg - Ship-health config with boundary radii in world units
 * @returns Five bands: hot3 (innermost disc) → hot2 → hot1 → cold2 → cold3 (outermost)
 */
export function getThermalZoneBands(cfg: ShipHealthConfig): ThermalZoneBand[] {
  return [
    { kind: 'hot3', innerWorldRadius: 0, outerWorldRadius: cfg.heatZone3Boundary },
    {
      kind: 'hot2',
      innerWorldRadius: cfg.heatZone3Boundary,
      outerWorldRadius: cfg.heatZone2Boundary,
    },
    {
      kind: 'hot1',
      innerWorldRadius: cfg.heatZone2Boundary,
      outerWorldRadius: cfg.hotBoundary,
    },
    {
      kind: 'cold2',
      innerWorldRadius: cfg.coldBoundary,
      outerWorldRadius: cfg.coldZone3Boundary,
    },
    {
      kind: 'cold3',
      innerWorldRadius: cfg.coldZone3Boundary,
      outerWorldRadius: cfg.coldZone3Boundary * COLD3_OUTER_SENTINEL_FACTOR,
    },
  ]
}
