/**
 * Tests for Ceres Institute quest items.
 *
 * @author guinetik
 * @date 2026-05-05
 * @spec docs/superpowers/specs/2026-05-05-ceres-station-dock-system-design.md
 */
import { describe, it, expect } from 'vitest'
import { getItemDefinition } from '@/lib/inventory/catalog'

const ids = [
  'ceres-institute-canister',
  'ceres-mineral-results-crate',
  'ceres-dan-results-crate',
]

describe('Ceres Institute items', () => {
  it.each(ids)('registers %s with weight 1 and maxStack 1', (id) => {
    const def = getItemDefinition(id)
    expect(def).toBeTruthy()
    expect(def?.weightPerUnit).toBe(1)
    expect(def?.maxStack).toBe(1)
  })
})
