import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LogisticsRouteMiniGame } from '../LogisticsRouteMiniGame'
import {
  SHIP_START_X,
  SHIP_START_Y,
  HULL_MAX_HP,
  MIN_MANIFEST_LENGTH,
  EDGE_PADDING,
  TRAFFIC_DAMAGE,
  BASE_SCROLL_SPEED,
} from '../constants'
import type { OrbitalMiniGameContext } from '../../OrbitalMiniGame'
import type { RouteSymbolType } from '../types'

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

  describe('symbol collection', () => {
    it('collecting the correct manifest symbol advances manifestIndex', () => {
      const targetType = game.manifest[0]!
      game.symbols.push({
        x: game.shipX,
        y: game.shipY,
        type: targetType,
        lane: 0,
        collected: false,
      })
      game.tick(0.016, STUB_CTX)
      expect(game.manifestIndex).toBe(1)
    })

    it('collecting the wrong symbol does not advance manifestIndex', () => {
      const targetType = game.manifest[0]!
      const wrongTypes = (['star', 'diamond', 'circle', 'triangle', 'square'] as RouteSymbolType[]).filter(
        (t) => t !== targetType,
      )
      game.symbols.push({
        x: game.shipX,
        y: game.shipY,
        type: wrongTypes[0]!,
        lane: 0,
        collected: false,
      })
      game.tick(0.016, STUB_CTX)
      expect(game.manifestIndex).toBe(0)
    })

    it('symbol out of range is not collected', () => {
      const targetType = game.manifest[0]!
      game.symbols.push({
        x: game.shipX + 200,
        y: game.shipY,
        type: targetType,
        lane: 0,
        collected: false,
      })
      game.tick(0.016, STUB_CTX)
      expect(game.manifestIndex).toBe(0)
    })
  })

  describe('traffic collisions', () => {
    it('collision reduces hull HP by TRAFFIC_DAMAGE', () => {
      game.traffic.push({
        x: game.shipX,
        y: game.shipY,
        speed: 100,
        size: 0.8,
        lane: 0,
        alpha: 0.5,
      })
      game.tick(0.016, STUB_CTX)
      expect(game.hullHp).toBe(HULL_MAX_HP - TRAFFIC_DAMAGE)
    })

    it('grace period prevents double-hit', () => {
      game.traffic.push({
        x: game.shipX,
        y: game.shipY,
        speed: 0,
        size: 0.8,
        lane: 0,
        alpha: 0.5,
      })
      game.tick(0.016, STUB_CTX)
      expect(game.hullHp).toBe(HULL_MAX_HP - TRAFFIC_DAMAGE)
      game.tick(0.016, STUB_CTX)
      expect(game.hullHp).toBe(HULL_MAX_HP - TRAFFIC_DAMAGE)
    })

    it('collision applies knockback', () => {
      const vxBefore = game.shipVx
      game.traffic.push({
        x: game.shipX + 5,
        y: game.shipY,
        speed: 0,
        size: 0.8,
        lane: 0,
        alpha: 0.5,
      })
      game.tick(0.016, STUB_CTX)
      expect(game.shipVx).not.toBe(vxBefore)
    })
  })

  describe('end conditions', () => {
    it('completes when all manifest symbols are collected', () => {
      const cb = vi.fn()
      game.onComplete = cb

      for (let i = 0; i < game.manifest.length; i++) {
        game.symbols.push({
          x: game.shipX,
          y: game.shipY,
          type: game.manifest[i]!,
          lane: 0,
          collected: false,
        })
        game.tick(0.016, STUB_CTX)
      }

      expect(game.status).toBe('completed')
      expect(cb).toHaveBeenCalledWith('test-mission')
    })

    it('fails when hull HP reaches 0', () => {
      const hits = Math.ceil(HULL_MAX_HP / TRAFFIC_DAMAGE)
      for (let i = 0; i < hits; i++) {
        game.damageFlash = 0
        ;(game as unknown as { gracePeriod: number }).gracePeriod = 0
        game.traffic.push({
          x: game.shipX,
          y: game.shipY,
          speed: 0,
          size: 0.8,
          lane: 0,
          alpha: 0.5,
        })
        game.tick(0.016, STUB_CTX)
      }

      expect(game.hullHp).toBe(0)
      expect(game.status).toBe('failed')
    })
  })

  describe('difficulty scaling', () => {
    it('scroll speed scales with targetGas above 4', () => {
      const game4 = new LogisticsRouteMiniGame('t', 4)
      const game8 = new LogisticsRouteMiniGame('t', 8)
      expect(game8.scrollSpeed).toBeGreaterThan(game4.scrollSpeed)
    })

    it('max traffic scales with targetGas above 4', () => {
      const game4 = new LogisticsRouteMiniGame('t', 4)
      const game8 = new LogisticsRouteMiniGame('t', 8)
      expect(game8.maxTraffic).toBeGreaterThan(game4.maxTraffic)
    })

    it('targetGas <= 4 uses base scroll speed', () => {
      const game2 = new LogisticsRouteMiniGame('t', 2)
      const game4 = new LogisticsRouteMiniGame('t', 4)
      expect(game2.scrollSpeed).toBe(BASE_SCROLL_SPEED)
      expect(game4.scrollSpeed).toBe(BASE_SCROLL_SPEED)
    })
  })

  describe('tick guards', () => {
    it('tick is no-op after completed', () => {
      for (let i = 0; i < game.manifest.length; i++) {
        game.symbols.push({
          x: game.shipX,
          y: game.shipY,
          type: game.manifest[i]!,
          lane: 0,
          collected: false,
        })
        game.tick(0.016, STUB_CTX)
      }
      expect(game.status).toBe('completed')

      const idx = game.manifestIndex
      game.tick(1.0, STUB_CTX)
      expect(game.manifestIndex).toBe(idx)
    })

    it('tick is no-op after failed', () => {
      game.hullHp = 1
      game.traffic.push({
        x: game.shipX,
        y: game.shipY,
        speed: 0,
        size: 0.8,
        lane: 0,
        alpha: 0.5,
      })
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
    it('clears symbols and traffic', () => {
      game.symbols.push({ x: 100, y: 100, type: 'star', lane: 0, collected: false })
      game.traffic.push({ x: 200, y: 200, speed: 100, size: 0.8, lane: 1, alpha: 0.5 })
      game.dispose()
      expect(game.symbols).toHaveLength(0)
      expect(game.traffic).toHaveLength(0)
    })
  })
})
