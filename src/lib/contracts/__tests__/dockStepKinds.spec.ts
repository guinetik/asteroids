import { describe, it, expect } from 'vitest'
import type { ContractStep } from '@/lib/contracts/contractTypes'

describe('dock step kinds', () => {
  it('accepts pickup-from-asset', () => {
    const s: ContractStep = {
      kind: 'pickup-from-asset',
      assetRef: 'ceres-institute-station',
      itemId: 'ceres-institute-canister',
      count: 1,
      subject: 'Step 2',
      flavor: ['hello'],
    }
    expect(s.kind).toBe('pickup-from-asset')
  })
  it('accepts deliver-to-asset', () => {
    const s: ContractStep = {
      kind: 'deliver-to-asset',
      assetRef: 'ceres-institute-station',
      itemId: 'ceres-mineral-results-crate',
      count: 1,
      subject: 'Step 6',
      flavor: ['hand it over'],
    }
    expect(s.kind).toBe('deliver-to-asset')
  })
})
