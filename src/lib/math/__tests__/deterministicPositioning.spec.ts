/**
 * Tests for {@link hashToKuiperPosition} — locks in that the seeded Kuiper-belt
 * placement always lands inside the planetarium's Kuiper bounds (30 – 50 AU)
 * and that distinct seeds resolve to distinct positions.
 *
 * @author guinetik
 * @date 2026-05-12
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */
import { describe, expect, it } from 'vitest'
import { hashToKuiperPosition } from '@/lib/math/deterministicPositioning'
import { ORBIT_SCALE } from '@/lib/planets/constants'

/** Inner edge of the Kuiper belt in `planetarium.json` (AU), converted to world units. */
const KUIPER_INNER_RADIUS = 30 * ORBIT_SCALE

/** Outer edge of the Kuiper belt in `planetarium.json` (AU), converted to world units. */
const KUIPER_OUTER_RADIUS = 50 * ORBIT_SCALE

describe('hashToKuiperPosition', () => {
  it('places yamada-titania-station inside the Kuiper belt', () => {
    const p = hashToKuiperPosition('yamada-titania-station')
    const r = Math.hypot(p.x, p.z)
    expect(p.y).toBe(0)
    expect(r).toBeGreaterThanOrEqual(KUIPER_INNER_RADIUS)
    expect(r).toBeLessThanOrEqual(KUIPER_OUTER_RADIUS)
  })

  it('places ceres-institute-station inside the Kuiper belt', () => {
    const p = hashToKuiperPosition('ceres-institute-station')
    const r = Math.hypot(p.x, p.z)
    expect(p.y).toBe(0)
    expect(r).toBeGreaterThanOrEqual(KUIPER_INNER_RADIUS)
    expect(r).toBeLessThanOrEqual(KUIPER_OUTER_RADIUS)
  })

  it('produces distinct positions for distinct seeds', () => {
    const a = hashToKuiperPosition('yamada-titania-station')
    const b = hashToKuiperPosition('ceres-institute-station')
    expect(a.x === b.x && a.z === b.z).toBe(false)
  })

  it('is deterministic — same seed yields identical position', () => {
    const a = hashToKuiperPosition('yamada-titania-station')
    const b = hashToKuiperPosition('yamada-titania-station')
    expect(a.x).toBe(b.x)
    expect(a.z).toBe(b.z)
  })
})
