/** A celestial body's bearing relative to the shuttle heading for the compass strip. */
export interface CompassBearing {
  /** Short label (e.g. "Sol", "Ea", "Ju") */
  label: string
  /** Bearing in radians relative to shuttle heading (0 = dead ahead, positive = right) */
  bearingRad: number
  /** CSS color string from the planet's accentColor */
  color: string
}

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
  /** Contextual top-center action prompt shown beneath position when available. */
  actionPrompt: string | null
  fuelLevel: number
  fuelCapacity: number
  thrustCharge: number
  thrustCapacity: number
  brakeCharge: number
  brakeCapacity: number
  rcsCharge: number
  rcsCapacity: number
  /** Current turret-mining beam charge (0..turretMiningCapacity). Used by the HUD while in turret mode. */
  turretMiningCharge: number
  /** Turret-mining charge capacity. Zero when no turret upgrade is installed. */
  turretMiningCapacity: number
  /** True while a turret session is active — HUD swaps the thruster cluster for the cyan MINE gauge. */
  turretActive: boolean
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
  /** Planet bearings for the compass strip. */
  compassBearings: CompassBearing[]
}

/** Toast state for synthetic spacetime ripples near the shuttle (map view). */
export interface GravitationalAnomalyHudState {
  /** When false, the Vue layer may still keep a local fade-out. */
  visible: boolean
  /** Increment to re-trigger the banner animation for a new message. */
  token: number
  /** Primary line (e.g. “Spacetime disturbance”). */
  title: string
  /** Secondary line (distance, duration, or “stabilizing”). */
  subtitle: string
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

/**
 * Radiation exposure state pushed to the HUD each frame.
 * Mirrors the {@link GravityWarningState} contract so the HUD overlay can drive
 * the radiation banner with the same per-frame push pattern.
 */
export interface RadiationWarningState {
  /**
   * Active radiation zone for this frame.
   * `0` means the ship is outside any radiation band; `1`–`3` index the nested
   * Sun-proximity bands defined by `radiationZone{1,2,3}Boundary`.
   */
  zone: 0 | 1 | 2 | 3
  /**
   * True when the active zone is non-zero **and** the player's
   * `shuttleRadiationResistance` is insufficient to fully shield it — i.e. the
   * hull is actively losing HP to radiation right now. Drives both the banner
   * tier and the geiger-counter audio loop.
   */
  damageActive: boolean
  /** Whether the warning banner should be rendered (`zone > 0`). */
  visible: boolean
}

/** Screen-projected position for a celestial body label. */
export interface MapBodyLabel {
  /** Display name */
  name: string
  /** Stable planet id used for click handlers (lowercase, matches `Planet.id`). Sun = `'sun'`. */
  id: string
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

/**
 * Screen-projected asteroid belt annulus, centered on the Sun. Both radii are
 * in viewport % so the renderer can place an absolutely-positioned div directly.
 */
export interface MapAsteroidBelt {
  /** Belt id (e.g. `main-belt`, `kuiper-belt`) — drives the per-belt CSS class. */
  id: string
  /** Belt display name — rendered as a label along the ring. */
  name: string
  /** Sun screen X (%) — annulus center. */
  centerX: number
  /** Sun screen Y (%) — annulus center. */
  centerY: number
  /** Outer radius along the viewport X axis, in % of viewport width. */
  outerRadiusX: number
  /** Outer radius along the viewport Y axis, in % of viewport height. */
  outerRadiusY: number
  /** Inner radius along the viewport X axis, in % of viewport width. */
  innerRadiusX: number
  /** Inner radius along the viewport Y axis, in % of viewport height. */
  innerRadiusY: number
}

/** Screen-projected point along the persistent ship world line. */
export interface MapTrajectoryPoint {
  /** Sample screen X (%) */
  screenX: number
  /** Sample screen Y (%) */
  screenY: number
}

/** Thermal zone classification used to style the tactical-map ring color. */
export type MapThermalZoneKind = 'hot1' | 'hot2' | 'hot3' | 'cold2' | 'cold3'

/**
 * Screen-projected annular thermal zone centered on the Sun.
 *
 * Separate X/Y radii are emitted so the renderer can draw a true screen-space
 * circle even when the SVG viewBox is stretched to a non-square viewport (a
 * single shared radius would render as an ellipse on widescreen monitors).
 */
export interface MapThermalZone {
  /** Zone classification — drives color/opacity in the overlay. */
  kind: MapThermalZoneKind
  /** Sun screen X (%) — ring center. */
  centerX: number
  /** Sun screen Y (%) — ring center. */
  centerY: number
  /** Inner edge radius along the viewport X axis, in % (0 for the innermost disc). */
  innerRadiusX: number
  /** Inner edge radius along the viewport Y axis, in %. */
  innerRadiusY: number
  /** Outer edge radius along the viewport X axis, in %. */
  outerRadiusX: number
  /** Outer edge radius along the viewport Y axis, in %. */
  outerRadiusY: number
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
  /** Asteroid belt annuli centered on the Sun (Main Belt, Kuiper Belt). */
  asteroidBelts: MapAsteroidBelt[]
  /** Thermal zone bands around the Sun (hot and cold protection zones). */
  thermalZones: MapThermalZone[]
  /** Persistent run-long world line in screen space */
  trajectoryPoints: MapTrajectoryPoint[]
  /** Mission waypoint projected to screen, if an active asteroid mission exists. */
  missionWaypoint: { screenX: number; screenY: number; name: string; distance: string } | null
  /**
   * Cargo safe-thermal band annulus, present only when the active mission is a
   * Bunker Extract with an organ in transit. All radii are in viewport % (same
   * convention as `thermalZones`) so the renderer can place the SVG paths
   * directly. Separate X/Y radii account for non-square viewports. The band is
   * centered on the Sun (world origin). Rendered as a translucent emerald ring
   * on the tactical map so the player can plan a route within the cargo-safe
   * corridor.
   */
  safeCargoBand?: {
    /** Sun screen X (%) — annulus centre. */
    centerX: number
    /** Sun screen Y (%) — annulus centre. */
    centerY: number
    /** Inner edge radius along the viewport X axis, in %. */
    innerRadiusX: number
    /** Inner edge radius along the viewport Y axis, in %. */
    innerRadiusY: number
    /** Outer edge radius along the viewport X axis, in %. */
    outerRadiusX: number
    /** Outer edge radius along the viewport Y axis, in %. */
    outerRadiusY: number
  }
}
