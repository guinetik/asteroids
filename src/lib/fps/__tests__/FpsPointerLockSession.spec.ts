import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FpsPointerLockSession } from '../FpsPointerLockSession'

describe('FpsPointerLockSession', () => {
  let session: FpsPointerLockSession
  let canvas: HTMLDivElement

  beforeEach(() => {
    session = new FpsPointerLockSession()
    canvas = document.createElement('div')

    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      writable: true,
      value: null,
    })
    Object.defineProperty(document, 'exitPointerLock', {
      configurable: true,
      writable: true,
      value: vi.fn(() => {
        ;(document as Document & { pointerLockElement: Element | null }).pointerLockElement = null
      }),
    })
    Object.defineProperty(canvas, 'requestPointerLock', {
      configurable: true,
      writable: true,
      value: vi.fn(() => {
        ;(document as Document & { pointerLockElement: Element | null }).pointerLockElement = canvas
      }),
    })
  })

  it('forwards mouse movement only while the canvas owns pointer lock', () => {
    const onMouseDelta = vi.fn()
    session.attach(canvas, { onMouseDelta })

    document.dispatchEvent(new MouseEvent('mousemove', { movementX: 5, movementY: -3 }))
    expect(onMouseDelta).not.toHaveBeenCalled()
    ;(document as Document & { pointerLockElement: Element | null }).pointerLockElement = canvas
    document.dispatchEvent(new MouseEvent('mousemove', { movementX: 5, movementY: -3 }))
    expect(onMouseDelta).toHaveBeenCalledWith(5, -3)
  })

  it('tracks primary and secondary mouse buttons and consumes the primary edge once', () => {
    session.attach(canvas, {})
    ;(document as Document & { pointerLockElement: Element | null }).pointerLockElement = canvas

    document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }))
    document.dispatchEvent(new MouseEvent('mousedown', { button: 2 }))

    expect(session.isLeftMouseDown).toBe(true)
    expect(session.isRightMouseDown).toBe(true)
    expect(session.consumeLeftMouseJustPressed()).toBe(true)
    expect(session.consumeLeftMouseJustPressed()).toBe(false)

    document.dispatchEvent(new MouseEvent('mouseup', { button: 0 }))
    document.dispatchEvent(new MouseEvent('mouseup', { button: 2 }))

    expect(session.isLeftMouseDown).toBe(false)
    expect(session.isRightMouseDown).toBe(false)
  })

  it('resets mouse state and emits unlock when pointer lock is lost', () => {
    const onLockChange = vi.fn()
    session.attach(canvas, { onLockChange })
    ;(document as Document & { pointerLockElement: Element | null }).pointerLockElement = canvas

    document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }))
    ;(document as Document & { pointerLockElement: Element | null }).pointerLockElement = null
    document.dispatchEvent(new Event('pointerlockchange'))

    expect(session.isLeftMouseDown).toBe(false)
    expect(session.consumeLeftMouseJustPressed()).toBe(false)
    expect(onLockChange).toHaveBeenCalledWith(false)
  })

  it('requests pointer lock on click and can release it later', () => {
    session.attach(canvas, {})

    canvas.dispatchEvent(new MouseEvent('click'))
    expect(canvas.requestPointerLock).toHaveBeenCalledTimes(1)

    session.releaseLock()
    expect(document.exitPointerLock).toHaveBeenCalledTimes(1)
  })

  it('refreshes callbacks when reattached to the same canvas', () => {
    const first = vi.fn()
    const second = vi.fn()

    session.attach(canvas, { onLockChange: first })
    session.attach(canvas, { onLockChange: second })

    document.dispatchEvent(new Event('pointerlockchange'))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith(false)
  })
})
