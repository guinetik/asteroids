import { describe, it, expect } from 'vitest'
import {
  influenceRadius,
  eventHorizonRadius,
  gravityAt,
  checkEventHorizon,
  type GravityConfig,
  type GravitySource,
} from '../gravity'

const MAP_CONFIG: GravityConfig = {
  gravityConstant: 0.08,
  minDistance: 0.3,
  influenceScale: 8,
  eventHorizonScale: 1.2,
}

describe('gravity with default config', () => {
  it('influenceRadius uses default scale 400', () => {
    expect(influenceRadius(1)).toBe(400)
  })

  it('eventHorizonRadius uses default scale 230', () => {
    expect(eventHorizonRadius(1)).toBe(230)
  })

  it('gravityAt returns zero outside influence radius', () => {
    const g = gravityAt(0, 0, 1, 500, 0)
    expect(g.ax).toBe(0)
    expect(g.az).toBe(0)
  })

  it('gravityAt returns nonzero inside influence radius', () => {
    const g = gravityAt(0, 0, 1, 100, 0)
    expect(g.ax).toBeLessThan(0) // source at 0, point at 100 → pull is leftward (negative x)
    expect(g.az).toBe(0)
  })

  it('checkEventHorizon returns null when outside', () => {
    const source: GravitySource = { mass: 1, getWorldX: () => 0, getWorldZ: () => 0 }
    expect(checkEventHorizon([source], 300, 0)).toBeNull()
  })

  it('checkEventHorizon returns source when inside', () => {
    const source: GravitySource = { mass: 1, getWorldX: () => 0, getWorldZ: () => 0 }
    expect(checkEventHorizon([source], 100, 0)).toBe(source)
  })
})

describe('gravity with custom GravityConfig', () => {
  it('influenceRadius uses config scale', () => {
    expect(influenceRadius(1, MAP_CONFIG)).toBe(8)
  })

  it('eventHorizonRadius uses config scale', () => {
    expect(eventHorizonRadius(1, MAP_CONFIG)).toBe(1.2)
  })

  it('gravityAt uses config constants', () => {
    const g = gravityAt(0, 0, 1, 4, 0, MAP_CONFIG)
    expect(g.ax).toBeCloseTo(-0.005, 4) // source at 0, point at 4 → pull is leftward
    expect(g.az).toBe(0)
  })

  it('gravityAt returns zero outside config influence radius', () => {
    const g = gravityAt(0, 0, 1, 10, 0, MAP_CONFIG)
    expect(g.ax).toBe(0)
  })

  it('gravityAt clamps to config minDistance', () => {
    // source at (0,0), point at (0.1,0): dist=0.1 < minDistance=0.3, so force uses 0.3
    // forceMag = G*m / minDist² = 0.08 / 0.09 ≈ 0.8888, direction is preserved (nx=-1)
    const g = gravityAt(0, 0, 1, 0.1, 0, MAP_CONFIG)
    const expected = -(0.08 / (0.3 * 0.3)) // pull leftward at clamped magnitude
    expect(g.ax).toBeCloseTo(expected, 2)
    // verify: going even closer doesn't increase force beyond the clamped value
    const gCloser = gravityAt(0, 0, 1, 0.05, 0, MAP_CONFIG)
    expect(g.ax).toBeCloseTo(gCloser.ax, 4)
  })

  it('checkEventHorizon uses config scale', () => {
    const source: GravitySource = { mass: 1, getWorldX: () => 0, getWorldZ: () => 0 }
    expect(checkEventHorizon([source], 2, 0, MAP_CONFIG)).toBeNull()
    expect(checkEventHorizon([source], 1, 0, MAP_CONFIG)).toBe(source)
  })
})
