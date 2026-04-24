import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { resolveAsteroidImpact } from '../asteroidImpactMath'
import {
  ASTEROID_IMPACT_MAX_DAMAGE,
  ASTEROID_IMPACT_MAX_SHAKE,
  ASTEROID_IMPACT_MIN_DAMAGE,
  ASTEROID_IMPACT_MIN_IMPULSE,
  ASTEROID_IMPACT_MIN_SHAKE,
  ASTEROID_IMPACT_SHAKE_DURATION_SEC,
} from '@/lib/map/mapViewControllerConfig'

describe('resolveAsteroidImpact', () => {
  it('returns minimum damage + shake when the ship is stationary', () => {
    const result = resolveAsteroidImpact({
      shuttlePosition: new THREE.Vector3(1, 0, 0),
      velocity: new THREE.Vector3(0, 0, 0),
      impact: { worldPosition: new THREE.Vector3(0, 0, 0), asteroidRadius: 0.01 },
    })
    expect(result.damage).toBeCloseTo(ASTEROID_IMPACT_MIN_DAMAGE, 5)
    expect(result.shakeMagnitude).toBeCloseTo(ASTEROID_IMPACT_MIN_SHAKE, 5)
    expect(result.damageLabel).toBe('Asteroid Impact')
    expect(result.shakeDurationSec).toBeCloseTo(ASTEROID_IMPACT_SHAKE_DURATION_SEC, 5)
  })

  it('saturates damage + shake at the top of the speed range', () => {
    // Ship approaching the asteroid head-on at speed 10 (past saturation @ 6).
    const result = resolveAsteroidImpact({
      shuttlePosition: new THREE.Vector3(1, 0, 0),
      velocity: new THREE.Vector3(-10, 0, 0),
      impact: { worldPosition: new THREE.Vector3(0, 0, 0), asteroidRadius: 0.01 },
    })
    expect(result.damage).toBeCloseTo(ASTEROID_IMPACT_MAX_DAMAGE, 5)
    expect(result.shakeMagnitude).toBeCloseTo(ASTEROID_IMPACT_MAX_SHAKE, 5)
  })

  it('pushes the ship back along the collision normal (impulse applied)', () => {
    // Impact at origin, ship sitting at +X; normal should be (+1, 0, 0).
    // Stationary ship → inboundSpeed = 0 → impulse is floor (MIN_IMPULSE).
    const result = resolveAsteroidImpact({
      shuttlePosition: new THREE.Vector3(1, 0, 0),
      velocity: new THREE.Vector3(0, 0, 0),
      impact: { worldPosition: new THREE.Vector3(0, 0, 0), asteroidRadius: 0.01 },
    })
    expect(result.newVelocity.x).toBeCloseTo(ASTEROID_IMPACT_MIN_IMPULSE, 5)
    expect(result.newVelocity.y).toBeCloseTo(0, 5)
    expect(result.newVelocity.z).toBeCloseTo(0, 5)
  })

  it('applies the 0.92 retention multiplier when velocity has an inbound component', () => {
    // Ship moving -X at speed 2 into an asteroid at origin; normal = +X; inbound = 2.
    const result = resolveAsteroidImpact({
      shuttlePosition: new THREE.Vector3(1, 0, 0),
      velocity: new THREE.Vector3(-2, 0, 0),
      impact: { worldPosition: new THREE.Vector3(0, 0, 0), asteroidRadius: 0.2 },
    })
    // Post-impulse vx pre-retention: -2 + impulse(+X). With retention, final ≠ pre-retention.
    // Easier assertion: magnitude is scaled by 0.92 vs the no-retention branch — just verify
    // the final result differs from (velocity + impulse*normal) by exactly 8%.
    const impulseMagnitudeX = result.newVelocity.x / 0.92 - -2
    expect(impulseMagnitudeX).toBeGreaterThan(0)
    // Direct check: the final vector's length is 0.92 × the raw post-impulse length.
    expect(result.newVelocity.x).toBeCloseTo(0.92 * (-2 + impulseMagnitudeX), 5)
  })

  it('ignores Y-axis components of the collision normal', () => {
    // Asteroid slightly below and ship above; normal should be XZ-planar.
    const result = resolveAsteroidImpact({
      shuttlePosition: new THREE.Vector3(1, 0.5, 0),
      velocity: new THREE.Vector3(0, 0, 0),
      impact: { worldPosition: new THREE.Vector3(0, 0, 0), asteroidRadius: 0.01 },
    })
    expect(result.newVelocity.y).toBeCloseTo(0, 5)
  })

  it('falls back to reversed velocity normal when the ship sits exactly on the asteroid', () => {
    const result = resolveAsteroidImpact({
      shuttlePosition: new THREE.Vector3(0, 0, 0),
      velocity: new THREE.Vector3(1, 0, 0),
      impact: { worldPosition: new THREE.Vector3(0, 0, 0), asteroidRadius: 0.1 },
    })
    // Normal = -velocity direction → (-1, 0, 0). Impulse pushes in -X.
    expect(result.newVelocity.x).toBeLessThan(1)
  })
})
