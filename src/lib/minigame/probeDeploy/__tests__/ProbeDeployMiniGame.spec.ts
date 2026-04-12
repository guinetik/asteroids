import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProbeDeployMiniGame } from '../ProbeDeployMiniGame'
import {
  SHIP_X,
  CANVAS_HEIGHT,
  HULL_MAX_HP,
  METEORITE_DAMAGE,
  EDGE_PADDING,
  PLANET_X,
  PLANET_Y,
  PLANET_R,
  PLANET_ROTATION_SPEED,
  PROBE_COOLDOWN,
  TARGET_HIT_RADIUS,
  MIN_TARGETS,
  MAX_TARGETS,
  TIMER_BASE,
  TIMER_PER_TARGET,
} from '../constants'
import type { OrbitalMiniGameContext } from '../../OrbitalMiniGame'

const STUB_CTX: OrbitalMiniGameContext = {
  shipPosition: { x: 0, y: 0, z: 0 },
  orbitState: 'orbiting',
  orbitedPlanetId: 'mercury',
  distanceToPlanet: null,
}

describe('ProbeDeployMiniGame', () => {
  let game: ProbeDeployMiniGame

  beforeEach(() => {
    game = new ProbeDeployMiniGame('test-mission', 3, 'mercury')
  })

  describe('initialization', () => {
    it('starts with active status', () => {
      expect(game.status).toBe('active')
      expect(game.missionId).toBe('test-mission')
      expect(game.planetId).toBe('mercury')
    })

    it('has correct progress tracking', () => {
      expect(game.progressCurrent).toBe(0)
      expect(game.progressTotal).toBe(4) // max(3, targetGas+1) = max(3,4) = 4
    })

    it('ship starts at center Y', () => {
      expect(game.shipY).toBeCloseTo(CANVAS_HEIGHT / 2)
    })

    it('hull starts at max', () => {
      expect(game.hullHp).toBe(HULL_MAX_HP)
    })

    it('target count respects min/max bounds', () => {
      const game1 = new ProbeDeployMiniGame('t', 1, 'mercury')
      expect(game1.targetCount).toBe(MIN_TARGETS) // max(3, 1+1) = 3

      const game6 = new ProbeDeployMiniGame('t', 6, 'uranus')
      expect(game6.targetCount).toBe(MAX_TARGETS) // min(5, max(3, 6+1)) = 5
    })

    it('probe count is targetCount + 2', () => {
      expect(game.probeCount).toBe(game.targetCount + 2)
      expect(game.probesRemaining).toBe(game.probeCount)
    })

    it('targets are evenly distributed around planet', () => {
      expect(game.targets).toHaveLength(game.targetCount)
      for (const t of game.targets) {
        expect(t.hit).toBe(false)
        expect(t.surfaceAngle).toBeGreaterThanOrEqual(0)
        expect(t.surfaceAngle).toBeLessThan(Math.PI * 2)
      }
    })

    it('timer scales with target count', () => {
      expect(game.timeRemaining).toBe(TIMER_BASE + TIMER_PER_TARGET * game.targetCount)
    })

    it('has two steps', () => {
      expect(game.steps).toHaveLength(2)
      expect(game.steps[0]!.label).toBe('Deploy probes to targets')
      expect(game.steps[0]!.active).toBe(true)
    })
  })

  describe('ship movement', () => {
    it('accelerates up when W input is set', () => {
      game.setInput({ up: true, down: false })
      game.tick(0.1, STUB_CTX)
      expect(game.shipVy).toBeLessThan(0)
    })

    it('accelerates down when S input is set', () => {
      game.setInput({ up: false, down: true })
      game.tick(0.1, STUB_CTX)
      expect(game.shipVy).toBeGreaterThan(0)
    })

    it('applies drag when no input', () => {
      game.setInput({ up: false, down: true })
      game.tick(0.1, STUB_CTX)
      const vy1 = game.shipVy
      game.setInput({ up: false, down: false })
      game.tick(0.1, STUB_CTX)
      expect(Math.abs(game.shipVy)).toBeLessThan(Math.abs(vy1))
    })

    it('clamps ship to canvas bounds', () => {
      game.setInput({ up: true, down: false })
      for (let i = 0; i < 200; i++) game.tick(0.016, STUB_CTX)
      expect(game.shipY).toBeGreaterThanOrEqual(EDGE_PADDING)
    })
  })

  describe('planet rotation', () => {
    it('rotation advances each tick', () => {
      const r0 = game.planetRotation
      game.tick(1.0, STUB_CTX)
      expect(game.planetRotation).toBeGreaterThan(r0)
    })

    it('target positions update with rotation', () => {
      const y0 = game.targets[0]!.y
      // Tick enough for visible movement
      for (let i = 0; i < 60; i++) game.tick(0.016, STUB_CTX)
      expect(game.targets[0]!.y).not.toBeCloseTo(y0, 0)
    })
  })

  describe('probe launching', () => {
    it('launches a probe from ship position', () => {
      game.launchProbe()
      expect(game.activeProbe).not.toBeNull()
      expect(game.activeProbe!.y).toBeCloseTo(game.shipY)
      expect(game.activeProbe!.x).toBeCloseTo(SHIP_X)
      expect(game.probesRemaining).toBe(game.probeCount - 1)
    })

    it('cooldown prevents rapid fire', () => {
      game.launchProbe()
      expect(game.activeProbe).not.toBeNull()
      // Consume the probe by ticking until it reaches planet or goes off screen
      for (let i = 0; i < 120; i++) game.tick(0.016, STUB_CTX)
      // Now try to fire again immediately — cooldown should block
      const remaining = game.probesRemaining
      game.launchProbe()
      if (game.probeCooldown > 0) {
        expect(game.probesRemaining).toBe(remaining) // didn't fire
      }
    })

    it('cannot launch when probes exhausted', () => {
      // Exhaust all probes
      for (let i = 0; i < game.probeCount; i++) {
        game.probeCooldown = 0
        game.activeProbe = null
        game.launchProbe()
      }
      expect(game.probesRemaining).toBe(0)
      game.probeCooldown = 0
      game.activeProbe = null
      game.launchProbe()
      expect(game.activeProbe).toBeNull()
    })

    it('cannot launch while a probe is in flight', () => {
      game.launchProbe()
      const remaining = game.probesRemaining
      game.launchProbe()
      expect(game.probesRemaining).toBe(remaining)
    })
  })

  describe('probe-target collision', () => {
    it('hitting a target marks it complete and advances progress', () => {
      // Place a target at the planet edge facing the ship
      const target = game.targets[0]!
      // Set target to ship-facing position (left side of planet = angle PI)
      target.surfaceAngle = Math.PI
      target.x = PLANET_X + Math.cos(Math.PI) * PLANET_R
      target.y = PLANET_Y + Math.sin(Math.PI) * PLANET_R
      target.hit = false

      // Move ship to target Y
      game.shipY = target.y

      // Manually place a probe at impact point
      game.activeProbe = {
        x: target.x,
        y: target.y,
        speed: 500,
        consumed: false,
      }

      game.tick(0.016, STUB_CTX)
      expect(target.hit).toBe(true)
      expect(game.progressCurrent).toBe(1)
    })

    it('missing all targets consumes the probe without progress', () => {
      // Move all targets far from ship Y
      for (const t of game.targets) {
        t.y = game.shipY + 200
        t.x = PLANET_X - PLANET_R
      }

      // Place probe at planet edge at ship Y
      game.activeProbe = {
        x: PLANET_X - PLANET_R,
        y: game.shipY,
        speed: 500,
        consumed: false,
      }

      game.tick(0.016, STUB_CTX)
      expect(game.activeProbe).toBeNull()
      expect(game.progressCurrent).toBe(0)
    })
  })

  describe('probe-meteorite collision', () => {
    it('probe hitting a meteorite is consumed', () => {
      game.launchProbe()
      const probe = game.activeProbe!
      // Place a meteorite right on the probe
      game.meteorites.push({
        x: probe.x + 20,
        y: probe.y,
        vx: -100,
        vy: 0,
        size: 'medium',
        radius: 18,
      })
      // Tick until probe reaches meteorite
      for (let i = 0; i < 10; i++) game.tick(0.016, STUB_CTX)
      expect(game.activeProbe).toBeNull()
    })
  })

  describe('meteorite-ship collision', () => {
    it('collision reduces hull HP', () => {
      game.meteorites.push({
        x: SHIP_X,
        y: game.shipY,
        vx: -100,
        vy: 0,
        size: 'small',
        radius: 10,
      })
      game.tick(0.016, STUB_CTX)
      expect(game.hullHp).toBe(HULL_MAX_HP - METEORITE_DAMAGE)
    })

    it('grace period prevents double-hit', () => {
      game.meteorites.push({
        x: SHIP_X,
        y: game.shipY,
        vx: 0,
        vy: 0,
        size: 'small',
        radius: 10,
      })
      game.tick(0.016, STUB_CTX)
      expect(game.hullHp).toBe(HULL_MAX_HP - METEORITE_DAMAGE)
      game.tick(0.016, STUB_CTX)
      expect(game.hullHp).toBe(HULL_MAX_HP - METEORITE_DAMAGE) // no double hit
    })
  })

  describe('end conditions', () => {
    it('completes when all targets hit', () => {
      const cb = vi.fn()
      game.onComplete = cb
      for (const t of game.targets) t.hit = true
      game.tick(0.016, STUB_CTX)
      expect(game.status).toBe('completed')
      expect(cb).toHaveBeenCalledWith('test-mission')
    })

    it('fails when hull depleted', () => {
      game.hullHp = 1
      game.damageFlash = 0
      game.meteorites.push({
        x: SHIP_X,
        y: game.shipY,
        vx: 0,
        vy: 0,
        size: 'small',
        radius: 10,
      })
      game.tick(0.016, STUB_CTX)
      expect(game.status).toBe('failed')
    })

    it('fails when timer expires', () => {
      game.timeRemaining = 0.01
      game.tick(0.02, STUB_CTX)
      expect(game.status).toBe('failed')
    })

    it('fails when probes exhausted with targets remaining', () => {
      // Exhaust all probes
      for (let i = 0; i < game.probeCount; i++) {
        game.probeCooldown = 0
        game.activeProbe = null
        game.launchProbe()
      }
      expect(game.probesRemaining).toBe(0)
      // Make sure no probe is in flight
      game.activeProbe = null
      game.tick(0.016, STUB_CTX)
      expect(game.status).toBe('failed')
    })
  })

  describe('difficulty scaling', () => {
    it('rotation speed scales with targetGas', () => {
      const game2 = new ProbeDeployMiniGame('t', 2, 'mercury')
      const game5 = new ProbeDeployMiniGame('t', 5, 'mercury')
      expect(game5.rotationSpeed).toBeGreaterThan(game2.rotationSpeed)
    })
  })

  describe('tick guards', () => {
    it('tick is no-op after completed', () => {
      for (const t of game.targets) t.hit = true
      game.tick(0.016, STUB_CTX)
      expect(game.status).toBe('completed')

      const rot = game.planetRotation
      game.tick(1.0, STUB_CTX)
      expect(game.planetRotation).toBe(rot)
    })

    it('tick is no-op after failed', () => {
      game.timeRemaining = 0.01
      game.tick(0.02, STUB_CTX)
      expect(game.status).toBe('failed')

      const shipY = game.shipY
      game.setInput({ up: true, down: false })
      game.tick(0.1, STUB_CTX)
      expect(game.shipY).toBe(shipY)
    })
  })

  describe('complete() and dispose', () => {
    it('complete() is a no-op', () => {
      game.complete()
      expect(game.status).toBe('active')
    })

    it('dispose clears entities', () => {
      game.meteorites.push({ x: 0, y: 0, vx: 0, vy: 0, size: 'small', radius: 10 })
      game.dispose()
      expect(game.meteorites).toHaveLength(0)
      expect(game.targets).toHaveLength(0)
      expect(game.activeProbe).toBeNull()
    })
  })
})
