/**
 * Orbital mechanics public API.
 *
 * Re-exports the essential types and functions from kepler.ts
 * for convenient consumption by the view layer.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-planetarium-data-layer-design.md
 */
export type { Vec3, OrbitalElements } from './types'
export { orbitalPosition3D, orbitPathPoints } from './kepler'
