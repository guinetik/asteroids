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
  /** Map-only magenta cosmetic terminal while docked at Fantasia's serviced worlds. */
  cosmeticShopAction: ['KeyP'],
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
  resetCamera: ['KeyR'],
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
  // Arrow keys drive keyboard look — useful on a laptop trackpad where
  // mouse look is awkward. Mouse and keyboard look both feed FpsCamera
  // and can be used together.
  lookUp: ['ArrowUp'],
  lookDown: ['ArrowDown'],
  lookLeft: ['ArrowLeft'],
  lookRight: ['ArrowRight'],
  // Keyboard fire — trackpad-friendly alternative to left mouse button.
  // OR'd with the mouse state so either source can shoot.
  fire: ['Enter'],
  // Keyboard ADS toggle — trackpad-friendly alternative to holding right
  // mouse. Tap once to aim, tap again to un-aim. Survives mouse release
  // (a toggle that survives mouse release is the whole point).
  adsToggle: ['KeyR'],
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
  resetCamera: ['KeyR'],
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
  // Arrow-key look (trackpad-friendly camera) — see FPS_BINDINGS.
  lookUp: ['ArrowUp'],
  lookDown: ['ArrowDown'],
  lookLeft: ['ArrowLeft'],
  lookRight: ['ArrowRight'],
  // Keyboard fire — see FPS_BINDINGS.
  fire: ['Enter'],
  // Keyboard ADS toggle — see FPS_BINDINGS. Overlaps with the lander's
  // `resetCamera` on the same key; each controller reads its own action.
  adsToggle: ['KeyR'],
}

/** Habitat interior key bindings — FPS walk + interact. */
export const HABITAT_BINDINGS: Record<string, string[]> = {
  moveForward: ['KeyW'],
  moveBack: ['KeyS'],
  moveLeft: ['KeyA'],
  moveRight: ['KeyD'],
  interact: ['KeyF'],
  exitHabitat: ['KeyH'],
  // Arrow-key look (trackpad-friendly camera) — see FPS_BINDINGS.
  lookUp: ['ArrowUp'],
  lookDown: ['ArrowDown'],
  lookLeft: ['ArrowLeft'],
  lookRight: ['ArrowRight'],
}
