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
    // heading=0 → forward (1,0,0) → +x component → directionSign=1
    expect(gravitySurfDirectionFromHeading('x', 0)).toBe(1)
    // heading=PI → forward (-1,0,0) → -x component → directionSign=-1
    expect(gravitySurfDirectionFromHeading('x', Math.PI)).toBe(-1)
    // heading=-PI/2 → forward (0,0,1) → +z component → directionSign=1
    expect(gravitySurfDirectionFromHeading('z', -Math.PI / 2)).toBe(1)
    // heading=PI/2 → forward (0,0,-1) → -z component → directionSign=-1
    expect(gravitySurfDirectionFromHeading('z', Math.PI / 2)).toBe(-1)
  })

  it('returns canonical rail headings', () => {
    // +x travel → heading=0 (model forward is +x)
    expect(gravitySurfRailHeading('x', 1)).toBe(0)
    // -x travel → heading=PI (model forward is -x)
    expect(gravitySurfRailHeading('x', -1)).toBe(Math.PI)
    // +z travel → heading=-PI/2 (model forward is +z)
    expect(gravitySurfRailHeading('z', 1)).toBe(-Math.PI / 2)
    // -z travel → heading=PI/2 (model forward is -z)
    expect(gravitySurfRailHeading('z', -1)).toBe(Math.PI / 2)
  })
})
