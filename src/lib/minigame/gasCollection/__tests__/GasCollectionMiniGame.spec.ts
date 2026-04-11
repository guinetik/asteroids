import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GasCollectionMiniGame } from '../GasCollectionMiniGame'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  MAX_DRONES,
  MAX_AIR_TIME_YIELD,
  DRONE_COLLECT_RADIUS,
  COOK_ZONE_Y,
} from '../constants'
import type { OrbitalMiniGameContext } from '../../OrbitalMiniGame'

const STUB_CTX: OrbitalMiniGameContext = {
  shipPosition: { x: 0, y: 0, z: 0 },
  orbitState: 'orbiting',
  orbitedPlanetId: 'venus',
  distanceToPlanet: 100,
}

describe('GasCollectionMiniGame', () => {
  let game: GasCollectionMiniGame

  beforeEach(() => {
    game = new GasCollectionMiniGame('test-mission', 5)
  })

  describe('initialization', () => {
    it('starts with active status', () => {
      expect(game.status).toBe('active')
      expect(game.missionId).toBe('test-mission')
    })

    it('has correct progress tracking', () => {
      expect(game.progressCurrent).toBe(0)
      expect(game.progressTotal).toBe(5)
    })

    it('starts with max drones available', () => {
      expect(game.dronesRemaining).toBe(MAX_DRONES)
    })

    it('ship starts at center of canvas', () => {
      expect(game.shipX).toBeCloseTo(CANVAS_WIDTH / 2)
      expect(game.shipY).toBeCloseTo(CANVAS_HEIGHT / 2)
    })

    it('has two steps', () => {
      expect(game.steps).toHaveLength(2)
      expect(game.steps[0]!.label).toBe('Collect atmospheric gas')
      expect(game.steps[0]!.active).toBe(true)
      expect(game.steps[1]!.label).toBe('Mission complete')
      expect(game.steps[1]!.active).toBe(false)
    })
  })

  describe('ship movement', () => {
    it('accelerates right when right input is set', () => {
      game.setInput({ up: false, down: false, left: false, right: true })
      game.tick(0.1, STUB_CTX)
      expect(game.shipVx).toBeGreaterThan(0)
    })

    it('accelerates up when up input is set', () => {
      game.setInput({ up: true, down: false, left: false, right: false })
      game.tick(0.1, STUB_CTX)
      expect(game.shipVy).toBeLessThan(0)
    })

    it('applies drag when no input', () => {
      game.setInput({ up: false, down: false, left: false, right: true })
      game.tick(0.1, STUB_CTX)
      const vx1 = game.shipVx
      game.setInput({ up: false, down: false, left: false, right: false })
      game.tick(0.1, STUB_CTX)
      expect(game.shipVx).toBeLessThan(vx1)
    })

    it('clamps ship position to canvas bounds', () => {
      game.setInput({ up: true, down: false, left: true, right: false })
      for (let i = 0; i < 100; i++) game.tick(0.016, STUB_CTX)
      expect(game.shipX).toBeGreaterThanOrEqual(0)
      expect(game.shipY).toBeGreaterThanOrEqual(0)
    })

    it('ship drifts downward from planet gravity', () => {
      const initialVy = game.shipVy
      game.tick(0.5, STUB_CTX)
      expect(game.shipVy).toBeGreaterThan(initialVy)
    })
  })

  describe('cook zone', () => {
    it('fails if ship touches the cook zone', () => {
      game.shipY = COOK_ZONE_Y
      game.tick(0.016, STUB_CTX)
      expect(game.status).toBe('failed')
    })

    it('does not fail above the cook zone', () => {
      game.shipY = COOK_ZONE_Y - 20
      game.tick(0.016, STUB_CTX)
      expect(game.status).toBe('active')
    })
  })

  describe('drone launching', () => {
    it('launchDrone creates a drone', () => {
      game.launchDrone()
      expect(game.drones).toHaveLength(1)
      expect(game.dronesRemaining).toBe(MAX_DRONES - 1)
    })

    it('drone launches from ship position', () => {
      game.launchDrone()
      const drone = game.drones[0]!
      expect(drone.x).toBeCloseTo(game.shipX)
      expect(drone.y).toBeCloseTo(game.shipY)
    })

    it('does nothing when no drones remain', () => {
      for (let i = 0; i < MAX_DRONES; i++) game.launchDrone()
      expect(game.dronesRemaining).toBe(0)
      game.launchDrone()
      expect(game.drones).toHaveLength(MAX_DRONES)
    })

    it('drone accelerates downward under gravity', () => {
      game.launchDrone()
      const initialVy = game.drones[0]!.vy
      game.tick(0.5, STUB_CTX)
      expect(game.drones[0]!.vy).toBeGreaterThan(initialVy)
    })

    it('drone accumulates airTime', () => {
      game.launchDrone()
      game.tick(0.5, STUB_CTX)
      expect(game.drones[0]!.airTime).toBeCloseTo(0.5)
    })
  })

  describe('drone collection', () => {
    it('collecting a drone adds gas based on air time', () => {
      game.launchDrone()
      game.drones[0]!.airTime = 2.0
      game.drones[0]!.x = game.shipX
      game.drones[0]!.y = game.shipY
      game.tick(0.016, STUB_CTX)
      expect(game.drones[0]).toBeUndefined() // collected and cleaned up
      expect(game.gasCollected).toBeCloseTo(2.0)
    })

    it('gas yield is clamped to MAX_AIR_TIME_YIELD', () => {
      game.launchDrone()
      game.drones[0]!.airTime = 10.0
      game.drones[0]!.x = game.shipX
      game.drones[0]!.y = game.shipY
      game.tick(0.016, STUB_CTX)
      expect(game.gasCollected).toBeCloseTo(MAX_AIR_TIME_YIELD)
    })

    it('collection requires proximity within DRONE_COLLECT_RADIUS', () => {
      game.launchDrone()
      game.drones[0]!.airTime = 1.0
      game.drones[0]!.x = game.shipX + DRONE_COLLECT_RADIUS + 10
      game.drones[0]!.y = game.shipY
      game.tick(0.016, STUB_CTX)
      expect(game.drones[0]!.collected).toBe(false)
    })
  })

  describe('drone lost off screen', () => {
    it('drone falling below canvas is removed', () => {
      game.launchDrone()
      game.drones[0]!.y = CANVAS_HEIGHT + 50
      game.tick(0.016, STUB_CTX)
      expect(game.drones).toHaveLength(0)
    })
  })

  describe('completion', () => {
    it('auto-completes when gas gauge reaches target', () => {
      const cb = vi.fn()
      game.onComplete = cb
      game.launchDrone()
      game.drones[0]!.airTime = 3.0
      game.drones[0]!.x = game.shipX
      game.drones[0]!.y = game.shipY
      game.tick(0.016, STUB_CTX)

      game.launchDrone()
      const uncollected = game.drones.find((d) => !d.collected)!
      uncollected.airTime = 3.0
      uncollected.x = game.shipX
      uncollected.y = game.shipY
      game.tick(0.016, STUB_CTX)

      expect(game.gasCollected).toBeGreaterThanOrEqual(5)
      expect(game.status).toBe('completed')
      expect(cb).toHaveBeenCalledWith('test-mission')
    })

    it('fails when all drones spent and gauge not full', () => {
      for (let i = 0; i < MAX_DRONES; i++) {
        game.launchDrone()
      }
      for (const drone of game.drones) {
        drone.y = CANVAS_HEIGHT + 50
      }
      game.tick(0.016, STUB_CTX)
      expect(game.dronesRemaining).toBe(0)
      expect(game.drones).toHaveLength(0)
      expect(game.status).toBe('failed')
    })
  })

  describe('tick guards', () => {
    it('tick is no-op after completed', () => {
      // Force completion by collecting enough gas
      game.launchDrone()
      game.drones[0]!.airTime = MAX_AIR_TIME_YIELD
      game.drones[0]!.x = game.shipX
      game.drones[0]!.y = game.shipY
      game.tick(0.016, STUB_CTX)
      game.launchDrone()
      const d = game.drones.find((d) => !d.collected)!
      d.airTime = MAX_AIR_TIME_YIELD
      d.x = game.shipX
      d.y = game.shipY
      game.tick(0.016, STUB_CTX)

      const gasBefore = game.gasCollected
      game.tick(1.0, STUB_CTX)
      expect(game.gasCollected).toBe(gasBefore)
    })

    it('tick is no-op after failed', () => {
      for (let i = 0; i < MAX_DRONES; i++) game.launchDrone()
      for (const drone of game.drones) drone.y = CANVAS_HEIGHT + 50
      game.tick(0.016, STUB_CTX)
      expect(game.status).toBe('failed')

      const shipX = game.shipX
      game.setInput({ up: false, down: false, left: false, right: true })
      game.tick(0.1, STUB_CTX)
      expect(game.shipX).toBe(shipX)
    })
  })

  describe('complete() method', () => {
    it('is a no-op — completion is automatic', () => {
      game.complete()
      expect(game.status).toBe('active')
    })
  })

  describe('dispose', () => {
    it('does not throw', () => {
      expect(() => game.dispose()).not.toThrow()
    })
  })
})
