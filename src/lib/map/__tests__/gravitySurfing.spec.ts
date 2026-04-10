import { describe, expect, it } from 'vitest'
import {
  computeGravitySurfGridStep,
  findNearestGravitySurfRail,
  gravitySurfDirectionFromHeading,
  gravitySurfRailHeading,
} from '../gravitySurfing'

describe('gravitySurfing helpers', () => {
  it('computes grid spacing from map size and resolution', () => {
    expect(computeGravitySurfGridStep(1200, 300)).toBe(4)
  })

  it('snaps to the nearest horizontal rail when z is closer', () => {
    expect(
      findNearestGravitySurfRail({
        x: 10.6,
        z: 5.2,
        gridSize: 1200,
        gridResolution: 300,
        maxSnapDistanceCells: 0.5,
      }),
    ).toEqual({
      axis: 'x',
      lineCoord: 4,
      alongCoord: 10.6,
      snappedX: 10.6,
      snappedZ: 4,
      distance: 1.2000000000000002,
    })
  })

  it('snaps to the nearest vertical rail when x is closer', () => {
    expect(
      findNearestGravitySurfRail({
        x: 1.1,
        z: 14,
        gridSize: 1200,
        gridResolution: 300,
        maxSnapDistanceCells: 0.5,
      }),
    ).toEqual({
      axis: 'z',
      lineCoord: 0,
      alongCoord: 14,
      snappedX: 0,
      snappedZ: 14,
      distance: 1.1,
    })
  })

  it('returns null when no rail is within snap range', () => {
    expect(
      findNearestGravitySurfRail({
        x: 2.2,
        z: 2.3,
        gridSize: 1200,
        gridResolution: 300,
        maxSnapDistanceCells: 0.2,
      }),
    ).toBeNull()
  })

  it('derives rail direction from heading', () => {
    expect(gravitySurfDirectionFromHeading('x', 0)).toBe(-1)
    expect(gravitySurfDirectionFromHeading('x', Math.PI)).toBe(1)
    expect(gravitySurfDirectionFromHeading('z', -Math.PI / 2)).toBe(-1)
    expect(gravitySurfDirectionFromHeading('z', Math.PI / 2)).toBe(1)
  })

  it('returns canonical rail headings', () => {
    expect(gravitySurfRailHeading('x', 1)).toBe(Math.PI)
    expect(gravitySurfRailHeading('x', -1)).toBe(0)
    expect(gravitySurfRailHeading('z', 1)).toBe(-Math.PI / 2)
    expect(gravitySurfRailHeading('z', -1)).toBe(Math.PI / 2)
  })
})
