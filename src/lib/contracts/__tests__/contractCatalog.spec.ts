/**
 * Audit tests for CONTRACT_CATALOG: every shipped contract must declare a
 * `homePlanet` so the auto-grant fast-travel hook fires on completion.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-29-jovian-prospectus-minigame-design.md
 */
import { describe, it, expect } from 'vitest'
import { CONTRACT_CATALOG } from '@/lib/contracts/contractCatalog'

describe('CONTRACT_CATALOG homePlanet audit', () => {
  it('every contract has a homePlanet set', () => {
    const missing = CONTRACT_CATALOG.filter((c) => !c.homePlanet).map((c) => c.id)
    expect(missing).toEqual([])
  })
})
