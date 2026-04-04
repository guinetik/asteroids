import type { Tickable } from './Tickable'

/**
 * Centralized keyboard state with action-based bindings.
 * Controllers query named actions instead of raw key codes.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
export class InputManager implements Tickable {
  private heldKeys = new Set<string>()
  private justPressed = new Set<string>()
  private previousKeys = new Set<string>()
  private bindings: Record<string, string[]>
  private disposed = false

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    this.heldKeys.add(e.code)
  }

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.heldKeys.delete(e.code)
  }

  constructor(bindings: Record<string, string[]>) {
    this.bindings = { ...bindings }
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  setBindings(bindings: Record<string, string[]>): void {
    this.bindings = { ...bindings }
  }

  isActionActive(action: string): boolean {
    if (this.disposed) return false
    const keys = this.bindings[action]
    if (!keys) return false
    return keys.some((key) => this.heldKeys.has(key))
  }

  wasActionPressed(action: string): boolean {
    const keys = this.bindings[action]
    if (!keys) return false
    return keys.some((key) => this.justPressed.has(key))
  }

  tick(_dt: number): void {
    this.justPressed.clear()
    for (const key of this.heldKeys) {
      if (!this.previousKeys.has(key)) {
        this.justPressed.add(key)
      }
    }
    this.previousKeys = new Set(this.heldKeys)
  }

  dispose(): void {
    this.disposed = true
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.heldKeys.clear()
    this.justPressed.clear()
    this.previousKeys.clear()
  }
}
