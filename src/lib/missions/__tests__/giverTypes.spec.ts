/**
 * Type-level tests verifying that `requiresFlag` is present on both
 * `MissionGiver` (giver-level gate) and `MissionGiverTemplate` (per-mission
 * gate). These compile-time assertions fail if the fields are absent.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-29-jovian-prospectus-minigame-design.md
 */
import { describe, it, expectTypeOf } from 'vitest'
import type { MissionGiver } from '@/lib/missions/types'

describe('MissionGiver requiresFlag', () => {
  it('accepts requiresFlag at giver level', () => {
    expectTypeOf<MissionGiver['requiresFlag']>().toEqualTypeOf<string | undefined>()
  })

  it('accepts requiresFlag at mission level', () => {
    type MissionEntry = MissionGiver['missions'][number]
    expectTypeOf<MissionEntry['requiresFlag']>().toEqualTypeOf<string | undefined>()
  })
})
