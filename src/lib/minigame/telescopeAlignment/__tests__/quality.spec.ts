import { describe, it, expect } from 'vitest'
import { computeQuality, perKnobQuality, ledColor } from '../quality'
import {
  MAX_FOCUS,
  MAX_CHROMA,
  MAX_POINTING,
  QUALITY_WEIGHT_FOCUS,
  QUALITY_WEIGHT_CHROMA,
  QUALITY_WEIGHT_POINTING,
  LED_AMBER_THRESHOLD,
  LED_GREEN_THRESHOLD,
} from '../constants'

describe('computeQuality', () => {
  it('returns 1 when all knobs are zero', () => {
    expect(computeQuality({ focus: 0, chroma: 0, azimuth: 0, elevation: 0 })).toBeCloseTo(1, 6)
  })

  it('returns 1 - weight when only focus is maxed', () => {
    const q = computeQuality({ focus: MAX_FOCUS, chroma: 0, azimuth: 0, elevation: 0 })
    expect(q).toBeCloseTo(1 - QUALITY_WEIGHT_FOCUS, 6)
  })

  it('returns 1 - weight when only chroma is maxed', () => {
    const q = computeQuality({ focus: 0, chroma: MAX_CHROMA, azimuth: 0, elevation: 0 })
    expect(q).toBeCloseTo(1 - QUALITY_WEIGHT_CHROMA, 6)
  })

  it('returns 1 - weight when both pointing axes are maxed (vector length == sqrt(2))', () => {
    const q = computeQuality({
      focus: 0,
      chroma: 0,
      azimuth: MAX_POINTING,
      elevation: MAX_POINTING,
    })
    expect(q).toBeCloseTo(1 - QUALITY_WEIGHT_POINTING, 6)
  })

  it('treats negative and positive knob values identically (abs)', () => {
    const pos = computeQuality({ focus: 4, chroma: 3, azimuth: 15, elevation: -22 })
    const neg = computeQuality({ focus: 4, chroma: 3, azimuth: -15, elevation: 22 })
    expect(pos).toBeCloseTo(neg, 6)
  })

  it('clamps to [0, 1]', () => {
    const q = computeQuality({
      focus: MAX_FOCUS * 10,
      chroma: MAX_CHROMA * 10,
      azimuth: MAX_POINTING * 10,
      elevation: MAX_POINTING * 10,
    })
    expect(q).toBeGreaterThanOrEqual(0)
    expect(q).toBeLessThanOrEqual(1)
  })
})

describe('perKnobQuality', () => {
  it('returns 1 at value 0', () => {
    expect(perKnobQuality(0, MAX_FOCUS)).toBe(1)
  })

  it('returns 0 at value max', () => {
    expect(perKnobQuality(MAX_FOCUS, MAX_FOCUS)).toBe(0)
  })

  it('is symmetric around zero', () => {
    expect(perKnobQuality(-10, MAX_POINTING)).toBeCloseTo(perKnobQuality(10, MAX_POINTING), 6)
  })

  it('returns 1 for zero-range inputs (no division by zero)', () => {
    expect(perKnobQuality(0, 0)).toBe(1)
  })
})

describe('ledColor', () => {
  it('returns red below the amber threshold', () => {
    expect(ledColor(LED_AMBER_THRESHOLD - 0.001)).toBe('red')
    expect(ledColor(0)).toBe('red')
  })

  it('returns amber in [amber, green) band', () => {
    expect(ledColor(LED_AMBER_THRESHOLD)).toBe('amber')
    expect(ledColor(LED_GREEN_THRESHOLD - 0.001)).toBe('amber')
  })

  it('returns green at or above the green threshold', () => {
    expect(ledColor(LED_GREEN_THRESHOLD)).toBe('green')
    expect(ledColor(1)).toBe('green')
  })
})
