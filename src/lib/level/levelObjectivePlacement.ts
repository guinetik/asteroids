/**
 * Heightmap-driven spawn and mission-objective placement helpers for the level scene.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */

import { Heightmap } from '@/lib/terrain/heightmap'

/**
 * World-space XZ point used for objective/ship placement.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export interface LevelPlacementPoint {
  /** World X coordinate. */
  x: number
  /** World Z coordinate. */
  z: number
}

/**
 * World-space XYZ point used for spawn placement.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export interface LevelSpawnPoint extends LevelPlacementPoint {
  /** Ground height at the sampled XZ position. */
  y: number
}

/**
 * Tuning knobs for spawn sampling on a baked heightmap.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export interface LevelSpawnSamplingConfig {
  /** Maximum X/Z offset from map center allowed during sampling. */
  spawnPositionRange: number
  /** Maximum random attempts before falling back to origin. */
  spawnSampleAttempts: number
}

/**
 * Tuning knobs for objective re-placement around the ship.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export interface ObjectiveResampleConfig {
  /** Minimum distance from the ship spawn. */
  minDistanceFromShip: number
  /** Maximum distance from the ship spawn. */
  maxDistanceFromShip: number
  /** Minimum spacing between objectives/claimed points. */
  minMutualSpacing: number
  /** Maximum allowed heightmap slope. */
  maxSlope: number
  /** Number of random attempts before fallback behavior. */
  resampleAttempts: number
  /** Number of pull-toward-origin fallback attempts. */
  fallbackPullAttempts: number
  /** Initial scalar applied during pull-toward-origin fallback. */
  fallbackPullFactor: number
  /** Decay applied to the fallback scalar on each failed attempt. */
  fallbackPullDecay: number
}

/**
 * Tuning knobs for heightmap flattening around spawn/objective pads.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export interface HeightmapFlattenConfig {
  /** Outer world-space radius of the smoothing disk. */
  flattenRadius: number
  /** Inner world-space radius that becomes completely flat. */
  flattenFullRadius: number
}

/**
 * Pick a random valid surface point on the baked heightmap.
 *
 * @param heightmap - Baked terrain heightmap.
 * @param config - Sampling limits and retry budget.
 * @param random - Source of uniform random numbers in `[0, 1)`.
 * @returns Valid spawn point or an origin fallback when all attempts fail.
 */
export function sampleSpawnOnSurface(
  heightmap: Heightmap,
  config: LevelSpawnSamplingConfig,
  random: () => number = Math.random,
): LevelSpawnPoint {
  for (let i = 0; i < config.spawnSampleAttempts; i++) {
    const x = (random() - 0.5) * 2 * config.spawnPositionRange
    const z = (random() - 0.5) * 2 * config.spawnPositionRange
    if (heightmap.isValidAt(x, z)) {
      return { x, y: heightmap.heightAt(x, z), z }
    }
  }

  return { x: 0, y: heightmap.heightAt(0, 0), z: 0 }
}

/**
 * Re-place an objective onto a valid, flat-ish cell near the ship spawn.
 *
 * @param heightmap - Baked terrain heightmap.
 * @param objective - Existing objective coordinates.
 * @param ship - Ship spawn coordinates.
 * @param claimed - Already-claimed positions that must keep spacing.
 * @param config - Resampling constraints and retry policy.
 * @param random - Source of uniform random numbers in `[0, 1)`.
 * @returns New placement coordinates that satisfy the constraints when possible.
 */
export function resampleObjectiveNearShip(
  heightmap: Heightmap,
  objective: LevelPlacementPoint,
  ship: LevelPlacementPoint,
  claimed: ReadonlyArray<LevelPlacementPoint>,
  config: ObjectiveResampleConfig,
  random: () => number = Math.random,
): LevelPlacementPoint {
  const minDistanceSq = config.minMutualSpacing * config.minMutualSpacing

  for (let i = 0; i < config.resampleAttempts; i++) {
    const angle = random() * Math.PI * 2
    const radius =
      config.minDistanceFromShip +
      random() * (config.maxDistanceFromShip - config.minDistanceFromShip)
    const x = ship.x + Math.cos(angle) * radius
    const z = ship.z + Math.sin(angle) * radius
    if (!heightmap.isValidAt(x, z)) continue
    if (heightmap.slopeAt(x, z) > config.maxSlope) continue

    let tooClose = false
    for (const claim of claimed) {
      const dx = x - claim.x
      const dz = z - claim.z
      if (dx * dx + dz * dz < minDistanceSq) {
        tooClose = true
        break
      }
    }
    if (tooClose) continue

    return { x, z }
  }

  let factor = config.fallbackPullFactor
  for (let i = 0; i < config.fallbackPullAttempts; i++) {
    const x = objective.x * factor
    const z = objective.z * factor
    if (heightmap.isValidAt(x, z)) {
      return { x, z }
    }
    factor *= config.fallbackPullDecay
  }

  return { x: 0, z: 0 }
}

/**
 * Smooth the baked heightmap in a disk toward the center height.
 *
 * @param heightmap - Baked terrain heightmap to mutate.
 * @param center - Center of the flatten disk in world space.
 * @param config - Inner/outer flatten radii.
 */
export function flattenHeightmapDisk(
  heightmap: Heightmap,
  center: LevelPlacementPoint,
  config: HeightmapFlattenConfig,
): void {
  if (!heightmap.isValidAt(center.x, center.z)) return

  const centerHeight = heightmap.heightAt(center.x, center.z)
  const cellSize = heightmap.worldSize / (heightmap.resolution - 1)
  const half = heightmap.worldSize / 2
  const cellRadius = Math.ceil(config.flattenRadius / cellSize)
  const gcx = Math.round(((center.x + half) / heightmap.worldSize) * (heightmap.resolution - 1))
  const gcz = Math.round(((center.z + half) / heightmap.worldSize) * (heightmap.resolution - 1))

  for (let dz = -cellRadius; dz <= cellRadius; dz++) {
    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      const gx = gcx + dx
      const gz = gcz + dz
      if (!heightmap.isValid(gx, gz)) continue

      const wx = -half + gx * cellSize
      const wz = -half + gz * cellSize
      const worldDistance = Math.hypot(wx - center.x, wz - center.z)
      if (worldDistance >= config.flattenRadius) continue

      const weight =
        worldDistance <= config.flattenFullRadius
          ? 1
          : 1 -
            smoothstep(
              (worldDistance - config.flattenFullRadius) /
                (config.flattenRadius - config.flattenFullRadius),
            )

      const original = heightmap.get(gx, gz)
      heightmap.set(gx, gz, original + (centerHeight - original) * weight)
    }
  }
}

/**
 * Cubic smoothstep easing from `[0, 1]` to `[0, 1]`.
 *
 * @param value - Normalized interpolation value.
 * @returns Smoothed interpolation factor.
 */
function smoothstep(value: number): number {
  return value * value * (3 - 2 * value)
}
