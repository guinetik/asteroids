import { describe, expect, it, vi } from 'vitest'
import { ArcadeCabinetSession } from '../ArcadeCabinetSession'
import { ArcadeRomRegistry } from '../ArcadeRomRegistry'
import type {
  ArcadeRom,
  ArcadeRomEvent,
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

function makeRomWithEvents(): ArcadeRom & { enqueue: (e: ArcadeRomEvent) => void } {
  const queue: ArcadeRomEvent[] = []
  return {
    enqueue: (e) => queue.push(e),
    tick: () => {},
    render: () => {},
    attractTick: () => {},
    attractRender: () => {},
    start: () => {},
    reset: () => {},
    isRunComplete: () => false,
    hudSnapshot: () => ({ score: 0, highScore: 0, lives: 3, wave: 1, phaseLabel: 'ATTRACT' }),
    consumeEvents() {
      const out = queue.slice()
      queue.length = 0
      return out
    },
  }
}

describe('ArcadeCabinetSession event forwarding', () => {
  it('forwards drained events to onRomEvent with the active rom id', () => {
    const rom = makeRomWithEvents()
    const factory: ArcadeRomFactory = () => rom
    const registry = new ArcadeRomRegistry([META], { asteroids: factory })
    const onRomEvent = vi.fn()
    const session = new ArcadeCabinetSession({
      registry,
      width: 640,
      height: 480,
      storage: null,
      renderer: { drawAttract: () => {}, drawMenu: () => {}, drawPlay: () => {} },
      onRomEvent,
    })

    rom.enqueue({ type: 'runStarted', score: 0, wave: 1 })
    session.tick(0.016)

    expect(onRomEvent).toHaveBeenCalledWith('asteroids', {
      type: 'runStarted',
      score: 0,
      wave: 1,
    })
  })

  it('does not throw when onRomEvent is undefined', () => {
    const rom = makeRomWithEvents()
    const factory: ArcadeRomFactory = () => rom
    const registry = new ArcadeRomRegistry([META], { asteroids: factory })
    const session = new ArcadeCabinetSession({
      registry,
      width: 640,
      height: 480,
      storage: null,
      renderer: { drawAttract: () => {}, drawMenu: () => {}, drawPlay: () => {} },
    })
    rom.enqueue({ type: 'runEnded', score: 50, wave: 2 })
    expect(() => session.tick(0.016)).not.toThrow()
  })
})
