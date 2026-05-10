/**
 * Window-level keyboard subscriber that drives an ArcadeCabinetSession while
 * engaged. Stops propagation so habitat hotkeys (F/H/M…) don't fire under it.
 *
 * @author guinetik
 * @date 2026-05-10
 * @spec docs/superpowers/specs/2026-05-09-arcade-cabinet-projection-design.md
 */
import type { ArcadeCabinetSession } from './ArcadeCabinetSession'

const RECOGNIZED_CODES = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'KeyA',
  'KeyD',
  'KeyW',
  'KeyS',
  'Space',
  'KeyX',
  'Enter',
  'Escape',
])

/** DOM-side input gateway. Attach once per session, detach on dispose. */
export class ArcadeCabinetInput {
  private session: ArcadeCabinetSession | null = null
  private readonly onKeydown = (e: KeyboardEvent): void => this.handle(e, true)
  private readonly onKeyup = (e: KeyboardEvent): void => this.handle(e, false)

  /** Wire DOM listeners for the supplied session. */
  attach(session: ArcadeCabinetSession): void {
    this.session = session
    window.addEventListener('keydown', this.onKeydown, true)
    window.addEventListener('keyup', this.onKeyup, true)
  }

  /** Remove DOM listeners. */
  detach(): void {
    this.session = null
    window.removeEventListener('keydown', this.onKeydown, true)
    window.removeEventListener('keyup', this.onKeyup, true)
  }

  private handle(event: KeyboardEvent, pressed: boolean): void {
    const session = this.session
    if (!session || !session.isEngaged()) return
    if (!RECOGNIZED_CODES.has(event.code)) return

    event.preventDefault()
    event.stopImmediatePropagation()

    if (event.code === 'Escape') {
      if (pressed) session.escape()
      return
    }
    if (session.state === 'menu') {
      if (!pressed) return
      if (event.code === 'ArrowUp' || event.code === 'KeyW') session.menuUp()
      else if (event.code === 'ArrowDown' || event.code === 'KeyS')
        session.menuDown()
      else if (event.code === 'Enter') session.menuConfirm()
      return
    }
    if (session.state === 'playing') {
      const inputs = session.inputs
      switch (event.code) {
        case 'ArrowLeft':
        case 'KeyA':
          inputs.rotateLeft = pressed
          break
        case 'ArrowRight':
        case 'KeyD':
          inputs.rotateRight = pressed
          break
        case 'ArrowUp':
        case 'KeyW':
          inputs.thrust = pressed
          break
        case 'Space':
          inputs.fire = pressed
          break
        case 'KeyX':
          inputs.hyperspace = pressed
          break
        case 'Enter':
          inputs.enter = pressed
          inputs.start = pressed
          break
      }
    }
  }
}
