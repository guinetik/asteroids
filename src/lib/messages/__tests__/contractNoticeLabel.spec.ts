/**
 * Tests for contractNoticeLabel — the pure mapper that turns a contract-origin
 * ShipMessageReadable into the cyan /map pill text.
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
  it('returns the offer label for an intro message', () => {
    expect(contractNoticeLabel(makeReadable({ contractMessageKind: 'intro' }))).toBe(
      'NEW CONTRACT OFFER',
    )
  })

  it('returns the updated label for a brief (active dossier) message', () => {
    expect(contractNoticeLabel(makeReadable({ contractMessageKind: 'brief' }))).toBe(
      'CONTRACT UPDATED',
    )
  })

  it('returns the updated label for a step flavor message', () => {
    expect(contractNoticeLabel(makeReadable({ contractMessageKind: 'step' }))).toBe(
      'CONTRACT UPDATED',
    )
  })

  it('returns the complete label for a completion message', () => {
    expect(contractNoticeLabel(makeReadable({ contractMessageKind: 'completion' }))).toBe(
      'CONTRACT COMPLETE',
    )
  })
})
