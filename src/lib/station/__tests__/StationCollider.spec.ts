/**
 * Tests for {@link StationCollider}.
 *
 * @author guinetik
 * @date 2026-05-12
 */
import { describe, it, expect } from 'vitest'
import { StationCollider, type StationFloor, type StationWallAabb } from '../StationCollider'

const FLOORS: StationFloor[] = [
  { minX: -8, maxX: 8, minZ: -4, maxZ: 4, y: 0 }, // foyer
  { minX: -10, maxX: 0, minZ: 4, maxZ: 12, y: 0 }, // margaret
]

const WALLS: StationWallAabb[] = [
  // foyer +x wall
  { minX: 8, maxX: 8.2, minZ: -4, maxZ: 4 },
  // foyer -x wall
  { minX: -8.2, maxX: -8, minZ: -4, maxZ: 4 },
]

describe('StationCollider', () => {
  describe('groundedYAt', () => {
    it('returns the floor Y when the point is inside a floor rect', () => {
      const c = new StationCollider(FLOORS, WALLS)
      expect(c.groundedYAt(0, 0)).toBe(0)
    })

    it('returns the floor Y of the matching rect for adjacent rooms', () => {
      const c = new StationCollider(FLOORS, WALLS)
      expect(c.groundedYAt(-5, 8)).toBe(0)
    })

    it('returns 0 as a safe fallback when the point is outside every floor', () => {
      const c = new StationCollider(FLOORS, WALLS)
      expect(c.groundedYAt(100, 100)).toBe(0)
    })
  })

  describe('resolveLateralMove', () => {
    it('passes the move through when no wall is in the way', () => {
      const c = new StationCollider(FLOORS, WALLS)
      const out = c.resolveLateralMove(0, 0, 1, 0, 0.3)
      expect(out.x).toBeCloseTo(1)
      expect(out.z).toBeCloseTo(0)
    })

    it('clamps motion into a wall to stop short by the player radius', () => {
      const c = new StationCollider(FLOORS, WALLS)
      // Walking from x=0 toward x=10 hits the +x wall at x=8 (minus radius).
      const out = c.resolveLateralMove(0, 0, 10, 0, 0.3)
      expect(out.x).toBeLessThanOrEqual(8 - 0.3 + 1e-6)
      expect(out.x).toBeGreaterThan(7)
    })

    it('allows lateral slide along a wall', () => {
      const c = new StationCollider(FLOORS, WALLS)
      // Move parallel to the +x wall — z motion is preserved.
      const out = c.resolveLateralMove(7.9, 0, 7.9, 2, 0.3)
      expect(out.z).toBeCloseTo(2)
    })
  })
})
