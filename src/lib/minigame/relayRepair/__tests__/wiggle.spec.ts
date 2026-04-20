import { describe, it, expect } from 'vitest'
import { wigglyPath } from '../wiggle'

describe('wigglyPath', () => {
  it('returns a trivial `M x,y` command when endpoints are identical', () => {
    expect(wigglyPath(10, 10, 10, 10, 0)).toBe('M 10.0,10.0')
  })

  it('starts at (x1, y1) and ends at (x2, y2) regardless of time', () => {
    const path = wigglyPath(0, 0, 100, 0, 1.5)
    expect(path.startsWith('M 0.0,0.0')).toBe(true)
    expect(path.endsWith('100.0,0.0')).toBe(true)
  })

  it('produces different geometry at different times (wave is animated)', () => {
    const a = wigglyPath(0, 0, 100, 0, 0)
    const b = wigglyPath(0, 0, 100, 0, 0.25)
    expect(a).not.toBe(b)
  })

  it('returns the same string for the same inputs', () => {
    expect(wigglyPath(0, 0, 100, 0, 0.3)).toBe(wigglyPath(0, 0, 100, 0, 0.3))
  })
})
