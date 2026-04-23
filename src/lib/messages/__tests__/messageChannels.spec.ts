/**
 * Tests for the inbox/contract channel predicates.
 */
import { describe, expect, it } from 'vitest'
import type { ShipMessageDefinition } from '@/lib/messages/messageTypes'
import { isContractMessage, isInboxMessage } from '@/lib/messages/messageChannels'

function makeDef(overrides: Partial<ShipMessageDefinition> = {}): ShipMessageDefinition {
  return {
    id: 'msg',
    from: 'Dispatcher',
    subject: 'Subject',
    sentAt: '2412.09.14',
    body: ['body'],
    trigger: 'map_start_earth_orbit',
    delivery: 'inbox_prompt',
    priority: 0,
    ...overrides,
  }
}

describe('isInboxMessage', () => {
  it('returns true when the definition has no contractMessageKind', () => {
    expect(isInboxMessage(makeDef())).toBe(true)
  })

  it('returns false when the definition has a contractMessageKind', () => {
    expect(isInboxMessage(makeDef({ contractMessageKind: 'intro' }))).toBe(false)
  })
})

describe('isContractMessage', () => {
  it('returns true when the definition has a contractMessageKind', () => {
    expect(isContractMessage(makeDef({ contractMessageKind: 'step' }))).toBe(true)
  })

  it('returns false when the definition has no contractMessageKind', () => {
    expect(isContractMessage(makeDef())).toBe(false)
  })
})
