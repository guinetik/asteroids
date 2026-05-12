import { describe, expect, it } from 'vitest'
import {
  addLitterPollution,
  addSushiBladder,
  addSushiHunger,
  addSushiLove,
  createProfile,
  LITTER_POLLUTION_MAX,
  setBowlServings,
  SUSHI_NEEDS_MAX,
} from '@/lib/player/profile'
import {
  SUSHI_BLADDER_FULL_THRESHOLD,
  SUSHI_HUNGER_DECAY_PER_MIN,
  SUSHI_HUNGER_NEEDY_THRESHOLD,
  SUSHI_HUNGER_RESTORE_PER_SERVING,
  SUSHI_LOVE_DECAY_PER_MIN,
  SUSHI_SECONDS_PER_MINUTE,
  SUSHI_TIRED_RISE_PER_MIN,
  tickSushiNeeds,
  tryAutoEat,
  tryAutoLitter,
} from '../needs'

describe('tickSushiNeeds', () => {
  it('one minute decays love and hunger and raises tired by their per-minute rates', () => {
    const profile = createProfile('Pilot')
    const updated = tickSushiNeeds(profile, SUSHI_SECONDS_PER_MINUTE)
    expect(updated.sushiLove).toBeCloseTo(profile.sushiLove - SUSHI_LOVE_DECAY_PER_MIN, 6)
    expect(updated.sushiHunger).toBeCloseTo(profile.sushiHunger - SUSHI_HUNGER_DECAY_PER_MIN, 6)
    expect(updated.sushiTired).toBeCloseTo(profile.sushiTired + SUSHI_TIRED_RISE_PER_MIN, 6)
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

  it('clamps hunger at zero when fully starved', () => {
    let profile = createProfile('Pilot')
    profile = addSushiHunger(profile, -profile.sushiHunger)
    const updated = tickSushiNeeds(profile, SUSHI_SECONDS_PER_MINUTE * 1000)
    expect(updated.sushiHunger).toBe(0)
  })

  it('scales linearly with elapsed time', () => {
    const profile = createProfile('Pilot')
    const half = tickSushiNeeds(profile, SUSHI_SECONDS_PER_MINUTE / 2)
    expect(profile.sushiLove - half.sushiLove).toBeCloseTo(SUSHI_LOVE_DECAY_PER_MIN / 2, 6)
    expect(profile.sushiHunger - half.sushiHunger).toBeCloseTo(SUSHI_HUNGER_DECAY_PER_MIN / 2, 6)
  })
})

describe('tryAutoEat', () => {
  it('consumes one serving and restores hunger when hungry and bowl has food', () => {
    let profile = createProfile('Pilot')
    profile = addSushiHunger(profile, -profile.sushiHunger + SUSHI_HUNGER_NEEDY_THRESHOLD - 5)
    profile = setBowlServings(profile, 3)
    const next = tryAutoEat(profile)
    expect(next).not.toBe(profile)
    expect(next.bowlServings).toBe(2)
    expect(next.sushiHunger).toBeCloseTo(
      profile.sushiHunger + SUSHI_HUNGER_RESTORE_PER_SERVING,
      6,
    )
  })

  it('returns same reference when bowl is empty', () => {
    let profile = createProfile('Pilot')
    profile = addSushiHunger(profile, -profile.sushiHunger + SUSHI_HUNGER_NEEDY_THRESHOLD - 5)
    profile = setBowlServings(profile, 0)
    expect(tryAutoEat(profile)).toBe(profile)
  })

  it('returns same reference when not hungry', () => {
    let profile = createProfile('Pilot')
    profile = setBowlServings(profile, 5)
    profile = addSushiHunger(profile, SUSHI_NEEDS_MAX)
    expect(tryAutoEat(profile)).toBe(profile)
  })
})

describe('tryAutoLitter', () => {
  it('resets bladder and adds one pollution chunk when bladder is full and litter has room', () => {
    let profile = createProfile('Pilot')
    profile = addSushiBladder(profile, SUSHI_BLADDER_FULL_THRESHOLD + 5)
    const startPollution = profile.litterPollution
    const next = tryAutoLitter(profile)
    expect(next).not.toBe(profile)
    expect(next.sushiBladder).toBe(0)
    expect(next.litterPollution).toBe(startPollution + 1)
  })

  it('returns same reference when litterbox is at capacity', () => {
    let profile = createProfile('Pilot')
    profile = addSushiBladder(profile, SUSHI_BLADDER_FULL_THRESHOLD + 5)
    profile = addLitterPollution(profile, LITTER_POLLUTION_MAX)
    expect(tryAutoLitter(profile)).toBe(profile)
  })

  it('returns same reference when bladder is below the full threshold', () => {
    const profile = createProfile('Pilot')
    expect(tryAutoLitter(profile)).toBe(profile)
  })
})
