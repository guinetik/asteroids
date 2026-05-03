import { describe, it, expect } from 'vitest'
import type { HeightmapSurfaceQuery } from '../probePositions'
import { generateProbePositions, generateValidatedProbePositions } from '../probePositions'

describe('generateProbePositions', () => {
  it('returns the correct number of positions', () => {
    const positions = generateProbePositions(5, 0, 0, 42)
    expect(positions).toHaveLength(5)
  })

  it('positions are within horizontal radius range', () => {
    const cx = 100
    const cz = -200
    const positions = generateProbePositions(10, cx, cz, 99)
    for (const pos of positions) {
      const dx = pos.x - cx
      const dz = pos.z - cz
      const dist = Math.sqrt(dx * dx + dz * dz)
      expect(dist).toBeGreaterThanOrEqual(100) // MIN_RADIUS
      expect(dist).toBeLessThanOrEqual(500) // MAX_RADIUS
    }
  })

  it('positions are within altitude range', () => {
    const positions = generateProbePositions(10, 0, 0, 77)
    for (const pos of positions) {
      expect(pos.y).toBeGreaterThanOrEqual(30) // MIN_ALTITUDE
      expect(pos.y).toBeLessThanOrEqual(150) // MAX_ALTITUDE
    }
  })

  it('same seed produces same positions', () => {
    const a = generateProbePositions(5, 0, 0, 123)
    const b = generateProbePositions(5, 0, 0, 123)
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.x).toBe(b[i]!.x)
      expect(a[i]!.y).toBe(b[i]!.y)
      expect(a[i]!.z).toBe(b[i]!.z)
    }
  })

  it('different seeds produce different positions', () => {
    const a = generateProbePositions(5, 0, 0, 1)
    const b = generateProbePositions(5, 0, 0, 2)
    const allSame = a.every((p, i) => p.x === b[i]!.x && p.z === b[i]!.z)
    expect(allSame).toBe(false)
  })
})

/** Valid cylindrical column used to mimic mesh peanuts: terrain only inside radius R of the hub. */
function diskMockHeightfield(
  hubX: number,
  hubZ: number,
  validRadius: number,
): HeightmapSurfaceQuery {
  return {
    tryHeightAt(x: number, z: number): number | null {
      const dx = x - hubX
      const dz = z - hubZ
      if (dx * dx + dz * dz > validRadius * validRadius) return null
      return 0
    },
  }
}

describe('generateValidatedProbePositions', () => {
  /** Outer annulus misses the asteroid while the nearer ring still overlaps the mesh. */
  const PEANUT_MOCK_RADIUS = 95

  it('only places probes on columns `tryHeightAt` considers valid', () => {
    const cx = -400
    const cz = 250
    const hm = diskMockHeightfield(cx, cz, PEANUT_MOCK_RADIUS)
    const out = generateValidatedProbePositions(6, cx, cz, 2026, hm)
    expect(out).toHaveLength(6)
    for (const p of out) {
      expect(hm.tryHeightAt(p.x, p.z)).not.toBeNull()
      expect(p.y).toBeGreaterThanOrEqual(30)
      expect(p.y).toBeLessThanOrEqual(150)
    }
  })

  it('is deterministic for a fixed seed', () => {
    const hm = diskMockHeightfield(50, -50, PEANUT_MOCK_RADIUS)
    const a = generateValidatedProbePositions(4, 50, -50, 9001, hm)
    const b = generateValidatedProbePositions(4, 50, -50, 9001, hm)
    expect(a.map((q) => [q.x, q.y, q.z])).toEqual(b.map((q) => [q.x, q.y, q.z]))
  })
})
