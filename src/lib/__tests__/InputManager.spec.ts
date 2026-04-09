import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { InputManager } from '../InputManager'

const TEST_BINDINGS: Record<string, string[]> = {
  thrust: ['KeyW'],
  brake: ['KeyS'],
  toggleDoors: ['KeyR'],
}

function pressKey(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code }))
}

function releaseKey(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { code }))
}

describe('InputManager', () => {
  let input: InputManager

  beforeEach(() => {
    input = new InputManager(TEST_BINDINGS)
  })

  afterEach(() => {
    input.dispose()
  })

  it('reports inactive actions when no keys pressed', () => {
    expect(input.isActionActive('thrust')).toBe(false)
    expect(input.isActionActive('brake')).toBe(false)
  })

  it('reports active action when key is held', () => {
    pressKey('KeyW')
    expect(input.isActionActive('thrust')).toBe(true)
  })

  it('reports inactive action after key released', () => {
    pressKey('KeyW')
    releaseKey('KeyW')
    expect(input.isActionActive('thrust')).toBe(false)
  })

  it('detects action pressed this frame via wasActionPressed', () => {
    pressKey('KeyR')
    input.tick(0) // process the frame

    expect(input.wasActionPressed('toggleDoors')).toBe(true)
  })

  it('wasActionPressed returns false on subsequent frames', () => {
    pressKey('KeyR')
    input.tick(0) // frame 1: pressed
    input.tick(0) // frame 2: still held, but not "just pressed"

    expect(input.wasActionPressed('toggleDoors')).toBe(false)
  })

  it('wasActionPressed resets after release and re-press', () => {
    pressKey('KeyR')
    input.tick(0)
    releaseKey('KeyR')
    input.tick(0)

    pressKey('KeyR')
    input.tick(0)

    expect(input.wasActionPressed('toggleDoors')).toBe(true)
  })

  it('returns false for unknown actions', () => {
    expect(input.isActionActive('nonexistent')).toBe(false)
    expect(input.wasActionPressed('nonexistent')).toBe(false)
  })

  it('does not respond to keys after dispose', () => {
    input.dispose()
    pressKey('KeyW')
    expect(input.isActionActive('thrust')).toBe(false)
  })

  it('supports rebinding via setBindings', () => {
    input.setBindings({ thrust: ['ArrowUp'] })

    pressKey('KeyW')
    expect(input.isActionActive('thrust')).toBe(false)

    pressKey('ArrowUp')
    expect(input.isActionActive('thrust')).toBe(true)
  })
})
