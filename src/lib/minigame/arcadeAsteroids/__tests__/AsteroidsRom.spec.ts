import { describe, expect, it } from 'vitest'
import { createAsteroidsRom } from '../AsteroidsRom'
import type { ArcadeRomDeps } from '@/lib/minigame/cabinet/types'

const META = {
  id: 'asteroids',
  title: 'ASTEROIDS',
  year: '1979',
  blurb: '',
  highScoreKey: 'test-key',
}

class MemStorage {
  store = new Map<string, string>()
  getItem = (k: string) => this.store.get(k) ?? null
  setItem = (k: string, v: string) => void this.store.set(k, v)
  removeItem = (k: string) => void this.store.delete(k)
}

function deps(storage: MemStorage = new MemStorage()): ArcadeRomDeps {
  return { width: 640, height: 480, storage, meta: META, random: () => 0.5 }
}

describe('AsteroidsRom adapter', () => {
  it('reports an attract phase before start', () => {
    const rom = createAsteroidsRom(deps())
    expect(rom.hudSnapshot().phaseLabel).toBe('ATTRACT')
  })

  it('loads the persisted high score from storage', () => {
    const storage = new MemStorage()
    storage.setItem(META.highScoreKey, '4200')
    const rom = createAsteroidsRom(deps(storage))
    expect(rom.hudSnapshot().highScore).toBe(4200)
  })

  it('start() leaves attract and begins a run', () => {
    const rom = createAsteroidsRom(deps())
    rom.start()
    expect(['PLAY', 'RESPAWN']).toContain(rom.hudSnapshot().phaseLabel)
  })

  it('reset() returns the ROM to attract', () => {
    const rom = createAsteroidsRom(deps())
    rom.start()
    rom.reset()
    expect(rom.hudSnapshot().phaseLabel).toBe('ATTRACT')
  })
})
