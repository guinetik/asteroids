/**
 * Tests for contractNoticeLabel — the pure mapper that turns a contract-origin
 * ShipMessageReadable + its contract display name into the cyan /map pill text.
 */
import { describe, expect, it } from 'vitest'
import type { ShipMessageReadable } from '@/lib/messages/messageTypes'
import { contractNoticeLabel } from '@/lib/messages/contractNoticeLabel'

function makeReadable(
  overrides: Partial<ShipMessageReadable> & Pick<ShipMessageReadable, 'contractMessageKind'>,
): ShipMessageReadable {
  return {
    id: 'msg',
    from: 'Dispatcher',
    subject: 'Subject',
    sentAt: '2412.09.14',
    body: ['paragraph'],
    trigger: 'contract',
    delivery: 'inbox_prompt',
    priority: 0,
    inboxStatus: 'pending',
    contractId: 'gravity-surfer',
    ...overrides,
  }
}

describe('contractNoticeLabel', () => {
  it('returns the generic offer label for an intro message', () => {
    const label = contractNoticeLabel(
      makeReadable({ contractMessageKind: 'intro' }),
      'Gravity Surfer',
    )
    expect(label).toBe('NEW CONTRACT OFFER')
  })

  it('returns a named updated label for a brief (active dossier) message', () => {
    const label = contractNoticeLabel(
      makeReadable({ contractMessageKind: 'brief' }),
      'Gravity Surfer',
    )
    expect(label).toBe('CONTRACT UPDATED: Gravity Surfer')
  })

  it('returns a named updated label for a step flavor message', () => {
    const label = contractNoticeLabel(
      makeReadable({ contractMessageKind: 'step' }),
      'Gravity Surfer',
    )
    expect(label).toBe('CONTRACT UPDATED: Gravity Surfer')
  })

  it('returns a named complete label for a completion message', () => {
    const label = contractNoticeLabel(
      makeReadable({ contractMessageKind: 'completion' }),
      'Gravity Surfer',
    )
    expect(label).toBe('CONTRACT COMPLETE: Gravity Surfer')
  })

  it('falls back to a generic updated label when the contract name is missing', () => {
    const label = contractNoticeLabel(
      makeReadable({ contractMessageKind: 'step' }),
      null,
    )
    expect(label).toBe('CONTRACT UPDATED')
  })
})
