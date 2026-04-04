import { describe, it, expect } from 'vitest'
import { PlatformerBody, GRAVITY_MOON } from '../platformerBody'

describe('PlatformerBody', () => {
  it('falls under gravity', () => {
    const body = new PlatformerBody({ gravity: GRAVITY_MOON })
    const y = body.tick(1, 100, 0)
    expect(y).toBeLessThan(100)
    expect(body.velocityY).toBeLessThan(0)
  })

  it('stops at the floor', () => {
    const body = new PlatformerBody({ gravity: 100 })
    const y = body.tick(1, 5, 0)
    expect(y).toBe(0)
    expect(body.velocityY).toBe(0)
    expect(body.grounded).toBe(true)
  })

  it('is not grounded when above floor', () => {
    const body = new PlatformerBody({ gravity: GRAVITY_MOON })
    body.tick(0.016, 100, 0)
    expect(body.grounded).toBe(false)
  })

  it('respects terminal velocity', () => {
    const body = new PlatformerBody({ gravity: 1000, terminalVelocity: 10 })
    body.tick(1, 1000, 0)
    expect(body.velocityY).toBe(-10)
  })

  it('impulse adds upward velocity', () => {
    const body = new PlatformerBody({ gravity: GRAVITY_MOON })
    body.tick(1, 0, 0) // grounded
    body.impulse(20)
    expect(body.velocityY).toBe(20)
    expect(body.grounded).toBe(false)
  })

  it('accumulates gravity over multiple frames', () => {
    const body = new PlatformerBody({ gravity: GRAVITY_MOON })
    let y = 100
    for (let i = 0; i < 60; i++) {
      y = body.tick(1 / 60, y, 0)
    }
    expect(y).toBeLessThan(100)
    expect(y).toBeGreaterThan(0)
  })
})
