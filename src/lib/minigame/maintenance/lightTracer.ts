/**
 * Light beam tracing for the solar panel maintenance puzzle.
 *
 * Traces beams from the sun through solar panels to surface targets.
 * Handles planet occlusion (rays blocked by Neptune's disc) and
 * multi-panel chaining.
 *
 * @author guinetik
 * @date 2026-04-11
 * @spec docs/superpowers/specs/2026-04-10-orbital-minigame-design.md
 */
import type { SolarPanel, SurfaceTarget, LightBeam } from './types'
import {
  NEPTUNE_X,
  NEPTUNE_Y,
  NEPTUNE_R,
  PANEL_CAPTURE_RADIUS,
  TARGET_HIT_RADIUS,
  MAX_BEAM_BOUNCES,
  BEAM_INTENSITY_FALLOFF,
  BEAM_MAX_LENGTH,
} from './constants'

/**
 * Check if a line segment from A to B is blocked by the planet disc.
 *
 * Uses closest-point-on-segment to planet center. If that distance
 * is less than the planet radius, the segment is occluded.
 *
 * @param ax - Segment start X
 * @param ay - Segment start Y
 * @param bx - Segment end X
 * @param by - Segment end Y
 * @returns true if the planet blocks the path
 */
export function isPlanetBlocking(ax: number, ay: number, bx: number, by: number): boolean {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return false

  // Project planet center onto the line segment
  const t = Math.max(0, Math.min(1, ((NEPTUNE_X - ax) * dx + (NEPTUNE_Y - ay) * dy) / len2))
  const closestX = ax + t * dx
  const closestY = ay + t * dy
  const distX = NEPTUNE_X - closestX
  const distY = NEPTUNE_Y - closestY
  const dist2 = distX * distX + distY * distY

  // Slightly shrink the blocking radius so beams can graze the limb
  const blockR = NEPTUNE_R - 4
  return dist2 < blockR * blockR
}

/**
 * Check if a point is inside the planet disc.
 *
 * @param x - Point X
 * @param y - Point Y
 * @returns true if inside
 */
export function isInsidePlanet(x: number, y: number): boolean {
  const dx = x - NEPTUNE_X
  const dy = y - NEPTUNE_Y
  return dx * dx + dy * dy < NEPTUNE_R * NEPTUNE_R
}

/**
 * Trace all light beams and determine which panels and targets are lit.
 *
 * Propagation:
 * 1. Sun illuminates panels with direct line-of-sight.
 * 2. Each lit panel emits a beam in its aim direction.
 * 3. If that beam hits another unlit panel, it becomes lit (chain).
 * 4. If a beam hits a surface target, that target is illuminated.
 * 5. Repeat until no new panels are lit (BFS).
 *
 * @param panels - All solar panels (mutated: .lit is set)
 * @param targets - All surface targets (mutated: .lit is set)
 * @param sunX - Sun world X position
 * @param sunY - Sun world Y position
 * @returns Array of light beam segments for rendering
 */
export function traceAllBeams(
  panels: SolarPanel[],
  targets: SurfaceTarget[],
  sunX: number,
  sunY: number,
): LightBeam[] {
  const beams: LightBeam[] = []

  // Reset lit state
  for (const p of panels) p.lit = false
  for (const t of targets) t.lit = false

  // Step 1: Sun illuminates panels with direct line-of-sight
  for (const panel of panels) {
    if (!isPlanetBlocking(sunX, sunY, panel.x, panel.y)) {
      panel.lit = true
      beams.push({
        x1: sunX,
        y1: sunY,
        x2: panel.x,
        y2: panel.y,
        intensity: 0.15, // sun-to-panel beams are faint (long distance)
      })
    }
  }

  // Step 2: BFS — lit panels emit beams, may light other panels or targets
  const queue = panels.filter((p) => p.lit)
  const visited = new Set<number>()
  let bounces = 0

  while (queue.length > 0 && bounces < MAX_BEAM_BOUNCES) {
    const panel = queue.shift()!
    if (visited.has(panel.id)) continue
    visited.add(panel.id)
    bounces++

    const beam = traceBeamFromPanel(panel, panels, targets)
    if (beam) {
      // Check targets along the FULL beam path before shortening
      for (const target of targets) {
        if (target.lit) continue
        if (beamHitsPoint(beam, target.x, target.y, TARGET_HIT_RADIUS)) {
          target.lit = true
        }
      }

      // Check ALL panels the beam passes through — light them all
      let closestT = Infinity
      for (const other of panels) {
        if (other.lit || visited.has(other.id)) continue
        if (beamHitsPoint(beam, other.x, other.y, PANEL_CAPTURE_RADIUS)) {
          other.lit = true
          queue.push(other)
          // Track closest hit to shorten the rendered beam
          const t = closestPointT(beam, other.x, other.y)
          if (t < closestT) closestT = t
        }
      }
      // Shorten beam to the farthest panel it reaches through
      if (closestT < Infinity) {
        const dx = beam.x2 - beam.x1
        const dy = beam.y2 - beam.y1
        beam.x2 = beam.x1 + dx * closestT
        beam.y2 = beam.y1 + dy * closestT
      }

      beams.push(beam)
    }
  }

  return beams
}

