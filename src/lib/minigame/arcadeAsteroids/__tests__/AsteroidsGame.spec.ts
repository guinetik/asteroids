/**
 * Tests for the classic arcade Asteroids simulation.
 *
 * @author guinetik
 * @date 2026-05-09
 * @spec docs/superpowers/specs/2026-05-09-arcade-asteroids-design.md
 */

import { describe, expect, it } from 'vitest'
import { ASTEROIDS_GAME_CONFIG } from '../config'
import { AsteroidsGame } from '../AsteroidsGame'
import type { AsteroidsGameState, AsteroidsInputs } from '../types'

const WIDTH = 800
const HEIGHT = 600
const CENTER_X = WIDTH / 2
const CENTER_Y = HEIGHT / 2
const IDLE_INPUTS: AsteroidsInputs = {
  rotateLeft: false,
  rotateRight: false,
  thrust: false,
  fire: false,
  hyperspace: false,
  start: false,
}

function sequence(values: readonly number[]): () => number {
  let index = 0
  return () => {
    const value = values[index] ?? values[values.length - 1] ?? 0
    index += 1
    return value
  }
}

function stateWith(overrides: Partial<AsteroidsGameState>): AsteroidsGameState {
  return {
    phase: 'playing',
    width: WIDTH,
    height: HEIGHT,
    score: 0,
    highScore: 0,
    lives: 3,
    wave: 1,
    nextEntityId: 10,
    ship: {
      id: 0,
      x: CENTER_X,
      y: CENTER_Y,
      vx: 0,
      vy: 0,
      angle: 0,
      radius: ASTEROIDS_GAME_CONFIG.shipRadius,
      invulnerableTimer: 0,
      respawnTimer: 0,
      visible: true,
    },
    bullets: [],
    saucerBullets: [],
    asteroids: [],
    saucer: null,
    fireCooldown: 0,
    saucerSpawnTimer: 99,
    hyperspaceCooldown: 0,
    message: null,
    ...overrides,
  }
}

