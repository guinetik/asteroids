/**
 * Helpers for deriving relative orbital speed multipliers from heliocentric data.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-orbit-capture-slingshot-design.md
 */
import type { OrbitalElements } from '@/lib/planets/types'

/** Fallback multiplier when orbit data is degenerate. */
const DEFAULT_ORBITAL_SPEED_MULTIPLIER = 1

/**
 * Computes a body's orbital speed relative to a reference orbit.
 *
 * The multiplier is based on circular-orbit speed `v = 2πa / T`.
 * Shared constants cancel out, so the relative speed is simply
 * `(a / T) / (aRef / TRef)`.
 *
 * @param orbit - Body orbit to measure.
 * @param referenceOrbit - Reference orbit that defines multiplier `1`.
 * @returns Relative orbital speed multiplier.
 */
export function computeRelativeOrbitalSpeedMultiplier(
  orbit: OrbitalElements,
  referenceOrbit: OrbitalElements,
): number {
  if (
    orbit.period <= 0
    || referenceOrbit.period <= 0
    || orbit.semiMajorAxis <= 0
    || referenceOrbit.semiMajorAxis <= 0
  ) {
    return DEFAULT_ORBITAL_SPEED_MULTIPLIER
  }

  const orbitSpeed = orbit.semiMajorAxis / orbit.period
  const referenceSpeed = referenceOrbit.semiMajorAxis / referenceOrbit.period
  if (referenceSpeed <= 0) {
    return DEFAULT_ORBITAL_SPEED_MULTIPLIER
  }

  return orbitSpeed / referenceSpeed
}
