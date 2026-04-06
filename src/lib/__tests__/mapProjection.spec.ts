import { describe, it, expect } from 'vitest'
import { findNearestBodies, formatDistance, headingToVector } from '../mapProjection'

describe('findNearestBodies', () => {
  const bodies = [
    { name: 'Sun', x: 0, z: 0, mass: 1.0 },
    { name: 'Earth', x: 100, z: 0, mass: 0.000003 },
    { name: 'Jupiter', x: 500, z: 0, mass: 0.000955 },
    { name: 'Neptune', x: 2000, z: 0, mass: 0.0000515 },
  ]

  it('returns the 3 nearest bodies sorted by distance', () => {
    const result = findNearestBodies(90, 0, bodies, 3)
    expect(result).toHaveLength(3)
    expect(result[0]!.name).toBe('Earth')
    expect(result[1]!.name).toBe('Sun')
    expect(result[2]!.name).toBe('Jupiter')
  })

  it('returns fewer if fewer bodies exist', () => {
    const result = findNearestBodies(0, 0, [bodies[0]!], 3)
    expect(result).toHaveLength(1)
  })

  it('includes distance in each result', () => {
    const result = findNearestBodies(0, 0, bodies, 1)
    expect(result[0]!.distance).toBeCloseTo(0)
  })
})

describe('formatDistance', () => {
  it('formats small distances with 1 decimal', () => {
    expect(formatDistance(5.678)).toBe('5.7')
  })

  it('formats large distances in k units', () => {
    expect(formatDistance(1500)).toBe('1.5k')
  })
})

describe('headingToVector', () => {
  it('converts 0 heading to +X direction', () => {
    const v = headingToVector(0)
    expect(v.x).toBeCloseTo(1)
    expect(v.y).toBeCloseTo(0)
  })

  it('converts PI/2 heading to -Z direction', () => {
    const v = headingToVector(Math.PI / 2)
    expect(v.x).toBeCloseTo(0)
    expect(v.y).toBeCloseTo(-1)
  })
})