/**
 * Trace a single beam from a lit panel in its aim direction.
 *
 * @param panel - The emitting panel
 * @param panels - All panels (for collision)
 * @param targets - All targets (for collision)
 * @returns A beam segment, or null if blocked immediately
 */
function traceBeamFromPanel(
  panel: SolarPanel,
  _panels: SolarPanel[],
  _targets: SurfaceTarget[],
): LightBeam | null {
  const endX = panel.x + Math.cos(panel.aimAngle) * BEAM_MAX_LENGTH
  const endY = panel.y + Math.sin(panel.aimAngle) * BEAM_MAX_LENGTH

  // Find the closest hit along this ray (planet, panel, target, or max length)
  let hitX = endX
  let hitY = endY

  // Check planet intersection — if the beam enters the planet, clip it
  const planetHit = rayCircleIntersection(
    panel.x,
    panel.y,
    panel.aimAngle,
    NEPTUNE_X,
    NEPTUNE_Y,
    NEPTUNE_R - 4,
  )
  if (planetHit) {
    hitX = planetHit.x
    hitY = planetHit.y
  }

  const intensity = BEAM_INTENSITY_FALLOFF

  return {
    x1: panel.x,
    y1: panel.y,
    x2: hitX,
    y2: hitY,
    intensity,
  }
}

/**
 * Check if a beam segment passes close enough to a point to "hit" it.
 *
 * @param beam - The beam segment
 * @param px - Point X
 * @param py - Point Y
 * @param radius - Hit radius
 * @returns true if the beam passes within radius of the point
 */
function beamHitsPoint(beam: LightBeam, px: number, py: number, radius: number): boolean {
  const dx = beam.x2 - beam.x1
  const dy = beam.y2 - beam.y1
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return false

  const t = Math.max(0, Math.min(1, ((px - beam.x1) * dx + (py - beam.y1) * dy) / len2))
  const closestX = beam.x1 + t * dx
  const closestY = beam.y1 + t * dy
  const distX = px - closestX
  const distY = py - closestY

  return distX * distX + distY * distY < radius * radius
}

/**
 * Get the projection parameter (0–1) of a point onto a beam segment.
 * Used to determine how far along the beam a hit occurs.
 */
function closestPointT(beam: LightBeam, px: number, py: number): number {
  const dx = beam.x2 - beam.x1
  const dy = beam.y2 - beam.y1
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return 0
  return Math.max(0, Math.min(1, ((px - beam.x1) * dx + (py - beam.y1) * dy) / len2))
}

/**
 * Find the first intersection of a ray with a circle.
 *
 * @param ox - Ray origin X
 * @param oy - Ray origin Y
 * @param angle - Ray direction in radians
 * @param cx - Circle center X
 * @param cy - Circle center Y
 * @param cr - Circle radius
 * @returns Intersection point, or null if no hit
 */
function rayCircleIntersection(
  ox: number,
  oy: number,
  angle: number,
  cx: number,
  cy: number,
  cr: number,
): { x: number; y: number } | null {
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const fx = ox - cx
  const fy = oy - cy

  const a = dx * dx + dy * dy
  const b = 2 * (fx * dx + fy * dy)
  const c = fx * fx + fy * fy - cr * cr

  let discriminant = b * b - 4 * a * c
  if (discriminant < 0) return null

  discriminant = Math.sqrt(discriminant)
  const t1 = (-b - discriminant) / (2 * a)
  const t2 = (-b + discriminant) / (2 * a)

  // We want the first positive intersection (ray goes forward)
  const t = t1 > 1 ? t1 : t2 > 1 ? t2 : null
  if (t === null) return null

  return { x: ox + dx * t, y: oy + dy * t }
}
