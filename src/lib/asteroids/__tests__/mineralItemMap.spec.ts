import { describe, expect, it } from 'vitest'
import { compositionNameToItemId, resolveCompositionItemId } from '../mineralItemMap'
import { ASTEROID_CATALOG } from '../catalog'

describe('compositionNameToItemId', () => {
  it('lowercases and hyphenates names with spaces', () => {
    expect(compositionNameToItemId('Iron-Nickel Alloy')).toBe('iron-nickel-alloy')
    expect(compositionNameToItemId('Hydrated Silicates')).toBe('hydrated-silicates')
  })

  it('collapses runs of separators into a single hyphen', () => {
    expect(compositionNameToItemId('Iron — Nickel  Alloy')).toBe('iron-nickel-alloy')
  })

  it('strips diacritics so unicode names resolve', () => {
    expect(compositionNameToItemId('Olívïne')).toBe('olivine')
  })

  it('trims leading and trailing hyphens', () => {
    expect(compositionNameToItemId('  Iron! ')).toBe('iron')
  })
})

describe('resolveCompositionItemId', () => {
  it('returns the catalog item id for every mineral on every asteroid', () => {
    const missing: string[] = []
    for (const asteroid of ASTEROID_CATALOG) {
      for (const entry of asteroid.composition) {
        if (resolveCompositionItemId(entry.name) === null) {
          missing.push(`${asteroid.id} / ${entry.name}`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('returns null for an unknown mineral name', () => {
    expect(resolveCompositionItemId('Unobtanium')).toBeNull()
  })
})
