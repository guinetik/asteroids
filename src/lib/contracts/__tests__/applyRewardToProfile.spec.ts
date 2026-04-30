/**
 * Tests for the `set-story-flag` reward effect — both the pure profile
 * helpers it delegates to and the type-level correctness of the union arm.
 *
 * `applyRewardToProfile` is a private function that calls `loadProfile()` /
 * `saveProfile()` internally, so these tests exercise the pure layer
 * (`setStoryFlag` / `hasStoryFlag`) and validate that the discriminated union
 * accepts the new arm without a TS error.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-29-jovian-prospectus-minigame-design.md
 */
import { describe, it, expect } from 'vitest'
import { createProfile, setStoryFlag, hasStoryFlag } from '@/lib/player/profile'
import type { RewardEffect } from '@/lib/contracts/contractTypes'
import { expectTypeOf } from 'vitest'

describe('set-story-flag profile helpers', () => {
  it('persists the flag on the profile', () => {
    const before = createProfile('test')
    const after = setStoryFlag(before, 'jovianContractTampered')
    expect(hasStoryFlag(after, 'jovianContractTampered')).toBe(true)
  })

  it('does not mutate the source profile', () => {
    const before = createProfile('test')
    setStoryFlag(before, 'someFlag')
    expect(hasStoryFlag(before, 'someFlag')).toBe(false)
  })

  it('is idempotent — re-applying does not duplicate', () => {
    let p = createProfile('test')
    p = setStoryFlag(p, 'x')
    p = setStoryFlag(p, 'x')
    expect(Object.keys(p.activeStoryFlags ?? {})).toEqual(['x'])
  })

  it('returns the same reference when flag is already set', () => {
    const first = setStoryFlag(createProfile('test'), 'y')
    const second = setStoryFlag(first, 'y')
    expect(second).toBe(first)
  })

  it('sets multiple distinct flags independently', () => {
    let p = createProfile('test')
    p = setStoryFlag(p, 'flagA')
    p = setStoryFlag(p, 'flagB')
    expect(hasStoryFlag(p, 'flagA')).toBe(true)
    expect(hasStoryFlag(p, 'flagB')).toBe(true)
    expect(Object.keys(p.activeStoryFlags ?? {}).sort()).toEqual(['flagA', 'flagB'])
  })
})

describe('RewardEffect union — set-story-flag arm', () => {
  it('is a valid RewardEffect type', () => {
    expectTypeOf<{ type: 'set-story-flag'; flag: string }>().toMatchTypeOf<RewardEffect>()
  })

  it('discriminates correctly', () => {
    const effect: RewardEffect = { type: 'set-story-flag', flag: 'jovianContractTampered' }
    expect(effect.type).toBe('set-story-flag')
    // Narrowed access compiles without error — verifies the arm has `flag`
    const narrowed = effect as Extract<RewardEffect, { type: 'set-story-flag' }>
    expect(narrowed.flag).toBe('jovianContractTampered')
  })
})
