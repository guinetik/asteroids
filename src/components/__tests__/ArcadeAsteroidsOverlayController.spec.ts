import { describe, expect, it, vi } from 'vitest'
import { ArcadeAsteroidsOverlayController } from '../ArcadeAsteroidsOverlayController'
import type { AsteroidsGameState } from '@/lib/minigame/arcadeAsteroids/types'

const WIDTH = 800
const HEIGHT = 600

describe('ArcadeAsteroidsOverlayController', () => {
  it('loads, updates, and resets high score through the provided storage', () => {
    const storage = new Map<string, string>()
    const controller = new ArcadeAsteroidsOverlayController({
      storage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
      },
      random: () => 0.5,
    })

    expect(controller.highScore.value).toBe(0)

    controller.resize(WIDTH, HEIGHT)
    controller.replaceStateForRestore({
      ...controller.snapshot.value,
      phase: 'gameOver',
      score: 2400,
      highScore: 2400,
    } as AsteroidsGameState)
    controller.persistHighScoreFromGame()

    expect(storage.get('asteroid-lander-arcade-asteroids-high-score-v1')).toBe('2400')
    expect(controller.highScore.value).toBe(2400)

    controller.resetHighScore()

    expect(controller.highScore.value).toBe(0)
    expect(storage.has('asteroid-lander-arcade-asteroids-high-score-v1')).toBe(false)
  })

  it('maps keydown and keyup events into arcade inputs', () => {
    const controller = new ArcadeAsteroidsOverlayController({
      storage: null,
      random: () => 0.5,
    })
    const preventDefault = vi.fn()
    const stopPropagation = vi.fn()

    controller.handleKeydown(new KeyboardEvent('keydown', { code: 'ArrowLeft' }), {
      preventDefault,
      stopPropagation,
    })
    controller.handleKeydown(new KeyboardEvent('keydown', { code: 'Space' }), {
      preventDefault,
      stopPropagation,
    })
    expect(controller.inputs.rotateLeft).toBe(true)
    expect(controller.inputs.fire).toBe(true)
    expect(preventDefault).toHaveBeenCalledTimes(2)
    expect(stopPropagation).toHaveBeenCalledTimes(2)

    controller.handleKeyup(new KeyboardEvent('keyup', { code: 'ArrowLeft' }), {
      preventDefault,
      stopPropagation,
    })
    controller.handleKeyup(new KeyboardEvent('keyup', { code: 'Space' }), {
      preventDefault,
      stopPropagation,
    })
    expect(controller.inputs.rotateLeft).toBe(false)
    expect(controller.inputs.fire).toBe(false)
    expect(stopPropagation).toHaveBeenCalledTimes(4)
  })

  it('uses X for hyperspace and consumes habitat H without triggering hyperspace', () => {
    const controller = new ArcadeAsteroidsOverlayController({
      storage: null,
      random: () => 0.5,
    })
    const preventDefault = vi.fn()
    const stopPropagation = vi.fn()

    controller.handleKeydown(new KeyboardEvent('keydown', { code: 'KeyH' }), {
      preventDefault,
      stopPropagation,
    })

    expect(controller.inputs.hyperspace).toBe(false)
    expect(stopPropagation).toHaveBeenCalledTimes(1)

    controller.handleKeydown(new KeyboardEvent('keydown', { code: 'KeyX' }), {
      preventDefault,
      stopPropagation,
    })
    expect(controller.inputs.hyperspace).toBe(true)

    controller.handleKeyup(new KeyboardEvent('keyup', { code: 'KeyX' }), {
      preventDefault,
      stopPropagation,
    })
    expect(controller.inputs.hyperspace).toBe(false)
  })

  it('consumes S as an arcade-reserved key so habitat movement cannot leak through', () => {
    const controller = new ArcadeAsteroidsOverlayController({
      storage: null,
      random: () => 0.5,
    })
    const preventDefault = vi.fn()
    const stopPropagation = vi.fn()

    controller.handleKeydown(new KeyboardEvent('keydown', { code: 'KeyS' }), {
      preventDefault,
      stopPropagation,
    })

    expect(controller.inputs.rotateLeft).toBe(false)
    expect(controller.inputs.rotateRight).toBe(false)
    expect(controller.inputs.thrust).toBe(false)
    expect(controller.inputs.fire).toBe(false)
    expect(controller.inputs.hyperspace).toBe(false)
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(stopPropagation).toHaveBeenCalledTimes(1)
  })
})
