/**
 * Default keyboard bindings mapping action names to key codes.
 * Data-driven and rebindable at runtime via InputManager.setBindings().
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
/** Shuttle key bindings */
export const DEFAULT_BINDINGS: Record<string, string[]> = {
  thrust: ['KeyW'],
  brake: ['KeyS'],
  yawLeft: ['KeyA'],
  yawRight: ['KeyD'],
  toggleDoors: ['KeyF'],
  toggleCamera: ['KeyC'],
}

/** Lander key bindings */
export const LANDER_BINDINGS: Record<string, string[]> = {
  mainEngine: ['Space'],
  rcsLeft: ['KeyA'],
  rcsRight: ['KeyD'],
  rcsFore: ['KeyW'],
  rcsAft: ['KeyS'],
  rcsDescend: ['KeyC'],
  rcsAscend: ['ShiftLeft'],
}

/** FPS on-foot key bindings */
export const FPS_BINDINGS: Record<string, string[]> = {
  moveForward: ['KeyW'],
  moveBack: ['KeyS'],
  moveLeft: ['KeyA'],
  moveRight: ['KeyD'],
  jump: ['Space'],
  sprint: ['ShiftLeft'],
}
