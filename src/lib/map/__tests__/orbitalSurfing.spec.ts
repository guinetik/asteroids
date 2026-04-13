import { describe, expect, it } from 'vitest'
import {
  findNearestOrbitPoint,
  extractOrbitArc,
} from '../orbitalSurfing'

describe('findNearestOrbitPoint', () => {
  // Simple circular orbit: 8 points on a circle of radius 10
  const circlePoints = Array.from({ length: 8 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 8
    return { x: Math.cos(angle) * 10, z: Math.sin(angle) * 10 }
  })

  it('finds the nearest point index within snap distance', () => {
    // Ship at (10.5, 0) — closest to index 0 at (10, 0)
    const result = findNearestOrbitPoint(10.5, 0, circlePoints, 2)
    expect(result).not.toBeNull()
    expect(result!.index).toBe(0)
    expect(result!.distance).toBeCloseTo(0.5, 1)
  })

  it('returns null when no point is within snap distance', () => {
    const result = findNearestOrbitPoint(50, 50, circlePoints, 2)
    expect(result).toBeNull()
  })
})

describe('extractOrbitArc', () => {
  const points = [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 2, z: 0 },
    { x: 3, z: 0 },
    { x: 4, z: 0 },
  ]

  it('extracts forward arc from start to end', () => {
    const arc = extractOrbitArc(points, 1, 3)
    expect(arc).toEqual([
      { x: 1, z: 0 },
      { x: 2, z: 0 },
      { x: 3, z: 0 },
    ])
  })

  it('wraps around when end < start', () => {
    const arc = extractOrbitArc(points, 3, 1)
    expect(arc).toEqual([
      { x: 3, z: 0 },
      { x: 4, z: 0 },
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    ])
  })

  it('returns full loop when start equals end', () => {
    const arc = extractOrbitArc(points, 2, 2)
    expect(arc.length).toBe(points.length + 1)
  })
})
