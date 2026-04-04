import { describe, it, expect, vi } from 'vitest'
import { TickHandler } from '../TickHandler'
import type { Tickable } from '../Tickable'

function makeTickable(): Tickable & { tick: ReturnType<typeof vi.fn> } {
  return { tick: vi.fn() }
}

describe('TickHandler', () => {
  it('calls registered tickables with delta time', () => {
    const handler = new TickHandler()
    const a = makeTickable()
    handler.register(a)

    handler.tick(0.016)

    expect(a.tick).toHaveBeenCalledWith(0.016)
  })

  it('does not call unregistered tickables', () => {
    const handler = new TickHandler()
    const a = makeTickable()
    handler.register(a)
    handler.unregister(a)

    handler.tick(0.016)

    expect(a.tick).not.toHaveBeenCalled()
  })

  it('calls tickables in priority order (lower first)', () => {
    const handler = new TickHandler()
    const order: string[] = []
    const a: Tickable = { tick: () => order.push('a') }
    const b: Tickable = { tick: () => order.push('b') }
    const c: Tickable = { tick: () => order.push('c') }

    handler.register(c, 30)
    handler.register(a, 0)
    handler.register(b, 10)

    handler.tick(0.016)

    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('uses default priority 0 when none specified', () => {
    const handler = new TickHandler()
    const order: string[] = []
    const a: Tickable = { tick: () => order.push('a') }
    const b: Tickable = { tick: () => order.push('b') }

    handler.register(b, 10)
    handler.register(a) // default 0

    handler.tick(0.016)

    expect(order).toEqual(['a', 'b'])
  })

  it('ignores duplicate registration', () => {
    const handler = new TickHandler()
    const a = makeTickable()
    handler.register(a)
    handler.register(a)

    handler.tick(0.016)

    expect(a.tick).toHaveBeenCalledTimes(1)
  })
})
