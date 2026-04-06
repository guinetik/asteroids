/**
 * All shuttle data pushed to the HUD each frame.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-thruster-fuel-hud-design.md
 */
export interface ShuttleTelemetry {
  speed: number
  heading: number
  posX: number
  posZ: number
  fuelLevel: number
  fuelCapacity: number
  thrustCharge: number
  thrustCapacity: number
  brakeCharge: number
  brakeCapacity: number
  rcsCharge: number
  rcsCapacity: number
  /** Seconds remaining before adrift game over. -1 when not adrift. */
  adriftCountdown: number
  /** Current hull HP */
  hp: number
  /** Maximum hull HP */
  maxHp: number
  /** Temperature (-100 to +100). Positive = hot, negative = cold. */
  temperature: number
  /** Whether the temperature gauge should be visible */
  temperatureVisible: boolean
  /** Current damage intensity (0 = no damage, 1 = max damage rate). Drives red vignette. */
  damageIntensity: number
}

/** Gravity danger state pushed to the HUD each frame. */
export interface GravityWarningState {
  /** 0 = safe (outside influence), 1 = at event horizon */
  proximity: number
  /** Name of the nearest massive body, or null if none */
  bodyName: string | null
  /** Whether the warning is visible (proximity > 0) */
  visible: boolean
}

/** Screen-projected position for a celestial body label. */
export interface MapBodyLabel {
  /** Display name */
  name: string
  /** Screen X as percentage (0–100) */
  screenX: number
  /** Screen Y as percentage (0–100) */
  screenY: number
  /** Formatted distance from ship */
  distance: string
}

/** Screen-projected distance line from ship to a body. */
export interface MapDistanceLine {
  /** Display name of the body */
  name: string
  /** Ship screen X (%) */
  shipX: number
  /** Ship screen Y (%) */
  shipY: number
  /** Body screen X (%) */
  bodyX: number
  /** Body screen Y (%) */
  bodyY: number
  /** Formatted distance string */
  distance: string
}

/** Screen-projected gravity ring. */
export interface MapGravityRing {
  /** Body display name */
  name: string
  /** Screen center X (%) */
  centerX: number
  /** Screen center Y (%) */
  centerY: number
  /** Influence ring radius in viewport % */
  influenceRadius: number
  /** Event horizon ring radius in viewport % */
  horizonRadius: number
}

/** Screen-projected point along the persistent ship world line. */
export interface MapTrajectoryPoint {
  /** Sample screen X (%) */
  screenX: number
  /** Sample screen Y (%) */
  screenY: number
}

/** Full state for the map overlay HUD. */
export interface MapOverlayState {
  /** Whether the overlay is visible */
  visible: boolean
  /** Planet/Sun labels */
  labels: MapBodyLabel[]
  /** Ship screen position X (%) */
  shipX: number
  /** Ship screen position Y (%) */
  shipY: number
  /** Ship heading arrow direction (CSS rotation degrees) */
  headingDeg: number
  /** Ship speed for arrow length scaling */
  speed: number
  /** Distance lines to nearest bodies */
  distances: MapDistanceLine[]
  /** Gravity influence + event horizon rings */
  gravityRings: MapGravityRing[]
  /** Persistent run-long world line in screen space */
  trajectoryPoints: MapTrajectoryPoint[]
}
