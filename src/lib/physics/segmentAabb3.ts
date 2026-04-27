/**
 * True if the segment from `from` to `to` intersects a closed world-space axis-aligned
 * box. On hit, `out` receives the first entry point along the segment (t in [0,1]).
 *
 * @author guinetik
 * @date 2026-04-28
 * @spec docs/superpowers/specs/2026-04-05-map-shuttle-player-design.md
 */
import * as THREE from 'three'

/**
 * @param from - Segment start, world space.
 * @param to - Segment end, world space.
 * @param min - AABB min corner, world space.
 * @param max - AABB max corner, world space.
 * @param out - Written with the entry hit point when this returns true.
 * @returns True if the open segment (or endpoint inside) hits the AABB.
 */
export function segmentIntersectsAabb3(
  from: THREE.Vector3,
  to: THREE.Vector3,
  min: THREE.Vector3,
  max: THREE.Vector3,
  out: THREE.Vector3,
): boolean {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  let tEnter = 0
  let tExit = 1
  const slab = (origin: number, delta: number, lo: number, hi: number): boolean => {
    if (Math.abs(delta) < 1e-9) return origin >= lo && origin <= hi
    const t1 = (lo - origin) / delta
    const t2 = (hi - origin) / delta
    const tMin = Math.min(t1, t2)
    const tMax = Math.max(t1, t2)
    if (tMin > tEnter) tEnter = tMin
    if (tMax < tExit) tExit = tMax
    return tEnter <= tExit
  }
  if (!slab(from.x, dx, min.x, max.x)) return false
  if (!slab(from.y, dy, min.y, max.y)) return false
  if (!slab(from.z, dz, min.z, max.z)) return false
  if (tEnter > 1 || tExit < 0) return false
  out.set(
    from.x + dx * Math.max(0, tEnter),
    from.y + dy * Math.max(0, tEnter),
    from.z + dz * Math.max(0, tEnter),
  )
  return true
}
