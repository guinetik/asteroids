import { describe, it, expect } from 'vitest'
import { getTelescopeTarget, FALLBACK_TARGET } from '../targets'

describe('getTelescopeTarget', () => {
  it('returns the registered target for a known mission id', () => {
    const t = getTelescopeTarget('earth_l2_observatory_phasing')
    expect(t.image).toBe('deep_field.jpg')
    expect(t.label).toContain('JWST')
    expect(t.caption.length).toBeGreaterThan(0)
  })

  it('returns the fallback target for unknown mission ids', () => {
    const t = getTelescopeTarget('not_a_real_mission')
    expect(t).toBe(FALLBACK_TARGET)
  })

  it('fallback target points at the deep-field image', () => {
    expect(FALLBACK_TARGET.image).toBe('deep_field.jpg')
  })
})
