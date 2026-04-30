/**
 * Synthetic terrain used only by the map EVA {@link ProjectileSystem} so science /
 * laser bolts can share the same collision pipeline as the level without modeling
 * open-space geometry.
 *
 * A huge uniform “floor” sits far below plausible EVA Y so shots behave like
 * open space until a dedicated hazard mesh exists.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-05-map-shuttle-player-design.md
 */
import { Heightmap } from '@/lib/terrain/heightmap'

/** XZ world extent (meters) — must cover map EVA positions so `heightAt` is not the out-of-domain fallback. */
const EVA_MAP_PROJECTILE_HEIGHTMAP_WORLD_SIZE = 2_000_000_000

/** Small grid: uniform floor, fewer cells to allocate. */
const EVA_MAP_PROJECTILE_HEIGHTMAP_RESOLUTION = 4

/** Y value for every cell: far below typical EVA play height so terrain hits are rare. */
const EVA_MAP_PROJECTILE_FLOOR_Y = -500_000_000

/**
 * Build a heightmap with a single floor plane far below the play volume for map EVA
 * projectiles.
 *
 * @returns A shared pattern heightmap; safe to reuse for the map session lifetime.
 */
export function createEvaMapProjectileHeightmap(): Heightmap {
  const h = new Heightmap(
    EVA_MAP_PROJECTILE_HEIGHTMAP_RESOLUTION,
    EVA_MAP_PROJECTILE_HEIGHTMAP_WORLD_SIZE,
  )
  for (let gz = 0; gz < EVA_MAP_PROJECTILE_HEIGHTMAP_RESOLUTION; gz += 1) {
    for (let gx = 0; gx < EVA_MAP_PROJECTILE_HEIGHTMAP_RESOLUTION; gx += 1) {
      h.set(gx, gz, EVA_MAP_PROJECTILE_FLOOR_Y)
    }
  }
  h.validity.fill(1)
  return h
}
