import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GasCollectionMiniGame } from '../GasCollectionMiniGame'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  MAX_DRONES,
  DRONE_COLLECT_RADIUS,
  COOK_ZONE_Y,
  COOK_ZONE_TOLERANCE,
  GAS_PER_PUFF,
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
    game = new GasCollectionMiniGame('test-mission', 3)
  })

  describe('initialization', () => {
    it('starts with active status', () => {
      expect(game.status).toBe('active')
      expect(game.missionId).toBe('test-mission')
    })

    it('has correct progress tracking', () => {
      expect(game.progressCurrent).toBe(0)
      expect(game.progressTotal).toBe(3)
    })

    it('starts with max drones available', () => {
      expect(game.dronesRemaining).toBe(MAX_DRONES)
    })

    it('ship starts at upper third of canvas', () => {
      expect(game.shipX).toBeCloseTo(CANVAS_WIDTH / 2)
      expect(game.shipY).toBeCloseTo(CANVAS_HEIGHT * 0.3)
    })

    it('ship starts facing right', () => {
      expect(game.shipFacing).toBe(1)
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

    it('flips facing to -1 when pressing left', () => {
      game.setInput({ up: false, down: false, left: true, right: false })
      game.tick(0.016, STUB_CTX)
      expect(game.shipFacing).toBe(-1)
    })

    it('flips facing back to 1 when pressing right', () => {
      game.setInput({ up: false, down: false, left: true, right: false })
      game.tick(0.016, STUB_CTX)
      game.setInput({ up: false, down: false, left: false, right: true })
      game.tick(0.016, STUB_CTX)
      expect(game.shipFacing).toBe(1)
    })
  })

  describe('cook zone', () => {
    it('does not fail immediately in the cook zone', () => {
      game.shipY = COOK_ZONE_Y
      game.tick(0.016, STUB_CTX)
      expect(game.status).toBe('active')
      expect(game.heatTimer).toBeGreaterThan(0)
    })

    it('fails after spending tolerance time in the cook zone', () => {
      game.shipY = COOK_ZONE_Y
      // Tick enough to exceed tolerance
      const ticks = Math.ceil(COOK_ZONE_TOLERANCE / 0.016) + 1
      for (let i = 0; i < ticks; i++) game.tick(0.016, STUB_CTX)
      expect(game.status).toBe('failed')
    })

    it('heat timer recovers when above the line', () => {
      game.shipY = COOK_ZONE_Y
      game.tick(0.1, STUB_CTX)
      const heated = game.heatTimer
      game.shipY = COOK_ZONE_Y - 30
      game.tick(0.5, STUB_CTX)
      expect(game.heatTimer).toBeLessThan(heated)
    })

    it('does not accumulate heat above the cook zone', () => {
      game.shipY = COOK_ZONE_Y - 20
      game.tick(0.5, STUB_CTX)
      expect(game.heatTimer).toBe(0)
    })
  })

  describe('drone launching', () => {
    it('launchDrone creates a drone with gasLoaded=0', () => {
      game.launchDrone()
      expect(game.drones).toHaveLength(1)
      expect(game.dronesRemaining).toBe(MAX_DRONES - 1)
      expect(game.drones[0]!.gasLoaded).toBe(0)
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

    it('drone vy increases from gravity over short tick', () => {
      game.launchDrone()
      const initialVy = game.drones[0]!.vy
      game.tick(0.016, STUB_CTX)
      expect(game.drones[0]!.vy).toBeGreaterThan(initialVy)
    })

    it('drone accumulates airTime', () => {
      game.launchDrone()
      game.tick(0.016, STUB_CTX)
      expect(game.drones[0]!.airTime).toBeGreaterThan(0)
    })
  })

  describe('gas puffs', () => {
    it('spawns gas puffs over time', () => {
      expect(game.gasPuffs).toHaveLength(0)
      // Tick long enough for at least one puff to spawn
      game.tick(1.0, STUB_CTX)
      expect(game.gasPuffs.length).toBeGreaterThan(0)
    })

    it('puffs rise upward', () => {
      game.tick(1.0, STUB_CTX)
      const puff = game.gasPuffs[0]!
      const y1 = puff.y
      game.tick(0.5, STUB_CTX)
      expect(puff.y).toBeLessThan(y1)
    })

    it('drone passing through puff loads gas', () => {
      // Manually place a puff and a drone at the same spot
      const puff = { x: 200, y: 200, speed: 50, radius: 20, consumed: false, alpha: 0.8 }
      game.gasPuffs.push(puff)
      game.launchDrone()
      game.drones[0]!.x = 200
      game.drones[0]!.y = 200
      game.drones[0]!.airTime = 1.0
      game.tick(0.016, STUB_CTX)
      expect(game.drones[0]!.gasLoaded).toBeCloseTo(GAS_PER_PUFF)
      expect(puff.consumed).toBe(true)
    })

    it('drone can load gas from multiple puffs', () => {
      game.gasPuffs.push(
        { x: 200, y: 200, speed: 50, radius: 20, consumed: false, alpha: 0.8 },
        { x: 202, y: 200, speed: 50, radius: 20, consumed: false, alpha: 0.8 },
      )
      game.launchDrone()
      game.drones[0]!.x = 200
      game.drones[0]!.y = 200
      game.drones[0]!.airTime = 1.0
      game.tick(0.016, STUB_CTX)
      expect(game.drones[0]!.gasLoaded).toBeCloseTo(GAS_PER_PUFF * 2)
    })
  })

  describe('ship-drone collection', () => {
    it('catching a loaded drone banks its gas', () => {
      game.launchDrone()
      game.drones[0]!.gasLoaded = 2
      game.drones[0]!.airTime = 1.0
      game.drones[0]!.x = game.shipX
      game.drones[0]!.y = game.shipY
      game.tick(0.016, STUB_CTX)
      expect(game.gasCollected).toBe(2)
    })

    it('catching an empty drone gives no gas', () => {
      game.launchDrone()
      game.drones[0]!.gasLoaded = 0
      game.drones[0]!.airTime = 1.0
      game.drones[0]!.x = game.shipX
      game.drones[0]!.y = game.shipY
      game.tick(0.016, STUB_CTX)
      expect(game.gasCollected).toBe(0)
    })

    it('collection requires proximity within DRONE_COLLECT_RADIUS', () => {
      game.launchDrone()
      game.drones[0]!.gasLoaded = 1
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

      // Launch drone, load it with enough gas to hit target, catch it
      game.launchDrone()
      game.drones[0]!.gasLoaded = game.targetGas
      game.drones[0]!.airTime = 1.0
      game.drones[0]!.x = game.shipX
      game.drones[0]!.y = game.shipY
      game.tick(0.016, STUB_CTX)

      expect(game.gasCollected).toBeGreaterThanOrEqual(game.targetGas)
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
      game.launchDrone()
      game.drones[0]!.gasLoaded = game.targetGas
      game.drones[0]!.airTime = 1.0
      game.drones[0]!.x = game.shipX
      game.drones[0]!.y = game.shipY
      game.tick(0.016, STUB_CTX)
      expect(game.status).toBe('completed')

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
    it('clears drones and puffs', () => {
      game.launchDrone()
      game.gasPuffs.push({ x: 100, y: 200, speed: 50, radius: 20, consumed: false, alpha: 0.8 })
      expect(game.drones.length).toBeGreaterThan(0)
      expect(game.gasPuffs.length).toBeGreaterThan(0)
      game.dispose()
      expect(game.drones).toHaveLength(0)
      expect(game.gasPuffs).toHaveLength(0)
    })
  })
})
