/**
 * Tests for slingshot burst auto-alignment helpers.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-orbit-capture-slingshot-design.md
 */
import { describe, expect, it } from 'vitest'
import { getSlingshotAutoAlignYaw, getVelocityHeading } from '../slingshotAutoAlign'

describe('getVelocityHeading', () => {
  it('returns null for zero planar velocity', () => {
    expect(getVelocityHeading(0, 0)).toBeNull()
  })

  it('converts planar velocity into shuttle heading yaw', () => {
    expect(getVelocityHeading(1, 0)).toBeCloseTo(0, 5)
    expect(getVelocityHeading(0, -2)).toBeCloseTo(Math.PI / 2, 5)
  })
})

describe('getSlingshotAutoAlignYaw', () => {
  it('snaps directly to the current target yaw during lock', () => {
    expect(getSlingshotAutoAlignYaw(0, Math.PI / 2, 0.1, 10)).toBeCloseTo(Math.PI / 2, 5)
  })

  it('still returns the target yaw when the align step is large', () => {
    expect(getSlingshotAutoAlignYaw(0, Math.PI / 2, 2, 1)).toBeCloseTo(Math.PI / 2, 5)
  })

  it('takes the shortest rotation path across angle wrap', () => {
    const startYaw = (170 * Math.PI) / 180
    const targetYaw = (-170 * Math.PI) / 180
    expect(getSlingshotAutoAlignYaw(startYaw, targetYaw, 0.5, 1)).toBeCloseTo(targetYaw, 5)
  })
})
