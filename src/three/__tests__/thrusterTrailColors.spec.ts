/**
 * Unit tests for cosmetic thruster-trail color resolver.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-pimp-my-shuttle-thruster-trails.md
 */
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { resolveThrusterTrailColors } from '@/three/cosmetics/thrusterTrailColors'
import { findCosmeticOptionById } from '@/lib/cosmetics/catalog'

function expectColorMatchesHex(color: THREE.Color, hex: string): void {
  const expected = new THREE.Color(hex)
  expect(color.r).toBeCloseTo(expected.r, 5)
  expect(color.g).toBeCloseTo(expected.g, 5)
  expect(color.b).toBeCloseTo(expected.b, 5)
}

describe('resolveThrusterTrailColors', () => {
  it('routes shuttle trail stops 1 → core and stop 2 → wake', () => {
    const option = findCosmeticOptionById('shuttle-trail-plasma-kiss')!
    const colors = resolveThrusterTrailColors(option.id, 'shuttle-thruster-trail')!
    expect(colors).not.toBeNull()
    expectColorMatchesHex(colors.core, option.gradientStops[1]!)
    expectColorMatchesHex(colors.wake, option.gradientStops[2]!)
  })

  it('routes lander trail stop 1 to core (the named SKU color, e.g. "Cyan")', () => {
    const option = findCosmeticOptionById('lander-trail-cyan-rcs')!
    const colors = resolveThrusterTrailColors(option.id, 'lander-thruster-trail')!
    expect(colors).not.toBeNull()
    expectColorMatchesHex(colors.core, option.gradientStops[1]!)
    expectColorMatchesHex(colors.wake, option.gradientStops[2]!)
  })

  it('returns null for unknown ids', () => {
    expect(resolveThrusterTrailColors('nope', 'shuttle-thruster-trail')).toBeNull()
  })

  it('returns null when category does not match the catalog row', () => {
    expect(
      resolveThrusterTrailColors('shuttle-trail-plasma-kiss', 'lander-thruster-trail'),
    ).toBeNull()
    expect(
      resolveThrusterTrailColors('shuttle-paintjob-factory-stock', 'shuttle-thruster-trail'),
    ).toBeNull()
  })

  it('returns fresh THREE.Color instances per call (caller can mutate without leaking back)', () => {
    const a = resolveThrusterTrailColors('shuttle-trail-blue-shift', 'shuttle-thruster-trail')!
    const b = resolveThrusterTrailColors('shuttle-trail-blue-shift', 'shuttle-thruster-trail')!
    expect(a.core).not.toBe(b.core)
    a.core.setRGB(0, 0, 0)
    expect(b.core.r).toBeGreaterThan(0)
  })

  it('falls back when catalog row has fewer than three stops', () => {
    const portugal = findCosmeticOptionById('vehicle-flag-portugal')!
    expect(portugal.gradientStops.length).toBe(2)
    const colors = resolveThrusterTrailColors(portugal.id, 'vehicle-flag')!
    expect(colors).not.toBeNull()
    expectColorMatchesHex(colors.core, portugal.gradientStops[1]!)
    // wake falls back through stops[2] → stops[1]
    expectColorMatchesHex(colors.wake, portugal.gradientStops[1]!)
  })
})
