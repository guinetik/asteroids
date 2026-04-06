import { describe, expect, it } from 'vitest'
import type { ThrusterState } from '@/lib/physics/thrusterSystem'
import { isMainThrusterSpentForMessage } from '../tutorialTriggers'

const FULL_THRUST_STATE: ThrusterState = {
  charge: 100,
  capacity: 100,
  active: false,
}

describe('isMainThrusterSpentForMessage', () => {
  it('returns false when the thrust bar is still full', () => {
    expect(isMainThrusterSpentForMessage(FULL_THRUST_STATE, true)).toBe(false)
  })

  it('returns false when the bar is drained but can still fire', () => {
    const state: ThrusterState = {
      charge: 0.8,
      capacity: 100,
      active: false,
    }

    expect(isMainThrusterSpentForMessage(state, true)).toBe(false)
  })

  it('returns true when the bar has been used and can no longer fire', () => {
    const state: ThrusterState = {
      charge: 0.8,
      capacity: 100,
      active: false,
    }

    expect(isMainThrusterSpentForMessage(state, false)).toBe(true)
  })
})
