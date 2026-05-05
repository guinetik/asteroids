import { describe, expect, it } from 'vitest'
import { parseKeyPrompt } from '../parseKeyPrompt'

describe('parseKeyPrompt', () => {
  it('returns null for null/empty input', () => {
    expect(parseKeyPrompt(null)).toBeNull()
    expect(parseKeyPrompt(undefined)).toBeNull()
    expect(parseKeyPrompt('')).toBeNull()
    expect(parseKeyPrompt('   ')).toBeNull()
  })

  it('parses bracketed prefix `[E] OPEN PROSPECTUS`', () => {
    expect(parseKeyPrompt('[E] OPEN PROSPECTUS')).toEqual({
      key: 'E',
      label: 'OPEN PROSPECTUS',
    })
  })

  it('parses bracketed suffix `EVA [V]`', () => {
    expect(parseKeyPrompt('EVA [V]')).toEqual({ key: 'V', label: 'EVA' })
  })

  it('parses bracketed suffix `START MAINTENANCE [V]`', () => {
    expect(parseKeyPrompt('START MAINTENANCE [V]')).toEqual({
      key: 'V',
      label: 'START MAINTENANCE',
    })
  })

  it('parses single-letter unbracketed prefix `Q GRAVITY SURF`', () => {
    expect(parseKeyPrompt('Q GRAVITY SURF')).toEqual({
      key: 'Q',
      label: 'GRAVITY SURF',
    })
  })

  it('parses single-letter unbracketed prefix `Q ENTER VENUS MANIFOLD`', () => {
    expect(parseKeyPrompt('Q ENTER VENUS MANIFOLD')).toEqual({
      key: 'Q',
      label: 'ENTER VENUS MANIFOLD',
    })
  })

  it('parses two-space unbracketed prefix `F  Shuttle Control`', () => {
    expect(parseKeyPrompt('F  Shuttle Control')).toEqual({
      key: 'F',
      label: 'Shuttle Control',
    })
  })

  it('parses mouse-button prefix `LMB grab table`', () => {
    expect(parseKeyPrompt('LMB grab table')).toEqual({
      key: 'LMB',
      label: 'grab table',
    })
  })

  it('returns label-only for status banners with no key', () => {
    expect(parseKeyPrompt('RELEASING SURVIVORS')).toEqual({
      key: '',
      label: 'RELEASING SURVIVORS',
    })
    expect(parseKeyPrompt('LAND TO RELEASE THE SURVIVORS')).toEqual({
      key: '',
      label: 'LAND TO RELEASE THE SURVIVORS',
    })
    expect(parseKeyPrompt('HOSTILES INBOUND')).toEqual({
      key: '',
      label: 'HOSTILES INBOUND',
    })
  })

  it('does not treat 4-letter words like MINE/LAND/HEAL as keys', () => {
    expect(parseKeyPrompt('MINE NEUTRONS SAMPLE')).toEqual({
      key: '',
      label: 'MINE NEUTRONS SAMPLE',
    })
    expect(parseKeyPrompt('HEAL THE SURVIVORS TO FULL HEALTH')).toEqual({
      key: '',
      label: 'HEAL THE SURVIVORS TO FULL HEALTH',
    })
  })

  it('handles ALERT-level free-form text without a keycap', () => {
    expect(parseKeyPrompt('THE ALBEDO OF NEUTRONS ATTRACTS A NEARBY VIROID')).toEqual({
      key: '',
      label: 'THE ALBEDO OF NEUTRONS ATTRACTS A NEARBY VIROID',
    })
  })
})
