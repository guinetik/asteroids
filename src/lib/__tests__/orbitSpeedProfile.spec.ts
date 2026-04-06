/**
 * Tests for per-body orbital speed multipliers.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-orbit-capture-slingshot-design.md
 */
import { describe, expect, it } from 'vitest'
import { PLANETS } from '@/lib/planets/catalog'
import { computeRelativeOrbitalSpeedMultiplier } from '../orbitSpeedProfile'

describe('computeRelativeOrbitalSpeedMultiplier', () => {
  it('returns 1 for the reference orbit', () => {
    const earth = PLANETS.find((planet) => planet.id === 'earth')!

    expect(computeRelativeOrbitalSpeedMultiplier(earth.orbit, earth.orbit)).toBeCloseTo(1, 5)
  })

  it('makes inner planets faster than Earth', () => {
    const earth = PLANETS.find((planet) => planet.id === 'earth')!
    const mercury = PLANETS.find((planet) => planet.id === 'mercury')!

    expect(computeRelativeOrbitalSpeedMultiplier(mercury.orbit, earth.orbit)).toBeGreaterThan(1)
  })

  it('makes outer planets slower than Earth', () => {
    const earth = PLANETS.find((planet) => planet.id === 'earth')!
    const neptune = PLANETS.find((planet) => planet.id === 'neptune')!

    expect(computeRelativeOrbitalSpeedMultiplier(neptune.orbit, earth.orbit)).toBeLessThan(1)
  })
})
