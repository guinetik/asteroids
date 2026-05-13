/**
 * Tests for {@link StationCollider}.
 *
 * @author guinetik
 * @date 2026-05-12
 */
import { describe, it, expect } from 'vitest'
import { StationCollider, type StationFloor, type StationRect } from '../StationCollider'

const FOYER: StationFloor = { minX: -5, maxX: 5, minZ: -7, maxZ: 7, y: 0 }
const MARGARET: StationFloor = { minX: -15, maxX: -5, minZ: -5, maxZ: 5, y: 0 }
const FLOORS: StationFloor[] = [FOYER, MARGARET]

// Passage from foyer -xCurve / margaret +xCap centred at x=-5, z=0.
const PASSAGE_FOYER_MARGARET: StationRect = { minX: -5.6, maxX: -4.4, minZ: -0.9, maxZ: 0.9 }
const PASSAGES: StationRect[] = [PASSAGE_FOYER_MARGARET]
const CLOSED_DOOR_BLOCKER: StationRect = { minX: -5.45, maxX: -4.55, minZ: -0.8, maxZ: 0.8 }

const RADIUS = 0.3

describe('StationCollider', () => {
  describe('groundedYAt', () => {
    it('returns the floor Y when the point is inside a floor rect', () => {
      const c = new StationCollider(FLOORS, PASSAGES)
      expect(c.groundedYAt(0, 0)).toBe(0)
    })

    it('returns the floor Y for an adjacent room', () => {
      const c = new StationCollider(FLOORS, PASSAGES)
      expect(c.groundedYAt(-10, 0)).toBe(0)
    })

    it('keeps passage grounding at the station floor height', () => {
      const raisedFloors: StationFloor[] = FLOORS.map((floor) => ({ ...floor, y: 0.25 }))
      const c = new StationCollider(raisedFloors, PASSAGES)
      expect(c.groundedYAt(-5.2, 0)).toBe(0.25)
    })

    it('returns 0 as a safe fallback when the point is outside every floor', () => {
      const c = new StationCollider(FLOORS, PASSAGES)
      expect(c.groundedYAt(100, 100)).toBe(0)
    })
  })

  describe('resolveLateralMove', () => {
    it('passes the move through when both endpoints are inside a room', () => {
      const c = new StationCollider(FLOORS, PASSAGES)
      const out = c.resolveLateralMove(0, 0, 1, 0, RADIUS)
      expect(out.x).toBeCloseTo(1)
      expect(out.z).toBeCloseTo(0)
    })

    it('blocks a move that exits the rooms and misses every passage', () => {
      const c = new StationCollider(FLOORS, PASSAGES)
      // Walking +Z from foyer centre out into space (z > 7). The +zCap of the
      // foyer is solid here (no passage at z=7, x=0 in this fixture).
      const out = c.resolveLateralMove(0, 0, 0, 100, RADIUS)
      // Player slides up Z but is clamped well inside the foyer.
      expect(out.z).toBeLessThanOrEqual(FOYER.maxZ - RADIUS + 1e-3)
    })

    it('allows crossing through a passage rectangle between two rooms', () => {
      const c = new StationCollider(FLOORS, PASSAGES)
      // Moving from foyer interior at x=-4, z=0 to margaret interior at x=-6, z=0
      // crosses the passage rectangle at x=-5.
      const out = c.resolveLateralMove(-4, 0, -6, 0, RADIUS)
      expect(out.x).toBeCloseTo(-6)
      expect(out.z).toBeCloseTo(0)
    })

    it('blocks a passage when a dynamic door blocker covers it', () => {
      const c = new StationCollider(FLOORS, PASSAGES)
      c.setBlockers([CLOSED_DOOR_BLOCKER])
      const out = c.resolveLateralMove(-4, 0, -6, 0, RADIUS)
      expect(out.x).toBeCloseTo(-4)
      expect(out.z).toBeCloseTo(0)
    })

    it('allows the same passage again after the door blocker is cleared', () => {
      const c = new StationCollider(FLOORS, PASSAGES)
      c.setBlockers([CLOSED_DOOR_BLOCKER])
      c.setBlockers([])
      const out = c.resolveLateralMove(-4, 0, -6, 0, RADIUS)
      expect(out.x).toBeCloseTo(-6)
      expect(out.z).toBeCloseTo(0)
    })

    it('blocks a curve-wall crossing outside the doorway Z range', () => {
      const c = new StationCollider(FLOORS, PASSAGES)
      // Same west-bound crossing but at z=4 — far outside the door (z∈[-0.9, 0.9]).
      const out = c.resolveLateralMove(-4, 4, -6, 4, RADIUS)
      // X cannot cross the foyer -X edge; Z is unchanged (slide).
      expect(out.x).toBeGreaterThanOrEqual(FOYER.minX + RADIUS - 1e-3)
      expect(out.z).toBeCloseTo(4)
    })

    it('slides along a wall instead of stopping dead', () => {
      const c = new StationCollider(FLOORS, PASSAGES)
      // Player at the foyer's east interior edge. Move NE into open space —
      // the full move and X-only sub-move both leave every room; Z-only
      // stays inside the foyer so the player slides north.
      const out = c.resolveLateralMove(4.5, 0, 10, 3, RADIUS)
      expect(out.x).toBeCloseTo(4.5)
      expect(out.z).toBeCloseTo(3)
    })
  })
})
