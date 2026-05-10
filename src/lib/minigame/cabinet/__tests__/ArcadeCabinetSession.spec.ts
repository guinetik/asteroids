import { describe, expect, it, vi } from 'vitest'
import { ArcadeCabinetSession } from '../ArcadeCabinetSession'
import { ArcadeRomRegistry } from '../ArcadeRomRegistry'
import type {
  ArcadeRom,
  ArcadeRomDeps,
  ArcadeRomFactory,
  RomMeta,
} from '../types'

const META: RomMeta = {
  id: 'asteroids',
  title: 'ASTEROIDS',
  year: '1979',
  blurb: '',
  highScoreKey: 'k',
}

interface RomCalls {
  tick: number
  render: number
  attractTick: number
  attractRender: number
  start: number
  reset: number
}

function makeRom(): ArcadeRom & { calls: RomCalls } {
  const calls: RomCalls = {
    tick: 0,
    render: 0,
    attractTick: 0,
    attractRender: 0,
    start: 0,
    reset: 0,
  }
  return {
    calls,
    tick: () => void calls.tick++,
    render: () => void calls.render++,
    attractTick: () => void calls.attractTick++,
    attractRender: () => void calls.attractRender++,
    start: () => void calls.start++,
    reset: () => void calls.reset++,
    isRunComplete: () => false,
    hudSnapshot: () => ({ score: 0, highScore: 0, lives: 3, wave: 1, phaseLabel: 'ATTRACT' }),
  }
}

function makeSession(): {
  session: ArcadeCabinetSession
  rom: ReturnType<typeof makeRom>
  drawAttract: ReturnType<typeof vi.fn>
  drawMenu: ReturnType<typeof vi.fn>
  drawPlay: ReturnType<typeof vi.fn>
} {
  const rom = makeRom()
  const factory: ArcadeRomFactory = (_deps: ArcadeRomDeps) => rom
  const registry = new ArcadeRomRegistry([META], { asteroids: factory })
  const drawAttract = vi.fn()
  const drawMenu = vi.fn()
  const drawPlay = vi.fn()
  const session = new ArcadeCabinetSession({
    registry,
    width: 640,
    height: 480,
    storage: null,
    renderer: { drawAttract, drawMenu, drawPlay },
  })
  return { session, rom, drawAttract, drawMenu, drawPlay }
}

describe('ArcadeCabinetSession', () => {
  it('starts in idle and ticks attract', () => {
    const { session, rom, drawAttract } = makeSession()
    expect(session.state).toBe('idle')
    session.tick(0.016)
    expect(rom.calls.attractTick).toBe(1)
    expect(drawAttract).toHaveBeenCalledOnce()
  })

  it('engage() transitions idle → engaging', () => {
    const { session } = makeSession()
    session.engage()
    expect(session.state).toBe('engaging')
  })

  it('completeEngage() advances engaging → menu', () => {
    const { session, drawMenu } = makeSession()
    session.engage()
    session.completeEngage()
    expect(session.state).toBe('menu')
    session.tick(0.016)
    expect(drawMenu).toHaveBeenCalledOnce()
  })

  it('menu Down then Up wraps the selection inside [0, list.length)', () => {
    const { session } = makeSession()
    session.engage()
    session.completeEngage()
    expect(session.menuIndex).toBe(0)
    session.menuDown()
    expect(session.menuIndex).toBe(0) // single ROM, wraps to itself
    session.menuUp()
    expect(session.menuIndex).toBe(0)
  })

  it('menuConfirm() transitions menu → playing and calls rom.start', () => {
    const { session, rom } = makeSession()
    session.engage()
    session.completeEngage()
    session.menuConfirm()
    expect(session.state).toBe('playing')
    expect(rom.calls.start).toBe(1)
  })

  it('escape() in playing → menu, in menu → disengaging', () => {
    const { session } = makeSession()
    session.engage()
    session.completeEngage()
    session.menuConfirm()
    expect(session.state).toBe('playing')
    session.escape()
    expect(session.state).toBe('menu')
    session.escape()
    expect(session.state).toBe('disengaging')
  })

  it('completeDisengage() returns to idle and resets the ROM', () => {
    const { session, rom } = makeSession()
    session.engage()
    session.completeEngage()
    session.escape()
    session.completeDisengage()
    expect(session.state).toBe('idle')
    expect(rom.calls.reset).toBe(1)
  })

  it('isEngaged() is true while not in idle', () => {
    const { session } = makeSession()
    expect(session.isEngaged()).toBe(false)
    session.engage()
    expect(session.isEngaged()).toBe(true)
    session.completeEngage()
    expect(session.isEngaged()).toBe(true)
    session.escape()
    expect(session.isEngaged()).toBe(true)
    session.completeDisengage()
    expect(session.isEngaged()).toBe(false)
  })

  it('invalid transitions are no-ops', () => {
    const { session } = makeSession()
    session.menuConfirm() // from idle, ignored
    expect(session.state).toBe('idle')
    session.escape() // from idle, ignored
    expect(session.state).toBe('idle')
  })
})
