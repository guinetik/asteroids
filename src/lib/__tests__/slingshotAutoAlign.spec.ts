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
  it('interpolates toward target yaw proportional to dt/remainingTime', () => {
    // Half the remaining time → halfway there
    const result = getSlingshotAutoAlignYaw(0, Math.PI / 2, 0.5, 1)
    expect(result).toBeCloseTo(Math.PI / 4, 5)
  })

  it('snaps to target when dt exceeds remaining time', () => {
    expect(getSlingshotAutoAlignYaw(0, Math.PI / 2, 2, 1)).toBeCloseTo(Math.PI / 2, 5)
  })

  it('snaps to target when remaining time is zero', () => {
    expect(getSlingshotAutoAlignYaw(0, Math.PI / 2, 0.1, 0)).toBeCloseTo(Math.PI / 2, 5)
  })

  it('takes the shortest rotation path across angle wrap', () => {
    const startYaw = (170 * Math.PI) / 180
    const targetYaw = (-170 * Math.PI) / 180
    // Shortest path is 20° forward (not 340° backward)
    const result = getSlingshotAutoAlignYaw(startYaw, targetYaw, 0.5, 1)
    // Should be halfway from 170° to 190° (i.e. 180°), wrapped to π
    expect(result).toBeCloseTo(Math.PI, 2)
  })
})
