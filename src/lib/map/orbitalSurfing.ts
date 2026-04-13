/**
 * Pure-math helpers for orbital surfing path snapping and arc extraction.
 *
 * @author guinetik
 * @date 2026-04-12
 * @spec docs/superpowers/specs/2026-04-12-orbital-surfing-manifold-highway-design.md
 */

/** A 2D point on the XZ plane (Y is up in Three.js world space). */
export interface OrbitPoint2D {
  /** World-space X coordinate. */
  x: number
  /** World-space Z coordinate. */
  z: number
}

/** Result of a successful orbit path proximity check. */
export interface OrbitSnapResult {
  /** Index into the orbit points array for the nearest point. */
  index: number
  /** World-space X of the nearest orbit point. */
  x: number
  /** World-space Z of the nearest orbit point. */
  z: number
  /** Distance from the ship to the nearest orbit point. */
  distance: number
}

/**
 * Finds the nearest point on a sampled orbit ellipse within snap distance.
 *
 * @param shipX - Ship world X position.
 * @param shipZ - Ship world Z position.
 * @param orbitPoints - Sampled orbit ellipse points in world space (XZ plane).
 * @param maxSnapDistance - Maximum world-unit distance to consider a snap.
 * @returns Snap result, or null if no point is within range.
 */
export function findNearestOrbitPoint(
  shipX: number,
  shipZ: number,
  orbitPoints: readonly OrbitPoint2D[],
  maxSnapDistance: number,
): OrbitSnapResult | null {
  let bestIndex = -1
  let bestDistSq = maxSnapDistance * maxSnapDistance
  for (let i = 0; i < orbitPoints.length; i++) {
    const p = orbitPoints[i]!
    const dx = shipX - p.x
    const dz = shipZ - p.z
    const distSq = dx * dx + dz * dz
    if (distSq < bestDistSq) {
      bestDistSq = distSq
      bestIndex = i
    }
  }
  if (bestIndex < 0) return null
  const best = orbitPoints[bestIndex]!
  return {
    index: bestIndex,
    x: best.x,
    z: best.z,
    distance: Math.sqrt(bestDistSq),
  }
}

/**
 * Extracts an arc of orbit points from startIndex to endIndex (inclusive),
 * wrapping around the array if needed.
 *
 * When startIndex === endIndex, returns the full orbit (all points + the start again).
 *
 * @param points - Full orbit sample points.
 * @param startIndex - Index of the first arc point (ship attach point).
 * @param endIndex - Index of the last arc point (planet position).
 * @returns Array of points forming the arc.
 */
export function extractOrbitArc(
  points: readonly OrbitPoint2D[],
  startIndex: number,
  endIndex: number,
): OrbitPoint2D[] {
  const n = points.length
  if (n === 0) return []
  const arc: OrbitPoint2D[] = []
  if (startIndex === endIndex) {
    for (let i = 0; i <= n; i++) {
      arc.push(points[(startIndex + i) % n]!)
    }
    return arc
  }
  let i = startIndex
  while (true) {
    arc.push(points[i % n]!)
    if (i % n === endIndex % n) break
    i++
  }
  return arc
}
