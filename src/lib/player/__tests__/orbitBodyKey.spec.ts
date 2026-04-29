import { describe, it, expect } from 'vitest'
import { SUN } from '@/lib/planets/catalog'
import { orbitBodyKeyFromCaptureName } from '@/lib/player/orbitBodyKey'

describe('orbitBodyKeyFromCaptureName', () => {
  it('maps the Sun display name to sun', () => {
    expect(orbitBodyKeyFromCaptureName(SUN.name)).toBe('sun')
  })

  it('maps planet display names to planet ids', () => {
    expect(orbitBodyKeyFromCaptureName('Earth')).toBe('earth')
    expect(orbitBodyKeyFromCaptureName('Jupiter')).toBe('jupiter')
  })

  it('maps pinned body display names to pinned body ids', () => {
    expect(orbitBodyKeyFromCaptureName('624 Hektor')).toBe('hektor')
  })

  it('returns null for unknown bodies', () => {
    expect(orbitBodyKeyFromCaptureName('Nope')).toBeNull()
  })
})
