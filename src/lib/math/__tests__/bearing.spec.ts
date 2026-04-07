import { describe, it, expect } from 'vitest'
import {
  normalizeCompassDeg,
  headingRadToCompassDeg,
  worldBearingDegTo,
  signedRelativeBearingDeg,
} from '../bearing'

describe('normalizeCompassDeg', () => {
  it('normalizes positive degrees', () => {
    expect(normalizeCompassDeg(450)).toBeCloseTo(90)
  })

  it('normalizes negative degrees', () => {
    expect(normalizeCompassDeg(-90)).toBeCloseTo(270)
  })

  it('leaves 0-360 unchanged', () => {
    expect(normalizeCompassDeg(180)).toBeCloseTo(180)
  })
})

describe('headingRadToCompassDeg', () => {
  it('converts 0 rad (facing +Z) to 0 compass deg', () => {
    expect(headingRadToCompassDeg(0)).toBeCloseTo(0)
  })

  it('converts PI/2 rad (facing -X) to 270 compass deg', () => {
    expect(headingRadToCompassDeg(Math.PI / 2)).toBeCloseTo(270)
  })

  it('converts -PI/2 rad (facing +X) to 90 compass deg', () => {
    expect(headingRadToCompassDeg(-Math.PI / 2)).toBeCloseTo(90)
  })

  it('converts PI rad (facing -Z) to 180 compass deg', () => {
    expect(headingRadToCompassDeg(Math.PI)).toBeCloseTo(180)
  })
})

describe('worldBearingDegTo', () => {
  it('returns 0 for target directly ahead (+Z)', () => {
    expect(worldBearingDegTo(0, 0, 0, 10)).toBeCloseTo(0)
  })

  it('returns 90 for target to the east (+X)', () => {
    expect(worldBearingDegTo(0, 0, 10, 0)).toBeCloseTo(90)
  })

  it('returns 180 for target behind (-Z)', () => {
    expect(worldBearingDegTo(0, 0, 0, -10)).toBeCloseTo(180)
  })
})

describe('signedRelativeBearingDeg', () => {
  it('returns 0 when heading matches bearing', () => {
    expect(signedRelativeBearingDeg(90, 90)).toBeCloseTo(0)
  })

  it('returns positive for clockwise turn', () => {
    expect(signedRelativeBearingDeg(0, 90)).toBeCloseTo(90)
  })

  it('returns negative for counter-clockwise turn', () => {
    expect(signedRelativeBearingDeg(90, 0)).toBeCloseTo(-90)
  })

  it('handles wrap-around (350 to 10)', () => {
    expect(signedRelativeBearingDeg(350, 10)).toBeCloseTo(20)
  })

  it('handles wrap-around (10 to 350)', () => {
    expect(signedRelativeBearingDeg(10, 350)).toBeCloseTo(-20)
  })
})
