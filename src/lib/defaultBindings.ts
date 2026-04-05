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
  orbitAction: ['KeyE'],
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
  toolDrill: ['Digit1'],
  toolWeapon: ['Digit2'],
  toolHeal: ['Digit3'],
}

/** Level bindings — combines lander + FPS + interact (F key). */
export const LEVEL_BINDINGS: Record<string, string[]> = {
  // Lander controls
  mainEngine: ['Space'],
  rcsLeft: ['KeyA'],
  rcsRight: ['KeyD'],
  rcsFore: ['KeyW'],
  rcsAft: ['KeyS'],
  rcsDescend: ['KeyC'],
  rcsAscend: ['ShiftLeft'],
  // FPS controls
  moveForward: ['KeyW'],
  moveBack: ['KeyS'],
  moveLeft: ['KeyA'],
  moveRight: ['KeyD'],
  jump: ['Space'],
  sprint: ['ShiftLeft'],
  toolDrill: ['Digit1'],
  toolWeapon: ['Digit2'],
  toolHeal: ['Digit3'],
  // Shared
  interact: ['KeyF'],
}