describe('AsteroidsGame', () => {
  it('starts in attract mode and enters the first wave on start input', () => {
    const game = new AsteroidsGame({ width: WIDTH, height: HEIGHT, random: sequence([0.2]) })

    expect(game.snapshot().phase).toBe('attract')

    game.tick(0.016, { ...IDLE_INPUTS, start: true })
    const state = game.snapshot()

    expect(state.phase).toBe('playing')
    expect(state.lives).toBe(3)
    expect(state.wave).toBe(1)
    expect(state.asteroids).toHaveLength(ASTEROIDS_GAME_CONFIG.initialAsteroidCount)
  })

  it('applies thrust in the facing direction and wraps the ship around the screen', () => {
    const game = new AsteroidsGame({
      width: WIDTH,
      height: HEIGHT,
      random: sequence([0.5]),
      initialState: stateWith({
        ship: {
          id: 0,
          x: WIDTH - 1,
          y: CENTER_Y,
          vx: 30,
          vy: 0,
          angle: 0,
          radius: ASTEROIDS_GAME_CONFIG.shipRadius,
          invulnerableTimer: 0,
          respawnTimer: 0,
          visible: true,
        },
      }),
    })

    game.tick(1, { ...IDLE_INPUTS, thrust: true })
    const ship = game.snapshot().ship

    expect(ship.vx).toBeGreaterThan(30)
    expect(ship.x).toBeLessThan(ASTEROIDS_GAME_CONFIG.shipRadius * 2)
  })

  it('fires bullets with cooldown and expires them after their lifetime', () => {
    const game = new AsteroidsGame({
      width: WIDTH,
      height: HEIGHT,
      random: sequence([0.5]),
      initialState: stateWith({ fireCooldown: 0 }),
    })

    game.tick(0.016, { ...IDLE_INPUTS, fire: true })
    game.tick(0.016, { ...IDLE_INPUTS, fire: true })
    expect(game.snapshot().bullets).toHaveLength(1)

    game.tick(ASTEROIDS_GAME_CONFIG.bulletLifetimeSeconds + 0.1, IDLE_INPUTS)
    expect(game.snapshot().bullets).toHaveLength(0)
  })

  it('splits large asteroids into medium asteroids and awards points', () => {
    const game = new AsteroidsGame({
      width: WIDTH,
      height: HEIGHT,
      random: sequence([0.5, 0.25, 0.75]),
      initialState: stateWith({
        bullets: [
          {
            id: 1,
            x: CENTER_X,
            y: CENTER_Y,
            vx: 0,
            vy: 0,
            life: 1,
            radius: ASTEROIDS_GAME_CONFIG.bulletRadius,
          },
        ],
        asteroids: [
          {
            id: 2,
            x: CENTER_X,
            y: CENTER_Y,
            vx: 0,
            vy: 0,
            angle: 0,
            angularVelocity: 0,
            size: 'large',
            radius: ASTEROIDS_GAME_CONFIG.asteroidRadii.large,
            vertices: [],
          },
        ],
      }),
    })

    game.tick(0.016, IDLE_INPUTS)
    const state = game.snapshot()

    expect(state.score).toBe(ASTEROIDS_GAME_CONFIG.asteroidScores.large)
    expect(state.bullets).toHaveLength(0)
    expect(state.asteroids.map((a) => a.size)).toEqual(['medium', 'medium'])
  })

  it('consumes a life on ship collision and ends the game after the final life', () => {
    const collidingAsteroid = {
      id: 2,
      x: CENTER_X,
      y: CENTER_Y,
      vx: 0,
      vy: 0,
      angle: 0,
      angularVelocity: 0,
      size: 'small' as const,
      radius: ASTEROIDS_GAME_CONFIG.asteroidRadii.small,
      vertices: [],
    }
    const game = new AsteroidsGame({
      width: WIDTH,
      height: HEIGHT,
      random: sequence([0.5]),
      initialState: stateWith({ lives: 1, asteroids: [collidingAsteroid] }),
    })

    game.tick(0.016, IDLE_INPUTS)

    expect(game.snapshot().phase).toBe('gameOver')
    expect(game.snapshot().highScore).toBe(0)
  })

  it('starts the next wave after all asteroids are cleared', () => {
    const game = new AsteroidsGame({
      width: WIDTH,
      height: HEIGHT,
      random: sequence([0.2, 0.4, 0.6, 0.8]),
      initialState: stateWith({ wave: 1, asteroids: [] }),
    })

    game.tick(0.016, IDLE_INPUTS)
    const state = game.snapshot()

    expect(state.wave).toBe(2)
    expect(state.asteroids).toHaveLength(ASTEROIDS_GAME_CONFIG.initialAsteroidCount + 1)
  })

  it('spawns saucers that cross the screen and fire at the player', () => {
    const game = new AsteroidsGame({
      width: WIDTH,
      height: HEIGHT,
      random: sequence([0, 0.5, 0.25]),
      initialState: stateWith({ saucerSpawnTimer: 0 }),
    })

    game.tick(0.016, IDLE_INPUTS)
    expect(game.snapshot().saucer).not.toBeNull()

    game.tick(ASTEROIDS_GAME_CONFIG.saucerFireIntervalSeconds + 0.01, IDLE_INPUTS)
    expect(game.snapshot().saucerBullets).toHaveLength(1)
  })

  it('hyperspace teleports the ship and can destroy it on the risk branch', () => {
    const safeGame = new AsteroidsGame({
      width: WIDTH,
      height: HEIGHT,
      random: sequence([0.25, 0.75, 0.99]),
      initialState: stateWith({ hyperspaceCooldown: 0 }),
    })
    safeGame.tick(0.016, { ...IDLE_INPUTS, hyperspace: true })

    expect(safeGame.snapshot().ship.x).toBe(200)
    expect(safeGame.snapshot().ship.y).toBe(450)
    expect(safeGame.snapshot().lives).toBe(3)

    const riskyGame = new AsteroidsGame({
      width: WIDTH,
      height: HEIGHT,
      random: sequence([0.25, 0.75, 0]),
      initialState: stateWith({ lives: 2, hyperspaceCooldown: 0 }),
    })
    riskyGame.tick(0.016, { ...IDLE_INPUTS, hyperspace: true })

    expect(riskyGame.snapshot().lives).toBe(1)
    expect(riskyGame.snapshot().phase).toBe('respawning')
  })

  it('tracks high score when the run ends', () => {
    const game = new AsteroidsGame({
      width: WIDTH,
      height: HEIGHT,
      random: sequence([0.5]),
      highScore: 500,
      initialState: stateWith({
        score: 1200,
        highScore: 500,
        lives: 1,
        asteroids: [
          {
            id: 2,
            x: CENTER_X,
            y: CENTER_Y,
            vx: 0,
            vy: 0,
            angle: 0,
            angularVelocity: 0,
            size: 'small',
            radius: ASTEROIDS_GAME_CONFIG.asteroidRadii.small,
            vertices: [],
          },
        ],
      }),
    })

    game.tick(0.016, IDLE_INPUTS)

    expect(game.snapshot().phase).toBe('gameOver')
    expect(game.snapshot().highScore).toBe(1200)
  })
})
