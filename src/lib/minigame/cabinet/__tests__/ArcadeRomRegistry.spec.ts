import { describe, expect, it, vi } from 'vitest'
import { ArcadeRomRegistry } from '../ArcadeRomRegistry'
import type { ArcadeRom, ArcadeRomDeps, ArcadeRomFactory, RomMeta } from '../types'

const META: RomMeta = {
  id: 'asteroids',
  title: 'ASTEROIDS',
  year: '1979',
  blurb: 'DESTROY THE ROCKS',
  highScoreKey: 'k',
}

function stubRom(): ArcadeRom {
  return {
    tick: () => {},
    render: () => {},
    attractTick: () => {},
    attractRender: () => {},
    start: () => {},
    reset: () => {},
    isRunComplete: () => true,
    hudSnapshot: () => ({ score: 0, highScore: 0, lives: 0, wave: 0, phaseLabel: 'ATTRACT' }),
    consumeEvents: () => [],
  }
}

function deps(): ArcadeRomDeps {
  return { width: 640, height: 480, storage: null, meta: META }
}

describe('ArcadeRomRegistry', () => {
  it('lists metadata in catalog order', () => {
    const factory: ArcadeRomFactory = vi.fn(stubRom)
    const registry = new ArcadeRomRegistry([META], { asteroids: factory })
    expect(registry.list()).toEqual([META])
  })

  it('creates a ROM via the registered factory', () => {
    const factory: ArcadeRomFactory = vi.fn(stubRom)
    const registry = new ArcadeRomRegistry([META], { asteroids: factory })
    registry.create('asteroids', deps())
    expect(factory).toHaveBeenCalledOnce()
  })

  it('throws when a meta entry has no factory', () => {
    expect(() => new ArcadeRomRegistry([META], {})).toThrow(/no factory/i)
  })

  it('throws when the catalog has duplicate ids', () => {
    expect(() => new ArcadeRomRegistry([META, META], { asteroids: stubRom })).toThrow(/duplicate/i)
  })

  it('throws on create with an unknown id', () => {
    const registry = new ArcadeRomRegistry([META], { asteroids: stubRom })
    expect(() => registry.create('pong', deps())).toThrow(/unknown/i)
  })
})
