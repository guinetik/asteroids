import { describe, expect, it } from 'vitest'
import { formatBindingCode, getKeybindingScreenReference } from '../keybindingReference'

describe('keybindingReference', () => {
  it('formats keyboard event codes for display', () => {
    expect(formatBindingCode('KeyW')).toBe('W')
    expect(formatBindingCode('Digit1')).toBe('1')
    expect(formatBindingCode('ShiftLeft')).toBe('Shift')
    expect(formatBindingCode('Space')).toBe('Space')
    expect(formatBindingCode('Escape')).toBe('Esc')
  })

  it('groups map controls into shuttle and space EVA modes', () => {
    const reference = getKeybindingScreenReference('map')

    expect(reference.title).toBe('MAP CONTROLS')
    expect(reference.modes.map((mode) => mode.title)).toEqual(['Shuttle', 'Space EVA'])
    expect(reference.modes[0]?.rows.map((row) => row.action)).toContain('Forward thrust')
    expect(reference.modes[1]?.rows.map((row) => row.action)).toContain('Ascend')
  })

  it('groups level controls into lander and asteroid EVA modes', () => {
    const reference = getKeybindingScreenReference('level')

    expect(reference.title).toBe('LEVEL CONTROLS')
    expect(reference.modes.map((mode) => mode.title)).toEqual(['Lander', 'Asteroid EVA'])
    expect(reference.modes[0]?.rows.map((row) => row.action)).toContain('Main engine')
    expect(reference.modes[1]?.rows.map((row) => row.action)).toContain('Drill tool')
  })
})
