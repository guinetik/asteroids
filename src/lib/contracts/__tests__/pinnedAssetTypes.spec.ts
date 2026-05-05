import { describe, it, expect } from 'vitest'
import type { PinnedAsset } from '@/lib/contracts/contractTypes'

describe('PinnedAsset discriminator', () => {
  it('accepts asteroid kind (default) without modelPath', () => {
    const a: PinnedAsset = { assetRef: 'hektor', region: 'jovian-trojans', label: 'Asset 2306-J' }
    expect(a.assetRef).toBe('hektor')
  })
  it('accepts station kind with modelPath + positionSeed', () => {
    const a: PinnedAsset = {
      assetRef: 'ceres-institute-station',
      kind: 'station',
      region: 'kuiper-belt',
      label: 'CIB Station',
      modelPath: 'models/station.glb',
      positionSeed: 'ceres-institute-station',
    }
    expect(a.kind).toBe('station')
  })
})
