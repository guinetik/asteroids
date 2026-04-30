/**
 * Tests for getGiversForDifficulty: difficulty range, disabledGiverIds, and requiresFlag filters.
 * Includes Mr. Finch surfacing tests (post-tamper, jovianContractTampered flag).
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-29-jovian-prospectus-minigame-design.md
 */
import { describe, it, expect } from 'vitest'
import { getGiversForDifficulty } from '@/lib/missions/giverCatalog'
import { setStoryFlag, createProfile } from '@/lib/player/profile'
import type { PlayerProfile } from '@/lib/player/types'
import type { MissionGiver } from '@/lib/missions/types'

/** Minimal MissionGiver for test usage. */
const baseGiver = (id: string, overrides?: Partial<MissionGiver>): MissionGiver =>
  ({
    id,
    name: id,
    title: 'Test',
    objectiveTypes: ['gather'],
    minDifficulty: 1,
    maxDifficulty: 9,
    missions: [],
    ...overrides,
  }) as MissionGiver

/**
 * Build a minimal PlayerProfile stub for test usage. Only the fields relevant
 * to giver-surfacing logic are populated; the rest are omitted via double-cast.
 */
const stubProfile = (overrides: Partial<PlayerProfile> = {}): PlayerProfile =>
  ({ ...overrides }) as unknown as PlayerProfile

describe('getGiversForDifficulty surfacing filters', () => {
  it('returns givers whose difficulty range covers the requested difficulty', () => {
    const givers = [
      baseGiver('a', { minDifficulty: 1, maxDifficulty: 5 }),
      baseGiver('b', { minDifficulty: 4, maxDifficulty: 8 }),
      baseGiver('c', { minDifficulty: 6, maxDifficulty: 9 }),
    ]
    const result = getGiversForDifficulty(5, stubProfile(), givers)
    expect(result.map((g) => g.id)).toEqual(['a', 'b'])
  })

  it('still filters by min/max difficulty (existing behavior preserved)', () => {
    // difficulty 11 is beyond any catalog giver's max — no matches
    const result = getGiversForDifficulty(11, stubProfile())
    expect(result).toHaveLength(0)
  })

  it('skips givers in profile.disabledGiverIds', () => {
    const profile = stubProfile({ disabledGiverIds: { 'jovian-society': true } })
    // jovian-society is in the real catalog; at difficulty 5 it should normally appear
    const all = getGiversForDifficulty(5, stubProfile())
    const filtered = getGiversForDifficulty(5, profile)
    // jovian-society absent in filtered result
    expect(filtered.find((g) => g.id === 'jovian-society')).toBeUndefined()
    // but it was present without the filter
    expect(all.find((g) => g.id === 'jovian-society')).toBeDefined()
  })

  it('skips givers with requiresFlag when the flag is unset', () => {
    const flaggedGiver = baseGiver('flagged-giver', {
      requiresFlag: 'jovianContractTampered',
    })
    const result = getGiversForDifficulty(5, stubProfile(), [flaggedGiver])
    expect(result).toHaveLength(0)
  })

  it('includes givers with requiresFlag when the flag is set', () => {
    const flaggedGiver = baseGiver('flagged-giver', {
      requiresFlag: 'jovianContractTampered',
    })
    const profile = stubProfile({ activeStoryFlags: { jovianContractTampered: true } })
    const result = getGiversForDifficulty(5, profile, [flaggedGiver])
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('flagged-giver')
  })

  it('passes through givers with no requiresFlag regardless of profile flags', () => {
    const giver = baseGiver('plain-giver')
    const profile = stubProfile({ activeStoryFlags: { someOtherFlag: true } })
    const result = getGiversForDifficulty(5, profile, [giver])
    expect(result).toHaveLength(1)
  })

  it('applies both disabledGiverIds and requiresFlag in the same call', () => {
    const givers = [
      baseGiver('disabled-one'),
      baseGiver('flagged-one', { requiresFlag: 'unlockFlag' }),
      baseGiver('plain-one'),
    ]
    const profile = stubProfile({
      disabledGiverIds: { 'disabled-one': true },
      activeStoryFlags: { unlockFlag: true },
    })
    const result = getGiversForDifficulty(5, profile, givers)
    expect(result.map((g) => g.id)).toEqual(['flagged-one', 'plain-one'])
  })
})

describe('Mr. Finch surfacing', () => {
  it('does not surface without the jovianContractTampered flag', () => {
    const profile = createProfile('test-pilot')
    const givers = getGiversForDifficulty(5, profile)
    expect(givers.find((g) => g.id === 'mr-finch')).toBeUndefined()
  })

  it('surfaces when jovianContractTampered is set', () => {
    const profile = setStoryFlag(createProfile('test-pilot'), 'jovianContractTampered')
    const givers = getGiversForDifficulty(5, profile)
    expect(givers.find((g) => g.id === 'mr-finch')).toBeDefined()
  })

  it('does not surface below minDifficulty 4 even with the flag set', () => {
    const profile = setStoryFlag(createProfile('test-pilot'), 'jovianContractTampered')
    const givers = getGiversForDifficulty(3, profile)
    expect(givers.find((g) => g.id === 'mr-finch')).toBeUndefined()
  })

  it('does not surface above maxDifficulty 9 even with the flag set', () => {
    const profile = setStoryFlag(createProfile('test-pilot'), 'jovianContractTampered')
    const givers = getGiversForDifficulty(10, profile)
    expect(givers.find((g) => g.id === 'mr-finch')).toBeUndefined()
  })
})
