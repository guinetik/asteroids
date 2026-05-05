/**
 * Tests for {@link buildActiveContractHudRows}.
 *
 * @author guinetik
 * @date 2026-04-30
 */
import { describe, expect, it } from 'vitest'
import { buildActiveContractHudRows } from '../contractHudRows'
import type { Contract, ContractInstance } from '../contractTypes'

const BASE_SENT = '2306-01-01'

function minimalContract(id: string, inboxName: string, steps: Contract['steps']): Contract {
  return {
    id,
    inboxName,
    from: 'Test',
    sentAt: BASE_SENT,
    introSubject: 'Intro',
    introBody: ['x'],
    steps,
    completionSubject: 'Done',
    completionBody: ['y'],
    rewards: [],
  }
}

function instance(contractId: string, overrides: Partial<ContractInstance> = {}): ContractInstance {
  return {
    contractId,
    status: 'active',
    currentStepIndex: 0,
    stepCounters: [],
    offeredAt: null,
    acceptedAt: null,
    completedAt: null,
    resolvedOutcomeId: null,
    ...overrides,
  }
}

describe('buildActiveContractHudRows', () => {
  it('returns empty array when no qualifying instances', () => {
    expect(buildActiveContractHudRows([], () => null)).toEqual([])
    expect(
      buildActiveContractHudRows([instance('a', { status: 'completed' })], () =>
        minimalContract('a', 'A', [
          { kind: 'visit-planet', planetId: 'x', subject: 'S', flavor: [] },
        ]),
      ),
    ).toEqual([])
  })

  it('skips instances whose definition is missing', () => {
    const rows = buildActiveContractHudRows([instance('ghost')], () => null)
    expect(rows).toEqual([])
  })

  it('skips when currentStepIndex has no step', () => {
    const c = minimalContract('c', 'C', [
      { kind: 'visit-planet', planetId: 'mars', subject: 'One', flavor: [] },
    ])
    const rows = buildActiveContractHudRows([instance('c', { currentStepIndex: 99 })], (id) =>
      id === 'c' ? c : null,
    )
    expect(rows).toEqual([])
  })

  it('maps active multi-count step progress with clamping', () => {
    const c = minimalContract('multi', 'Multi Org', [
      {
        kind: 'complete-missions',
        count: 5,
        subject: 'Finish five gigs',
        flavor: [],
      },
    ])
    const rows = buildActiveContractHudRows(
      [
        instance('multi', {
          stepCounters: [7],
        }),
      ],
      (id) => (id === 'multi' ? c : null),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      contractId: 'multi',
      inboxName: 'Multi Org',
      currentStepIndex: 0,
      objectiveSubject: 'Finish five gigs',
      objectiveSummary: 'Complete 5 missions',
      progressCurrent: 5,
      progressRequired: 5,
    })
  })

  it('defaults missing counter to zero and sorts by contract id', () => {
    const zebra = minimalContract('zebra', 'Z', [
      { kind: 'visit-planet', planetId: 'a', subject: 'Z step', flavor: [] },
    ])
    const alpha = minimalContract('alpha', 'A', [
      { kind: 'visit-planet', planetId: 'b', subject: 'A step', flavor: [] },
    ])
    const catalog = new Map<string, Contract>([
      ['zebra', zebra],
      ['alpha', alpha],
    ])
    const rows = buildActiveContractHudRows(
      [instance('zebra', { stepCounters: [] }), instance('alpha')],
      (id) => catalog.get(id) ?? null,
    )
    expect(rows.map((r) => r.contractId)).toEqual(['alpha', 'zebra'])
    expect(rows[0]?.progressRequired).toBe(1)
    expect(rows[0]?.progressCurrent).toBe(0)
  })
})
