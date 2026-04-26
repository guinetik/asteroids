import { describe, it, expect } from 'vitest'
import { Vector3 } from 'three'
import { raycastBeam, type BeamTargetInstance } from '../TurretBeamSystem'

function makeInstance(
  spawnIndex: number,
  x: number,
  y: number,
  z: number,
  radius: number,
): BeamTargetInstance {
  return { spawnIndex, worldPosition: new Vector3(x, y, z), radius }
}

describe('raycastBeam', () => {
  const origin = new Vector3(0, 0, 0)
  const forward = new Vector3(0, 0, -1) // negative Z

  it('returns null when no instances are provided', () => {
    const hit = raycastBeam(origin, forward, 100, [])
    expect(hit).toBeNull()
  })

  it('hits a sphere directly in the ray path', () => {
    const instances = [makeInstance(7, 0, 0, -10, 1)]
    const hit = raycastBeam(origin, forward, 100, instances)
    expect(hit).not.toBeNull()
    expect(hit!.spawnIndex).toBe(7)
    expect(hit!.distance).toBeCloseTo(9, 1) // ray enters sphere at z=-9
  })

  it('returns the nearest when multiple targets overlap the ray', () => {
    const instances = [
      makeInstance(1, 0, 0, -20, 1),
      makeInstance(2, 0, 0, -10, 1),
      makeInstance(3, 0, 0, -30, 1),
    ]
    const hit = raycastBeam(origin, forward, 100, instances)
    expect(hit!.spawnIndex).toBe(2)
  })

  it('returns null for targets beyond maxDistance', () => {
    const instances = [makeInstance(5, 0, 0, -50, 1)]
    const hit = raycastBeam(origin, forward, 10, instances)
    expect(hit).toBeNull()
  })

  it('returns null for targets off-axis', () => {
    const instances = [makeInstance(5, 10, 0, -10, 1)]
    const hit = raycastBeam(origin, forward, 100, instances)
    expect(hit).toBeNull()
  })

  it('ignores targets behind the origin', () => {
    const instances = [makeInstance(5, 0, 0, 10, 1)] // positive Z is behind
    const hit = raycastBeam(origin, forward, 100, instances)
    expect(hit).toBeNull()
  })
})
