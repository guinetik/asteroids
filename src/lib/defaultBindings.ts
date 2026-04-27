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
  // Cargo bay doors + map inspect camera toggle.
  toggleDoors: ['KeyR'],
  toggleCamera: ['KeyC'],
  gravitySurfingToggle: ['KeyQ'],
  orbitAction: ['KeyE'],
  // Begin/end EVA when within range of a POI. Default `V`; `beginMission` and `interact` stay
  // on `F` (waypoint + in-scene repair) so EVA can use its own key on the map.
  evaToggle: ['KeyV'],
  // In-scene minigame interaction — fires when the player is aimed at a broken
  // satellite component and wants to repair it. Shares KeyF with `beginMission`.
  interact: ['KeyF'],
  // EVA movement (only read while in EVA mode; keys reused from the shuttle set).
  evaForward: ['KeyW'],
  evaBack: ['KeyS'],
  evaStrafeLeft: ['KeyA'],
  evaStrafeRight: ['KeyD'],
  evaUp: ['Space'],
  evaDown: ['ShiftLeft'],
  // At asteroid mission waypoint — begin landing approach (orbit must be free).
  beginMission: ['KeyF'],
  toggleMap: ['KeyM'],
  focusHabitat: ['KeyH'],
  shopAction: ['KeyB'],
  /** Shuttle terminal: Engineering Bay (upgrades) while orbiting a serviced planet. */
  engineeringBayAction: ['KeyU'],
  /** Shuttle terminal: Mission Board while orbiting a serviced planet. */
  missionBoardAction: ['KeyJ'],
  missionAction: ['KeyI'],
  closeMap: ['Escape'],
  toggleTurret: ['KeyT'],
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
  yawLeft: ['KeyQ'],
  yawRight: ['KeyE'],
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
  toolScience: ['Digit3'],
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
  yawLeft: ['KeyQ'],
  yawRight: ['KeyE'],
  // FPS controls
  moveForward: ['KeyW'],
  moveBack: ['KeyS'],
  moveLeft: ['KeyA'],
  moveRight: ['KeyD'],
  jump: ['Space'],
  sprint: ['ShiftLeft'],
  toolDrill: ['Digit1'],
  toolWeapon: ['Digit2'],
  toolScience: ['Digit3'],
  // Shared
  interact: ['KeyF'],
  terminalInteract: ['KeyE'],
  skipCinematic: ['Escape'],
  toggleMap: ['KeyM'],
  toggleInventory: ['KeyB'],
}

/** Habitat interior key bindings — FPS walk + interact. */
export const HABITAT_BINDINGS: Record<string, string[]> = {
  moveForward: ['KeyW'],
  moveBack: ['KeyS'],
  moveLeft: ['KeyA'],
  moveRight: ['KeyD'],
  interact: ['KeyF'],
  exitHabitat: ['KeyH', 'Escape'],
}
