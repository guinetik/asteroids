/**
 * Tests for OrbitCaptureSystem domain logic.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-orbit-capture-slingshot-design.md
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { OrbitCaptureSystem } from '../orbitCapture'
import type { CaptureBody } from '../orbitCapture'

/** Creates a mock CaptureBody at the given world position. */
function makeBody(name: string, x: number, z: number, displayRadius = 0.1): CaptureBody {
  return {
    name,
    displayRadius,
    getWorldX: () => x,
    getWorldZ: () => z,
  }
}

describe('OrbitCaptureSystem', () => {
  let system: OrbitCaptureSystem
  let bodyA: CaptureBody
  let bodyB: CaptureBody

  beforeEach(() => {
    // displayRadius=0.1 → captureRadius = max(0.1*80*20, 1.0) = 160
    // displayRadius=0.1 → orbitRadius   = max(0.1*80*1.8, 0.5) = 14.4
    bodyA = makeBody('Alpha', 0, 0, 0.1)
    bodyB = makeBody('Beta', 1000, 0, 0.1)
    system = new OrbitCaptureSystem([bodyA, bodyB])
  })

  // ─── findNearestInRange ───────────────────────────────────────────────────

  describe('findNearestInRange', () => {
    it('returns null when shuttle is out of capture range of all bodies', () => {
      // captureRadius for 0.1 display = 160. Position at 500 from Alpha (at origin)
      const result = system.findNearestInRange(500, 0)
      expect(result).toBeNull()
    })

    it('returns the body when shuttle is within capture range', () => {
      // Within 160 units of Alpha at (0,0)
      const result = system.findNearestInRange(20, 0)
      expect(result).not.toBeNull()
      expect(result!.name).toBe('Alpha')
    })

    it('returns the closest body when multiple bodies are in range', () => {
      // Place both bodies close together
      const closeBodyA = makeBody('Close Alpha', 0, 0, 0.1)
      const closeBodyB = makeBody('Close Beta', 30, 0, 0.1) // 30 units away, within 160 capture radius
      const sys = new OrbitCaptureSystem([closeBodyA, closeBodyB])
      // Shuttle at (25, 0) — 25 from Alpha, 5 from Beta → Beta is closer
      const result = sys.findNearestInRange(25, 0)
      expect(result).not.toBeNull()
      expect(result!.name).toBe('Close Beta')
    })
  })

  // ─── beginCapture ─────────────────────────────────────────────────────────

  describe('beginCapture', () => {
    it('transitions free -> approaching when shuttle is in capture range', () => {
      expect(system.state).toBe('free')
      const captured = system.beginCapture(20, 0)
      expect(captured).toBe(true)
      expect(system.state).toBe('approaching')
    })

    it('stays free when shuttle is out of capture range', () => {
      const captured = system.beginCapture(500, 0)
      expect(captured).toBe(false)
      expect(system.state).toBe('free')
    })
  })

  // ─── cancelApproach ───────────────────────────────────────────────────────

  describe('cancelApproach', () => {
    it('transitions approaching -> free and clears the target', () => {
      system.beginCapture(20, 0)
      expect(system.state).toBe('approaching')
      system.cancelApproach()
      expect(system.state).toBe('free')
    })
  })

  // ─── checkArrival ─────────────────────────────────────────────────────────

  describe('checkArrival', () => {
    it('transitions approaching -> orbiting when shuttle is at orbit radius', () => {
      system.beginCapture(20, 0)
      expect(system.state).toBe('approaching')
      // orbitRadius = 14.4. Place shuttle at orbitRadius from Alpha (at 0,0).
      // Within 15% tolerance: [12.24, 16.56]
      const arrived = system.checkArrival(14.4, 0)
      expect(arrived).toBe(true)
      expect(system.state).toBe('orbiting')
    })

    it('does not arrive when shuttle is too far from orbit radius', () => {
      system.beginCapture(20, 0)
      // 100 units away — orbit radius is 14.4, far outside tolerance
      const arrived = system.checkArrival(100, 0)
      expect(arrived).toBe(false)
      expect(system.state).toBe('approaching')
    })

    it('does nothing when state is free', () => {
      const arrived = system.checkArrival(14.4, 0)
      expect(arrived).toBe(false)
      expect(system.state).toBe('free')
    })
  })

  // ─── launchSlingshot ──────────────────────────────────────────────────────

  describe('launchSlingshot', () => {
    it('returns a velocity and transitions orbiting -> free', () => {
      system.beginCapture(20, 0)
      system.checkArrival(14.4, 0)
      expect(system.state).toBe('orbiting')

      const vel = system.launchSlingshot(0, 0.016)
      expect(vel).toHaveProperty('vx')
      expect(vel).toHaveProperty('vz')
      expect(system.state).toBe('free')
    })

    it('returns non-zero slingshot speed', () => {
      system.beginCapture(20, 0)
      system.checkArrival(14.4, 0)
      // Tick orbit a bit to build up planet delta tracking
      system.tickOrbit(0.016)
      system.tickOrbit(0.016)
      const vel = system.launchSlingshot(0, 0.016)
      const speed = Math.sqrt(vel.vx * vel.vx + vel.vz * vel.vz)
      expect(speed).toBeGreaterThan(0)
    })
  })

  // ─── tickOrbit ────────────────────────────────────────────────────────────

  describe('tickOrbit', () => {
    it('returns orbit position offset from planet center while orbiting', () => {
      system.beginCapture(20, 0)
      system.checkArrival(14.4, 0)
      const pos = system.tickOrbit(0.016)
      expect(pos).not.toBeNull()
      expect(pos).toHaveProperty('x')
      expect(pos).toHaveProperty('z')
    })

    it('returns null when not orbiting', () => {
      const pos = system.tickOrbit(0.016)
      expect(pos).toBeNull()
    })
  })

  // ─── getApproachTarget ────────────────────────────────────────────────────

  describe('getApproachTarget', () => {
    it('returns a world position when approaching', () => {
      system.beginCapture(20, 0)
      const target = system.getApproachTarget()
      expect(target).not.toBeNull()
      expect(target).toHaveProperty('x')
      expect(target).toHaveProperty('z')
    })

    it('returns null when free', () => {
      const target = system.getApproachTarget()
      expect(target).toBeNull()
    })
  })

  // ─── getHudState ──────────────────────────────────────────────────────────

  describe('getHudState', () => {
    it('returns free state when no body in range', () => {
      const hud = system.getHudState(500, 0)
      expect(hud.state).toBe('free')
      expect(hud.nearestBodyName).toBeNull()
    })

    it('returns nearest body name when in range', () => {
      const hud = system.getHudState(20, 0)
      expect(hud.nearestBodyName).toBe('Alpha')
    })

    it('includes orbital speed and slingshot speed fields', () => {
      const hud = system.getHudState(500, 0)
      expect(typeof hud.orbitalSpeed).toBe('number')
      expect(typeof hud.slingshotSpeed).toBe('number')
    })
  })
})
