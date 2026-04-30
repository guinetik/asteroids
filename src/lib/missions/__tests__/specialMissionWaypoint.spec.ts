/**
 * Tests for the special-mission waypoint resolver.
 *
 * @author guinetik
 * @date 2026-04-29
 * @spec docs/superpowers/plans/2026-04-29-special-mission-waypoint-resolution.md
 */
import { describe, expect, it } from 'vitest'
import { resolveSpecialMissionWaypoint } from '../specialMissionWaypoint'

describe('resolveSpecialMissionWaypoint', () => {
  const fallback = { worldX: 0, worldZ: 0 }

  it('returns Hektor position when asteroidId is "hektor" and Hektor is in the position map', () => {
    const positions = new Map([
      ['hektor', { x: 1234, z: 5678 }],
      ['saturn', { x: 9000, z: 100 }],
    ])
    const result = resolveSpecialMissionWaypoint('hektor', positions, fallback)
    expect(result).toEqual({ worldX: 1234, worldZ: 5678 })
  })

  it('falls back when Hektor is not in the position map', () => {
    const positions = new Map<string, { x: number; z: number }>()
    const result = resolveSpecialMissionWaypoint('hektor', positions, fallback)
    expect(result).toEqual(fallback)
  })

  it('places asset-2306-s near Saturn at a deterministic angle when rand is fixed', () => {
    const positions = new Map([['saturn', { x: 1000, z: 0 }]])
    const result = resolveSpecialMissionWaypoint('asset-2306-s', positions, fallback, () => 0)
    // Must be near Saturn (within 100 world units) but not exactly on it.
    const dx = result.worldX - 1000
    const dz = result.worldZ - 0
    const dist = Math.sqrt(dx * dx + dz * dz)
    expect(dist).toBeGreaterThan(0)
    expect(dist).toBeLessThan(100)
  })

  it('falls back when asteroidId is asset-2306-s but Saturn is not in the position map', () => {
    const positions = new Map<string, { x: number; z: number }>()
    const result = resolveSpecialMissionWaypoint('asset-2306-s', positions, fallback)
    expect(result).toEqual(fallback)
  })

  it('returns fallback for unknown asteroid ids', () => {
    const positions = new Map([['hektor', { x: 1, z: 2 }]])
    const result = resolveSpecialMissionWaypoint('some-other-rock', positions, fallback)
    expect(result).toEqual(fallback)
  })

  it('asset-2306-s placements with different rand values produce different positions', () => {
    const positions = new Map([['saturn', { x: 1000, z: 0 }]])
    const a = resolveSpecialMissionWaypoint('asset-2306-s', positions, fallback, () => 0)
    const b = resolveSpecialMissionWaypoint('asset-2306-s', positions, fallback, () => 0.5)
    expect(a).not.toEqual(b)
  })
})
