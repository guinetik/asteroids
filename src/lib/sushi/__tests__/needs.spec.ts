import { describe, expect, it } from 'vitest'
import { createProfile, addSushiHunger, addSushiLove } from '@/lib/player/profile'
import {
  SUSHI_HUNGER_RISE_PER_MIN,
  SUSHI_LOVE_DECAY_PER_MIN,
  SUSHI_SECONDS_PER_MINUTE,
  tickSushiNeeds,
} from '../needs'

describe('tickSushiNeeds', () => {
  it('one minute reduces love by the per-minute rate and raises hunger by the per-minute rate', () => {
    const profile = createProfile('Pilot')
    const updated = tickSushiNeeds(profile, SUSHI_SECONDS_PER_MINUTE)
    expect(updated.sushiLove).toBeCloseTo(profile.sushiLove - SUSHI_LOVE_DECAY_PER_MIN, 6)
    expect(updated.sushiHunger).toBeCloseTo(profile.sushiHunger + SUSHI_HUNGER_RISE_PER_MIN, 6)
  })

  it('returns the same profile reference for non-positive or non-finite dt', () => {
    const profile = createProfile('Pilot')
    expect(tickSushiNeeds(profile, 0)).toBe(profile)
    expect(tickSushiNeeds(profile, -1)).toBe(profile)
    expect(tickSushiNeeds(profile, Number.NaN)).toBe(profile)
    expect(tickSushiNeeds(profile, Number.POSITIVE_INFINITY)).toBe(profile)
  })

  it('clamps love at zero when fully decayed', () => {
    let profile = createProfile('Pilot')
    profile = addSushiLove(profile, -profile.sushiLove)
    const updated = tickSushiNeeds(profile, SUSHI_SECONDS_PER_MINUTE * 1000)
    expect(updated.sushiLove).toBe(0)
  })

  it('clamps hunger at one hundred when fully starved', () => {
    let profile = createProfile('Pilot')
    profile = addSushiHunger(profile, 100 - profile.sushiHunger)
    const updated = tickSushiNeeds(profile, SUSHI_SECONDS_PER_MINUTE * 1000)
    expect(updated.sushiHunger).toBe(100)
  })

  it('scales linearly with elapsed time', () => {
    const profile = createProfile('Pilot')
    const half = tickSushiNeeds(profile, SUSHI_SECONDS_PER_MINUTE / 2)
    expect(profile.sushiLove - half.sushiLove).toBeCloseTo(SUSHI_LOVE_DECAY_PER_MIN / 2, 6)
    expect(half.sushiHunger - profile.sushiHunger).toBeCloseTo(SUSHI_HUNGER_RISE_PER_MIN / 2, 6)
  })
})
