/**
 * Tests for persistent tactical-map world-line history sampling.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-map-overlay-design.md
 */
import { describe, expect, it } from 'vitest'
import { appendWorldLinePoint, shouldRecordWorldLinePoint } from '../worldLineHistory'

describe('appendWorldLinePoint', () => {
  it('stores the first point of a run', () => {
    const history = appendWorldLinePoint([], { x: 10, z: 20 }, 5)

    expect(history).toEqual([{ x: 10, z: 20 }])
  })

  it('does not append points that are closer than the sampling distance', () => {
    const history = appendWorldLinePoint([{ x: 0, z: 0 }], { x: 3, z: 0 }, 5)

    expect(history).toEqual([{ x: 0, z: 0 }])
  })

  it('appends a point once the ship has moved far enough', () => {
    const history = appendWorldLinePoint([{ x: 0, z: 0 }], { x: 6, z: 8 }, 5)

    expect(history).toEqual([{ x: 0, z: 0 }, { x: 6, z: 8 }])
  })

  it('preserves existing history order when appending new samples', () => {
    const history = appendWorldLinePoint(
      [{ x: 0, z: 0 }, { x: 10, z: 0 }],
      { x: 20, z: 0 },
      5,
    )

    expect(history).toEqual([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 20, z: 0 }])
  })
})

describe('shouldRecordWorldLinePoint', () => {
  it('records while driving freely', () => {
    expect(shouldRecordWorldLinePoint('free', false)).toBe(true)
  })

  it('does not record while orbiting', () => {
    expect(shouldRecordWorldLinePoint('orbiting', false)).toBe(false)
  })

  it('does not record while approaching orbit', () => {
    expect(shouldRecordWorldLinePoint('approaching', false)).toBe(false)
  })

  it('does not record while dead', () => {
    expect(shouldRecordWorldLinePoint('free', true)).toBe(false)
  })
})
