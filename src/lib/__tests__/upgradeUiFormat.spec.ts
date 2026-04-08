/**
 * Tests for upgrade engineering-bay stat formatting.
 *
 * @author guinetik
 * @date 2026-04-08
 */
import { describe, expect, it } from 'vitest'
import { formatUpgradeStatValue, statValueAtDisplayLevel } from '@/lib/upgrades/upgradeUiFormat'
import type { NumericUpgradeDefinition } from '@/lib/upgrades'

const mockDef: NumericUpgradeDefinition = {
  id: 'test',
  category: 'shuttle',
  label: 'Test',
  description: 'x',
  baseCost: 1,
  maxLevel: 3,
  valuesByLevel: [1, 0.75, 0.5, 0.25],
}

describe('statValueAtDisplayLevel', () => {
  it('clamps high levels to max', () => {
    expect(statValueAtDisplayLevel(mockDef, 99)).toBe(0.25)
  })

  it('clamps negative to zero', () => {
    expect(statValueAtDisplayLevel(mockDef, -2)).toBe(1)
  })
})

describe('formatUpgradeStatValue', () => {
  it('trims trailing zeros', () => {
    expect(formatUpgradeStatValue(3)).toBe('3')
    expect(formatUpgradeStatValue(1.25)).toBe('1.25')
  })

  it('returns em dash for non-finite', () => {
    expect(formatUpgradeStatValue(Number.NaN)).toBe('—')
  })
})
