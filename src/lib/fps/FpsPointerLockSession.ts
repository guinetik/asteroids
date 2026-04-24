/**
 * Shared pointer-lock session helper for FPS-style controllers.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-fps-movement-design.md
 */

/**
 * Callbacks fired by {@link FpsPointerLockSession} as browser input events arrive.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-fps-movement-design.md
 */
export interface FpsPointerLockSessionCallbacks {
  /**
   * Relative mouse movement while the configured canvas is currently pointer-locked.
   *
   * @param movementX - Horizontal browser movement delta.
   * @param movementY - Vertical browser movement delta.
   */
  onMouseDelta?: (movementX: number, movementY: number) => void
  /**
   * Lock state change for the configured canvas.
   *
   * @param locked - Whether the canvas is now pointer-locked.
   */
  onLockChange?: (locked: boolean) => void
}

/**
 * Browser pointer-lock lifecycle + mouse-button state for FPS controllers.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-fps-movement-design.md
 */
export class FpsPointerLockSession {
  private canvas: HTMLElement | null = null
  private callbacks: FpsPointerLockSessionCallbacks = {}
  private leftMouseDown = false
  private leftMouseJustPressed = false
  private rightMouseDown = false

  /** Whether the primary fire button is currently held. */
  get isLeftMouseDown(): boolean {
    return this.leftMouseDown
  }

  /** Whether the secondary/aim button is currently held. */
  get isRightMouseDown(): boolean {
    return this.rightMouseDown
  }

  /**
   * Attach pointer-lock listeners to a render canvas.
   *
   * @param canvas - Render surface that should own pointer lock.
   * @param callbacks - Session callbacks for movement + lock state.
   */
  attach(canvas: HTMLElement, callbacks: FpsPointerLockSessionCallbacks): void {
    if (this.canvas === canvas) {
      this.callbacks = callbacks
      return
    }
    this.detach()
    this.canvas = canvas
    this.callbacks = callbacks

    document.addEventListener('mousemove', this.handleMouseMove)
    document.addEventListener('mousedown', this.handleMouseDown)
    document.addEventListener('mouseup', this.handleMouseUp)
    document.addEventListener('pointerlockchange', this.handlePointerLockChange)
    canvas.addEventListener('contextmenu', this.handleContextMenu)
    canvas.addEventListener('click', this.handleCanvasClick)
  }

  /** Remove all listeners and forget the active canvas. */
  detach(): void {
    document.removeEventListener('mousemove', this.handleMouseMove)
    document.removeEventListener('mousedown', this.handleMouseDown)
    document.removeEventListener('mouseup', this.handleMouseUp)
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange)
    if (this.canvas) {
      this.canvas.removeEventListener('contextmenu', this.handleContextMenu)
      this.canvas.removeEventListener('click', this.handleCanvasClick)
    }
    this.canvas = null
    this.callbacks = {}
    this.resetMouseButtons()
  }

  /** Ask the browser to pointer-lock the active canvas. */
  requestLock(): void {
    if (this.canvas && document.pointerLockElement !== this.canvas) {
      this.canvas.requestPointerLock()
    }
  }

  /** Release pointer lock if the active canvas currently owns it. */
  releaseLock(): void {
    if (this.canvas && document.pointerLockElement === this.canvas) {
      document.exitPointerLock()
    }
  }

  /**
   * Read and clear the one-frame left-click edge.
   *
   * @returns Whether the primary button was pressed since the last consume.
   */
  consumeLeftMouseJustPressed(): boolean {
    const justPressed = this.leftMouseJustPressed
    this.leftMouseJustPressed = false
    return justPressed
  }

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement !== this.canvas) return
    this.callbacks.onMouseDelta?.(event.movementX, event.movementY)
  }

  private readonly handleMouseDown = (event: MouseEvent): void => {
    if (document.pointerLockElement !== this.canvas) return
    if (event.button === 0) {
      this.leftMouseDown = true
      this.leftMouseJustPressed = true
    }
    if (event.button === 2) {
      this.rightMouseDown = true
    }
  }

  private readonly handleMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) {
      this.leftMouseDown = false
    }
    if (event.button === 2) {
      this.rightMouseDown = false
    }
  }

  private readonly handlePointerLockChange = (): void => {
    const locked = document.pointerLockElement === this.canvas
    if (!locked) {
      this.resetMouseButtons()
    }
    this.callbacks.onLockChange?.(locked)
  }

  private readonly handleContextMenu = (event: Event): void => {
    event.preventDefault()
  }

  private readonly handleCanvasClick = (): void => {
    this.requestLock()
  }

  private resetMouseButtons(): void {
    this.leftMouseDown = false
    this.leftMouseJustPressed = false
    this.rightMouseDown = false
  }
}
