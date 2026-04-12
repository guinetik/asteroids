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

  it('returns null for unknown bodies', () => {
    expect(orbitBodyKeyFromCaptureName('Nope')).toBeNull()
  })
})
