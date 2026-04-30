import { describe, it, expectTypeOf } from 'vitest'
import type { ObjectiveType } from '@/lib/missions/types'

describe('ObjectiveType', () => {
  it('includes prospectus-terminal', () => {
    expectTypeOf<'prospectus-terminal'>().toMatchTypeOf<ObjectiveType>()
  })
})
