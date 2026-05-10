/**
 * TDD tests for AsteroidsRom event emission — runStarted, runEnded, saucerKill.
 *
 * @author guinetik
 * @date 2026-05-09
 * @spec docs/superpowers/specs/2026-05-09-arcade-asteroids-design.md
 */
import { describe, expect, it, vi } from 'vitest'
import { createAsteroidsRom } from '../AsteroidsRom'
import { ASTEROIDS_GAME_CONFIG } from '../config'
import { AsteroidsGame } from '../AsteroidsGame'
import type { ArcadeRomDeps } from '@/lib/minigame/cabinet/types'
import type { AsteroidsGameState } from '../types'

const META = {
  id: 'asteroids',
  title: 'ASTEROIDS',
  year: '1979',
  blurb: '',
  highScoreKey: 'test-key',
}

/** Build a minimal ArcadeRomDeps fixture for tests. */
function deps(): ArcadeRomDeps {
  return { width: 640, height: 480, storage: null, meta: META, random: () => 0.5 }
}

/** All-false input bag for attract-mode ticks. */
function attractInputs() {
  return {
    rotateLeft: false,
    rotateRight: false,
    thrust: false,
    fire: false,
    hyperspace: false,
    start: false,
    up: false,
    down: false,
    enter: false,
  }
}

describe('AsteroidsRom event emission', () => {
  it('emits runStarted when start() is called', () => {
    const rom = createAsteroidsRom(deps())
    rom.start()
    const events = rom.consumeEvents()
    expect(events.some((e) => e.type === 'runStarted')).toBe(true)
  })

  it('drains the queue (subsequent consume returns empty)', () => {
    const rom = createAsteroidsRom(deps())
    rom.start()
    rom.consumeEvents()
    expect(rom.consumeEvents()).toEqual([])
  })

  it('saucerKill heuristic: prev saucer present + curr null + score jump ≥ small-saucer score', () => {
    const rom = createAsteroidsRom(deps())
    rom.start()
    rom.consumeEvents()

    const stubSeq: AsteroidsGameState[] = [
      buildSnapshot({
        phase: 'playing',
        score: 0,
        wave: 1,
        saucer: makeSaucerStub(),
      }),
      buildSnapshot({
        phase: 'playing',
        score: ASTEROIDS_GAME_CONFIG.saucerScore.small,
        wave: 1,
        saucer: null,
      }),
    ]
    let i = 0
    const spy = vi
      .spyOn(AsteroidsGame.prototype, 'snapshot')
      .mockImplementation((): AsteroidsGameState => stubSeq[Math.min(i, stubSeq.length - 1)]!)

    rom.tick(0.016, attractInputs())
    i = 1
    rom.tick(0.016, attractInputs())

    const events = rom.consumeEvents()
    const kill = events.find((e) => e.type === 'event' && e.eventId === 'saucerKill')
    expect(kill).toBeDefined()
    expect(kill?.score).toBe(ASTEROIDS_GAME_CONFIG.saucerScore.small)
    expect(kill?.wave).toBe(1)

    spy.mockRestore()
  })

  it('does NOT emit saucerKill when saucer leaves without a score jump', () => {
    const rom = createAsteroidsRom(deps())
    rom.start()
    rom.consumeEvents()

    const stubSeq: AsteroidsGameState[] = [
      buildSnapshot({
        phase: 'playing',
        score: 0,
        wave: 1,
        saucer: makeSaucerStub(),
      }),
      buildSnapshot({ phase: 'playing', score: 0, wave: 1, saucer: null }),
    ]
    let i = 0
    const spy = vi
      .spyOn(AsteroidsGame.prototype, 'snapshot')
      .mockImplementation((): AsteroidsGameState => stubSeq[Math.min(i, stubSeq.length - 1)]!)

    rom.tick(0.016, attractInputs())
    i = 1
    rom.tick(0.016, attractInputs())

    const events = rom.consumeEvents()
    expect(events.some((e) => e.type === 'event' && e.eventId === 'saucerKill')).toBe(false)

    spy.mockRestore()
  })

  it('emits runEnded when phase transitions to gameOver (exactly once)', () => {
    const rom = createAsteroidsRom(deps())
    rom.start()
    rom.consumeEvents()

    const stubSeq: AsteroidsGameState[] = [
      buildSnapshot({ phase: 'playing', score: 1000, wave: 3, saucer: null }),
      buildSnapshot({ phase: 'gameOver', score: 1000, wave: 3, saucer: null }),
      buildSnapshot({ phase: 'gameOver', score: 1000, wave: 3, saucer: null }),
    ]
    let i = 0
    const spy = vi
      .spyOn(AsteroidsGame.prototype, 'snapshot')
      .mockImplementation((): AsteroidsGameState => stubSeq[Math.min(i, stubSeq.length - 1)]!)

    rom.tick(0.016, attractInputs())
    i = 1
    rom.tick(0.016, attractInputs())
    i = 2
    rom.tick(0.016, attractInputs())

    const events = rom.consumeEvents()
    const enders = events.filter((e) => e.type === 'runEnded')
    expect(enders.length).toBe(1)
    expect(enders[0]?.score).toBe(1000)
    expect(enders[0]?.wave).toBe(3)

    spy.mockRestore()
  })
})

/**
 * Build a minimal AsteroidsGameState fixture. Only `phase`, `score`, `wave`,
 * and `saucer` are inspected by the adapter under test; all other fields use
 * neutral defaults.
 */
function buildSnapshot(partial: Partial<AsteroidsGameState>): AsteroidsGameState {
  return {
    width: 640,
    height: 480,
    score: 0,
    highScore: 0,
    lives: 3,
    wave: 1,
    nextEntityId: 1,
    phase: 'playing',
    ship: makeShipStub(),
    asteroids: [],
    bullets: [],
    saucerBullets: [],
    saucer: null,
    saucerSpawnTimer: 0,
    respawnTimer: 0,
    fireCooldown: 0,
    hyperspaceCooldown: 0,
    message: null,
    ...partial,
  } as AsteroidsGameState
}

/** Minimal SaucerEntity fixture; all AsteroidsBody fields are present. */
function makeSaucerStub() {
  return {
    id: 99,
    x: 100,
    y: 100,
    vx: 0,
    vy: 0,
    radius: 12,
    size: 'small' as const,
    fireTimer: 0,
  }
}

/** Minimal AsteroidsShip fixture; all AsteroidsBody + ship fields are present. */
function makeShipStub() {
  return {
    id: 1,
    x: 320,
    y: 240,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 8,
    visible: true,
    invulnerableTimer: 0,
    respawnTimer: 0,
  }
}
