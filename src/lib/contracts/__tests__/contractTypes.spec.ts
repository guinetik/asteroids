import { describe, it, expectTypeOf } from 'vitest'
import type { Contract } from '@/lib/contracts/contractTypes'

describe('Contract', () => {
  it('accepts homePlanet', () => {
    expectTypeOf<Contract['homePlanet']>().toEqualTypeOf<string | undefined>()
  })
})
