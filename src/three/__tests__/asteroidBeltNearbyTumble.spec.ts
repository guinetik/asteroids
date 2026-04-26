/**
 * Tests for nearby asteroid tumble helper logic.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-nearby-asteroid-tumble-design.md
 */
import { describe, expect, it } from 'vitest'
import {
  decideNearbyTumbleState,
  getNearbyTumbleSampleWindow,
  isWithinNearbyTumbleRadius,
} from '../controllers/asteroidBeltNearbyTumble'

function windowIndices(
  window: NonNullable<ReturnType<typeof getNearbyTumbleSampleWindow>>,
): number[] {
  const out: number[] = []
  for (let i = 0; i < window.windowLength; i += 1) {
    out.push((window.startIndex + i) % window.visibleCount)
  }
  return out
}

describe('isWithinNearbyTumbleRadius', () => {
  it('is true when inside radius', () => {
    expect(
      isWithinNearbyTumbleRadius({
        shuttleLocal: { x: 0, y: 0, z: 0 },
        asteroidLocal: { x: 3, y: 4, z: 0 },
        nearbyRadius: 5,
      }),
    ).toBe(true)
  })

  it('is false when outside radius', () => {
    expect(
      isWithinNearbyTumbleRadius({
        shuttleLocal: { x: 0, y: 0, z: 0 },
        asteroidLocal: { x: 3, y: 4, z: 0 },
        nearbyRadius: 4.99,
      }),
    ).toBe(false)
  })
})

describe('getNearbyTumbleSampleWindow', () => {
  it('wraps sample window at visible-count boundary', () => {
    const w = getNearbyTumbleSampleWindow({
      sampleCursor: 8,
      samplesPerPass: 3,
      visibleCount: 10,
    })
    expect(w).not.toBeNull()
    expect(windowIndices(w!)).toEqual([8, 9, 0])
  })

  it('returns empty when nothing is visible', () => {
    expect(
      getNearbyTumbleSampleWindow({
        sampleCursor: 0,
        samplesPerPass: 4,
        visibleCount: 0,
      }),
    ).toBeNull()
  })

  it('progresses a rotating sample window across successive passes', () => {
    const visibleCount = 10
    const samplesPerPass = 3

    expect(
      windowIndices(
        getNearbyTumbleSampleWindow({
          sampleCursor: 0,
          samplesPerPass,
          visibleCount,
        })!,
      ),
    ).toEqual([0, 1, 2])
    expect(
      windowIndices(
        getNearbyTumbleSampleWindow({
          sampleCursor: 3,
          samplesPerPass,
          visibleCount,
        })!,
      ),
    ).toEqual([3, 4, 5])
    expect(
      windowIndices(
        getNearbyTumbleSampleWindow({
          sampleCursor: 6,
          samplesPerPass,
          visibleCount,
        })!,
      ),
    ).toEqual([6, 7, 8])
    expect(
      windowIndices(
        getNearbyTumbleSampleWindow({
          sampleCursor: 9,
          samplesPerPass,
          visibleCount,
        })!,
      ),
    ).toEqual([9, 0, 1])
  })

  it('advances sample cursor by window length each pass like the belt controller', () => {
    const visibleCount = 10
    const samplesPerPass = 3
    let cursor = 0
    const startIndices: number[] = []
    for (let pass = 0; pass < 10; pass += 1) {
      const w = getNearbyTumbleSampleWindow({
        sampleCursor: cursor,
        samplesPerPass,
        visibleCount,
      })!
      startIndices.push(w.startIndex)
      cursor = (cursor + w.windowLength) % visibleCount
    }
    expect(startIndices).toEqual([0, 3, 6, 9, 2, 5, 8, 1, 4, 7])
    expect(cursor).toBe(0)
  })
})

describe('decideNearbyTumbleState', () => {
  it('activates inactive nearby asteroid when under cap and activation roll passes', () => {
    expect(
      decideNearbyTumbleState({
        isInsideNearbyRadius: true,
        isCurrentlyTumbling: false,
        activeTumblerCount: 0,
        maxActiveTumblers: 4,
        activationRoll: 0.1,
        activationChance: 0.5,
        deactivationRoll: 1,
        deactivationChance: 0,
      }),
    ).toEqual({
      nextIsTumbling: true,
      shouldResetToBaseMatrix: false,
    })
  })

  it('does not activate when already at active cap', () => {
    expect(
      decideNearbyTumbleState({
        isInsideNearbyRadius: true,
        isCurrentlyTumbling: false,
        activeTumblerCount: 4,
        maxActiveTumblers: 4,
        activationRoll: 0,
        activationChance: 1,
        deactivationRoll: 1,
        deactivationChance: 0,
      }),
    ).toEqual({
      nextIsTumbling: false,
      shouldResetToBaseMatrix: false,
    })
  })

  it('deactivates nearby asteroid when deactivation roll passes', () => {
    expect(
      decideNearbyTumbleState({
        isInsideNearbyRadius: true,
        isCurrentlyTumbling: true,
        activeTumblerCount: 2,
        maxActiveTumblers: 4,
        activationRoll: 1,
        activationChance: 0,
        deactivationRoll: 0.1,
        deactivationChance: 0.5,
      }),
    ).toEqual({
      nextIsTumbling: false,
      shouldResetToBaseMatrix: false,
    })
  })

  it('keeps nearby asteroid active when deactivation roll does not pass', () => {
    expect(
      decideNearbyTumbleState({
        isInsideNearbyRadius: true,
        isCurrentlyTumbling: true,
        activeTumblerCount: 2,
        maxActiveTumblers: 4,
        activationRoll: 1,
        activationChance: 0,
        deactivationRoll: 0.9,
        deactivationChance: 0.5,
      }),
    ).toEqual({
      nextIsTumbling: true,
      shouldResetToBaseMatrix: false,
    })
  })

  it('forces far asteroid back to static state', () => {
    expect(
      decideNearbyTumbleState({
        isInsideNearbyRadius: false,
        isCurrentlyTumbling: true,
        activeTumblerCount: 4,
        maxActiveTumblers: 4,
        activationRoll: 0,
        activationChance: 1,
        deactivationRoll: 0,
        deactivationChance: 1,
      }),
    ).toEqual({
      nextIsTumbling: false,
      shouldResetToBaseMatrix: true,
    })
  })

  it('keeps far asteroids in the static state even when activation rolls would otherwise pass', () => {
    expect(
      decideNearbyTumbleState({
        isInsideNearbyRadius: false,
        isCurrentlyTumbling: false,
        activeTumblerCount: 0,
        maxActiveTumblers: 5,
        activationRoll: 0,
        activationChance: 1,
        deactivationRoll: 0,
        deactivationChance: 0,
      }),
    ).toEqual({
      nextIsTumbling: false,
      shouldResetToBaseMatrix: false,
    })
  })
})
