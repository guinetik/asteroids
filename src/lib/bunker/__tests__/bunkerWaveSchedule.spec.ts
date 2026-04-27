import { describe, it, expect } from 'vitest'
import {
  difficultyToTier,
  rollWave,
  totalWavesForTier,
  type BunkerWaveTier,
} from '../bunkerWaveSchedule'

describe('difficultyToTier', () => {
  it('maps 1–4 to easy', () => {
    for (const d of [1, 2, 3, 4]) expect(difficultyToTier(d)).toBe('easy')
  })

  it('maps 5–7 to medium', () => {
    for (const d of [5, 6, 7]) expect(difficultyToTier(d)).toBe('medium')
  })

  it('maps 8–10 to hard', () => {
    for (const d of [8, 9, 10]) expect(difficultyToTier(d)).toBe('hard')
  })
})

describe('totalWavesForTier', () => {
  it('returns 3 for easy', () => {
    expect(totalWavesForTier('easy')).toBe(3)
  })

  it('returns 5 for medium', () => {
    expect(totalWavesForTier('medium')).toBe(5)
  })

  it('returns 7 for hard', () => {
    expect(totalWavesForTier('hard')).toBe(7)
  })
})

describe('rollWave', () => {
  it('returns the fixed roster for easy wave 0', () => {
    const roster = rollWave('easy', 0, 'mission-1')
    const phages = roster.filter((u) => u === 'bacteriophage').length
    // Fixed = 3 phages; fill = 1–3 phages from ['bacteriophage'].
    expect(phages).toBeGreaterThanOrEqual(4)
    expect(phages).toBeLessThanOrEqual(6)
  })

  it('rolls deterministic results for the same seed', () => {
    const a = rollWave('medium', 2, 'mission-42')
    const b = rollWave('medium', 2, 'mission-42')
    expect(a).toEqual(b)
  })

  it('rolls different results for different seeds (typically)', () => {
    const a = rollWave('hard', 4, 'seed-A')
    const b = rollWave('hard', 4, 'seed-B')
    // Not strictly required, but with the seed strings differing the rosters
    // should differ at least 50% of the time. We assert *not equal* and accept
    // a 1-in-N flaky risk; if this ever flakes we widen seeds.
    expect(a).not.toEqual(b)
  })

  it('respects the fillPool — never produces unauthored types', () => {
    // Easy wave 0 fillPool is ['bacteriophage'] — no spires/chimeras.
    for (let s = 0; s < 50; s++) {
      const roster = rollWave('easy', 0, `seed-${s}`)
      for (const unit of roster) {
        expect(['bacteriophage']).toContain(unit)
      }
    }
  })

  it('always adds 1–3 fill units', () => {
    // Compare roster size to known fixed count (3 phages on easy wave 0).
    const fixed = 3
    for (let s = 0; s < 50; s++) {
      const total = rollWave('easy', 0, `seed-${s}`).length
      expect(total).toBeGreaterThanOrEqual(fixed + 1)
      expect(total).toBeLessThanOrEqual(fixed + 3)
    }
  })

  it('throws on an out-of-range wave index', () => {
    expect(() => rollWave('easy', 3, 'seed')).toThrow(/out of range/)
    expect(() => rollWave('easy', -1, 'seed')).toThrow(/out of range/)
  })
})

describe('BunkerWaveTier', () => {
  it('exports the literal union', () => {
    const t: BunkerWaveTier = 'easy'
    expect(t).toBe('easy')
  })
})

describe('bunker-waves.json drift guard', () => {
  const VALID_TYPES: ReadonlySet<string> = new Set(['bacteriophage', 'spire', 'chimera'])

  for (const tier of ['easy', 'medium', 'hard'] as const) {
    it(`every authored type in ${tier} is a known BunkerEnemyType`, () => {
      for (let waveIndex = 0; waveIndex < totalWavesForTier(tier); waveIndex++) {
        // rollWave is the only public way to materialize a roster, so we use
        // it to exercise both the fixed and fill paths in the JSON.
        const roster = rollWave(tier, waveIndex, `drift-${tier}-${waveIndex}`)
        for (const unit of roster) {
          expect(VALID_TYPES.has(unit)).toBe(true)
        }
      }
    })
  }
})
