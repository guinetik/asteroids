/**
 * Profile cosmetics migration + title normalization.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-30-pimp-my-shuttle-shop-design.md
 */
import {
  createDefaultPlayerCosmetics,
  normalizePlayerCosmetics,
  normalizeShuttleTitle,
  SHUTTLE_TITLE_MAX_VISIBLE_CHARS,
} from '@/lib/cosmetics/profileCosmetics'
import { describe, expect, it } from 'vitest'

describe('profile cosmetics helpers', () => {
  it('normalizes shuttle titles with caps + whitespace collapse', () => {
    expect(normalizeShuttleTitle('   hello    world   ')).toBe('hello world')
    expect(normalizeShuttleTitle('')).toBe('')
    const long = 'a'.repeat(SHUTTLE_TITLE_MAX_VISIBLE_CHARS + 8)
    expect(normalizeShuttleTitle(long).length).toBe(SHUTTLE_TITLE_MAX_VISIBLE_CHARS)
  })

  it('creates defaults referencing catalog starter rows', () => {
    const defaults = createDefaultPlayerCosmetics()
    expect(defaults.ownedOptionIds.length).toBeGreaterThan(0)
    expect(defaults.shuttlePaintjobId).toContain('shuttle-paintjob')
    expect(defaults.habitatInteriorId).toContain('habitat-interior')
    expect(defaults.ownedOptionIds).toContain(defaults.habitatInteriorId)
  })

  it('salvages malformed owned lists by restoring catalog defaults', () => {
    const partial = normalizePlayerCosmetics({ ownedOptionIds: ['not-a-real-option'] })
    expect(partial.shuttlePaintjobId).toContain('shuttle')
    expect(partial.ownedOptionIds).toContain(partial.habitatInteriorId)
  })
})
