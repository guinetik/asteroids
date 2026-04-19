/**
 * Tests for OrbitCaptureSystem domain logic.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-orbit-capture-slingshot-design.md
 */
import { describe, it, expect, beforeEach } from 'vitest'
import orbitConfig from '@/data/shuttle/orbit-capture.json'
import { OrbitCaptureSystem } from '../orbitCapture'
import type { CaptureBody } from '../orbitCapture'

/** Creates a mock CaptureBody at the given world position. */
function makeBody(
  name: string,
  x: number,
  z: number,
  displayRadius = 0.1,
  orbitalSpeedMultiplier = 1,
  captureRadiusMultiplier = 1,
  captureRadiusOverride?: number,
  orbitRadiusOverride?: number,
): CaptureBody {
  return {
    name,
    displayRadius,
    orbitalSpeedMultiplier,
    captureRadiusMultiplier,
    captureRadiusOverride,
    orbitRadiusOverride,
    getWorldX: () => x,
    getWorldY: () => 0,
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

    it('supports per-body capture range overrides', () => {
      const sunLikeBody = makeBody('Sun', 0, 0, 0.15, 1, 0.2)
      const inRangeSystem = new OrbitCaptureSystem([sunLikeBody])
      const outOfRangeSystem = new OrbitCaptureSystem([sunLikeBody])

      expect(inRangeSystem.beginCapture(30, 0)).toBe(true)
      expect(outOfRangeSystem.beginCapture(50, 0)).toBe(false)
    })

    it('supports explicit capture and orbit radii for special bodies', () => {
      const sunLaneBody = makeBody('Sun', 0, 0, 0.15, 12, 1, 50, 50)
      const captureSystem = new OrbitCaptureSystem([sunLaneBody])
      const missSystem = new OrbitCaptureSystem([sunLaneBody])

      expect(captureSystem.beginCapture(49, 0)).toBe(true)
      expect(missSystem.beginCapture(51, 0)).toBe(false)
      expect(captureSystem.checkArrival(50, 0)).toBe(true)
      expect(captureSystem.targetOrbitRadius).toBeCloseTo(50, 5)
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

    it('launches at the full baseline speed when the body is stationary', () => {
      system.beginCapture(20, 0)
      system.checkArrival(14.4, 0)

      const vel = system.launchSlingshot(0, 0.016)
      const speed = Math.sqrt(vel.vx * vel.vx + vel.vz * vel.vz)

      expect(speed).toBeCloseTo(orbitConfig.orbitLaunchSpeed, 5)
    })

    it('gives baseline speed when aiming radially (no alignment bonus)', () => {
      system.beginCapture(20, 0)
      system.checkArrival(14.4, 0)
      system.tickOrbit(0.5)

      // At orbitAngle≈0, aiming radially outward (angle=0) gives near-zero alignment
      const vel = system.launchSlingshot(0, 0.5)

      expect(vel.vx).toBeCloseTo(orbitConfig.orbitLaunchSpeed, 1)
      expect(vel.vz).toBeCloseTo(0, 5)
    })

    it('applies retrograde speed bonus when aiming opposite the orbit tangent', () => {
      system.beginCapture(20, 0)
      system.checkArrival(14.4, 0)
      system.tickOrbit(0.5)

      // At orbitAngle≈0, aiming at PI/2 is retrograde (alignment≈-1)
      // Speed = baseSpeed * (1 + retrogradeSpeedMultiplier * 1) = baseSpeed * 1.15
      const vel = system.launchSlingshot(Math.PI / 2, 0.5)
      const speed = Math.sqrt(vel.vx ** 2 + vel.vz ** 2)

      expect(vel.vx).toBeCloseTo(0, 5)
      expect(speed).toBeGreaterThan(orbitConfig.orbitLaunchSpeed)
    })

    it('gives baseline speed when aiming retrograde-ish without full retrograde alignment', () => {
      system.beginCapture(20, 0)
      system.checkArrival(14.4, 0)
      system.tickOrbit(0.5)

      // At orbitAngle≈0, aiming at PI (−X) has near-zero alignment (radial inward)
      const vel = system.launchSlingshot(Math.PI, 0.5)

      expect(vel.vx).toBeCloseTo(-orbitConfig.orbitLaunchSpeed, 1)
      expect(vel.vz).toBeCloseTo(0, 5)
    })

    it('scales orbit and launch speed for high-speed bodies like the sun', () => {
      const sunBody = makeBody('Sun', 0, 0, 0.15, 12)
      const sunSystem = new OrbitCaptureSystem([sunBody])

      expect(sunSystem.beginCapture(20, 0)).toBe(true)
      expect(sunSystem.checkArrival(21.6, 0)).toBe(true)

      const hud = sunSystem.getHudState(21.6, 0)
      const vel = sunSystem.launchSlingshot(0, 0.016)
      const speed = Math.sqrt(vel.vx * vel.vx + vel.vz * vel.vz)

      const sunBaseline = orbitConfig.orbitLaunchSpeed * 12
      expect(hud.orbitalSpeed).toBeCloseTo(sunBaseline, 5)
      expect(speed).toBeCloseTo(sunBaseline, 5)
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

describe('OrbitCaptureSystem prograde / retrograde', () => {
  /** Creates a system with one body at origin, displayRadius=5, so orbitRadius is large enough
   *  to place the shuttle at distance 20 within arrival tolerance. */
  function makeSystem() {
    // displayRadius=5 → orbitRadius = max(5*80*1.8, 0.5) = 720 — too large.
    // Use captureRadiusOverride + orbitRadiusOverride to get orbitRadius≈18 and captureRadius≈100.
    const body = makeBody('Test', 0, 0, 5, 1, 1, 100, 18)
    return new OrbitCaptureSystem([body])
  }

  let system: OrbitCaptureSystem

  beforeEach(() => {
    system = makeSystem()
  })

  describe('prograde / retrograde', () => {
    it('returns null when not orbiting', () => {
      expect(system.getProgradeHeading()).toBeNull()
      expect(system.getRetrogradeHeading()).toBeNull()
    })

    it('returns prograde heading perpendicular to radius (tangent in direction of travel)', () => {
      system.beginCapture(20, 0)
      system.checkArrival(20, 0)
      const heading = system.getProgradeHeading()
      expect(heading).not.toBeNull()
      // At orbitAngle=0, prograde direction vector is (-sin(0), cos(0)) = (0, 1) in XZ
      // heading = atan2(-1, 0) = -PI/2
      expect(heading).toBeCloseTo(-Math.PI / 2, 5)
    })

    it('returns retrograde opposite to prograde', () => {
      system.beginCapture(20, 0)
      system.checkArrival(20, 0)
      const pro = system.getProgradeHeading()!
      const retro = system.getRetrogradeHeading()!
      const diff = Math.abs(retro - pro)
      const normalizedDiff = Math.min(diff, 2 * Math.PI - diff)
      expect(normalizedDiff).toBeCloseTo(Math.PI, 5)
    })

    it('returns +1 alignment when facing exactly prograde', () => {
      system.beginCapture(20, 0)
      system.checkArrival(20, 0)
      const prograde = system.getProgradeHeading()!
      expect(system.getAlignment(prograde)).toBeCloseTo(1, 5)
    })

    it('returns -1 alignment when facing exactly retrograde', () => {
      system.beginCapture(20, 0)
      system.checkArrival(20, 0)
      const retro = system.getRetrogradeHeading()!
      expect(system.getAlignment(retro)).toBeCloseTo(-1, 5)
    })

    it('returns ~0 alignment when facing perpendicular to orbit', () => {
      system.beginCapture(20, 0)
      system.checkArrival(20, 0)
      const radialHeading = 0
      expect(Math.abs(system.getAlignment(radialHeading))).toBeLessThan(0.1)
    })

    it('returns null-safe 0 when not orbiting', () => {
      expect(system.getAlignment(0)).toBe(0)
    })
  })

  describe('alignment launch bonus', () => {
    it('gives 1.4x speed when aiming exactly prograde', () => {
      system.beginCapture(20, 0)
      system.checkArrival(20, 0)
      system.tickOrbit(0.016)
      const prograde = system.getProgradeHeading()!
      const result = system.launchSlingshot(prograde, 0.016)
      const speed = Math.sqrt(result.vx ** 2 + result.vz ** 2)
      const baseSpeed = 3.14 // orbitLaunchSpeed from JSON
      expect(speed).toBeCloseTo(baseSpeed * 1.4, 1)
    })

    it('gives 1.0x speed when aiming perpendicular to orbit', () => {
      system.beginCapture(20, 0)
      system.checkArrival(20, 0)
      system.tickOrbit(0.016)
      const radialHeading = 0
      const result = system.launchSlingshot(radialHeading, 0.016)
      const speed = Math.sqrt(result.vx ** 2 + result.vz ** 2)
      const baseSpeed = 3.14
      expect(speed).toBeCloseTo(baseSpeed, 1)
    })

    it('gives up to 1.15x speed when aiming exactly retrograde', () => {
      system.beginCapture(20, 0)
      system.checkArrival(20, 0)
      system.tickOrbit(0.016)
      const retro = system.getRetrogradeHeading()!
      const result = system.launchSlingshot(retro, 0.016)
      const speed = Math.sqrt(result.vx ** 2 + result.vz ** 2)
      const baseSpeed = 3.14
      expect(speed).toBeCloseTo(baseSpeed * 1.15, 1)
    })
  })
})

describe('OrbitCaptureSystem.getNearestPreviewBody', () => {
  // captureRadiusOverride=30 → previewRadius(2x)=60
  // Planet at X=100. Ship at X=60 → dist=40 (inside preview, outside capture).
  // Ship at X=0  → dist=100 (outside preview).
  const bodies = [
    {
      name: 'TestPlanet',
      displayRadius: 1,
      captureRadiusOverride: 30,
      getWorldX: () => 100,
      getWorldY: () => 0,
      getWorldZ: () => 0,
    },
  ]

  it('returns body data when ship is within preview range and heading toward it', () => {
    const system = new OrbitCaptureSystem(bodies)
    // Ship at (60, 0) heading right toward planet at (100, 0)
    // velocity pointing +X (toward planet)
    const result = system.getNearestPreviewBody(60, 0, 1, 0, 2.0)
    expect(result).not.toBeNull()
    expect(result!.name).toBe('TestPlanet')
    expect(result!.orbitRadius).toBeGreaterThan(0)
  })

  it('returns null when ship is outside preview range', () => {
    const system = new OrbitCaptureSystem(bodies)
    // Ship at (0, 0) — far from planet at (100, 0)
    const result = system.getNearestPreviewBody(0, 0, 1, 0, 2.0)
    expect(result).toBeNull()
  })

  it('returns null when ship is heading away from the body', () => {
    const system = new OrbitCaptureSystem(bodies)
    // Ship at (60, 0), velocity pointing -X (away from planet)
    const result = system.getNearestPreviewBody(60, 0, -1, 0, 2.0)
    expect(result).toBeNull()
  })

  it('returns null when ship speed is near zero', () => {
    const system = new OrbitCaptureSystem(bodies)
    const result = system.getNearestPreviewBody(60, 0, 0, 0, 2.0)
    expect(result).toBeNull()
  })

  it('returns null when already captured', () => {
    const system = new OrbitCaptureSystem(bodies)
    // Begin capture first — ship must be within capture radius
    system.beginCapture(100, 0)
    const result = system.getNearestPreviewBody(60, 0, 1, 0, 2.0)
    expect(result).toBeNull()
  })
})
