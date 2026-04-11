import { describe, it, expect, beforeEach } from 'vitest'
import { LogisticsRouteMiniGame } from '../LogisticsRouteMiniGame'
import {
  SHIP_START_X,
  SHIP_START_Y,
  HULL_MAX_HP,
  MIN_MANIFEST_LENGTH,
  EDGE_PADDING,
} from '../constants'
import type { OrbitalMiniGameContext } from '../../OrbitalMiniGame'

const STUB_CTX: OrbitalMiniGameContext = {
  shipPosition: { x: 0, y: 0, z: 0 },
  orbitState: 'orbiting',
  orbitedPlanetId: 'earth',
  distanceToPlanet: null,
}

describe('LogisticsRouteMiniGame', () => {
  let game: LogisticsRouteMiniGame

  beforeEach(() => {
    game = new LogisticsRouteMiniGame('test-mission', 4)
  })

  describe('initialization', () => {
    it('starts with active status', () => {
      expect(game.status).toBe('active')
      expect(game.missionId).toBe('test-mission')
    })

    it('has correct progress tracking', () => {
      expect(game.progressCurrent).toBe(0)
      expect(game.progressTotal).toBe(4)
    })

    it('ship starts at configured position', () => {
      expect(game.shipX).toBeCloseTo(SHIP_START_X)
      expect(game.shipY).toBeCloseTo(SHIP_START_Y)
    })

    it('hull starts at max', () => {
      expect(game.hullHp).toBe(HULL_MAX_HP)
      expect(game.hullMaxHp).toBe(HULL_MAX_HP)
    })

    it('manifest length is max(4, targetGas)', () => {
      expect(game.manifest).toHaveLength(4)
      const game6 = new LogisticsRouteMiniGame('t', 6)
      expect(game6.manifest).toHaveLength(6)
    })

    it('manifest length floors at MIN_MANIFEST_LENGTH for low targetGas', () => {
      const game2 = new LogisticsRouteMiniGame('t', 2)
      expect(game2.manifest).toHaveLength(MIN_MANIFEST_LENGTH)
    })

    it('manifest contains valid symbol types', () => {
      const validTypes = ['star', 'diamond', 'circle', 'triangle', 'square']
      for (const sym of game.manifest) {
        expect(validTypes).toContain(sym)
      }
    })

    it('manifestIndex starts at 0', () => {
      expect(game.manifestIndex).toBe(0)
    })

    it('has two steps', () => {
      expect(game.steps).toHaveLength(2)
      expect(game.steps[0]!.label).toBe('Collect route symbols')
      expect(game.steps[0]!.active).toBe(true)
      expect(game.steps[1]!.label).toBe('Mission complete')
      expect(game.steps[1]!.active).toBe(false)
    })
  })

  describe('ship movement', () => {
    it('accelerates down when S input is set', () => {
      game.setInput({ up: false, down: true, left: false, right: false })
      game.tick(0.1, STUB_CTX)
      expect(game.shipVy).toBeGreaterThan(0)
    })

    it('accelerates up when W input is set', () => {
      game.setInput({ up: true, down: false, left: false, right: false })
      game.tick(0.1, STUB_CTX)
      expect(game.shipVy).toBeLessThan(0)
    })

    it('applies drag when no input', () => {
      game.setInput({ up: false, down: true, left: false, right: false })
      game.tick(0.1, STUB_CTX)
      const vy1 = game.shipVy
      game.setInput({ up: false, down: false, left: false, right: false })
      game.tick(0.1, STUB_CTX)
      expect(Math.abs(game.shipVy)).toBeLessThan(Math.abs(vy1))
    })

    it('soft spring pulls ship toward center when no horizontal input', () => {
      game.shipX = SHIP_START_X + 100
      game.shipVx = 0
      game.setInput({ up: false, down: false, left: false, right: false })
      game.tick(0.1, STUB_CTX)
      expect(game.shipVx).toBeLessThan(0)
    })

    it('horizontal input can fight the spring', () => {
      game.shipX = SHIP_START_X + 50
      game.shipVx = 0
      game.setInput({ up: false, down: false, left: false, right: true })
      game.tick(0.1, STUB_CTX)
      expect(game.shipVx).toBeGreaterThan(0)
    })

    it('clamps ship position to canvas bounds', () => {
      game.setInput({ up: true, down: false, left: true, right: false })
      for (let i = 0; i < 200; i++) game.tick(0.016, STUB_CTX)
      expect(game.shipX).toBeGreaterThanOrEqual(EDGE_PADDING)
      expect(game.shipY).toBeGreaterThanOrEqual(EDGE_PADDING)
    })

    it('no gravity — ship stays still with no input', () => {
      const y0 = game.shipY
      game.tick(0.5, STUB_CTX)
      expect(game.shipY).toBeCloseTo(y0, 0)
    })
  })
})
