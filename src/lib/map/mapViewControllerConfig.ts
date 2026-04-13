import * as THREE from 'three'
import mapGravityData from '@/data/shuttle/map-gravity.json'
import { PLANETS, SUN } from '@/lib/planets/catalog'
import type { GravityConfig } from '@/lib/physics/gravity'
import { influenceRadius, eventHorizonRadius } from '@/lib/physics/gravity'
import { TICK_PRIORITY_INPUT, TICK_PRIORITY_RENDER } from '@/lib/tickPriorities'
import { SIZE_SCALE } from '@/lib/planets/constants'

/** Tick priority for the compositor (runs after animation, before render). */
export const TICK_PRIORITY_COMPOSIT = TICK_PRIORITY_RENDER - 1

/** One-shot action bridge runs just after input. */
export const ONE_SHOT_PRIORITY = TICK_PRIORITY_INPUT + 1

/** Sun + gas/ice giants only deform the space-time grid (Jupiter, Saturn, Uranus, Neptune). */
export const GRID_MASS_THRESHOLD = 4e-5

/** Wider map-only grid wells for gas giants. */
export const MAP_GRID_GAS_GIANT_WELL_WIDTH_MULT = 1.85

/** Baseline wireframe segments per axis on the map space-time grid. */
export const MAP_SPACE_TIME_GRID_BASE_RESOLUTION = 200

/** Density multiplier on segment count. */
export const MAP_SPACE_TIME_GRID_RESOLUTION_BOOST = 1.5

/** Resolved segment count for the map space-time grid wireframe. */
export const MAP_SPACE_TIME_GRID_RESOLUTION = Math.round(
  MAP_SPACE_TIME_GRID_BASE_RESOLUTION * MAP_SPACE_TIME_GRID_RESOLUTION_BOOST,
)

/** Visual scale for the shuttle in the map view. */
export const MAP_SHUTTLE_SCALE = 0.01

/** Approximate local-space shuttle size before map scaling. */
export const MAP_SHUTTLE_BASE_SIZE = 14

/** Fixed world-space collision radius for the shuttle in map free flight. */
export const MAP_SHUTTLE_COLLISION_RADIUS = (MAP_SHUTTLE_BASE_SIZE * MAP_SHUTTLE_SCALE) / 2

/** Cooldown between asteroid impacts so dense belts do not multi-hit every frame. */
export const ASTEROID_IMPACT_COOLDOWN_SEC = 0.5

/** Minimum hull damage from a map-view asteroid impact. */
export const ASTEROID_IMPACT_MIN_DAMAGE = 6

/** Maximum hull damage from a severe map-view asteroid impact. */
export const ASTEROID_IMPACT_MAX_DAMAGE = 28

/** Lower bound on the post-impact shove applied to the shuttle. */
export const ASTEROID_IMPACT_MIN_IMPULSE = 0.35

/** Multiplier from inbound speed to impact shove strength. */
export const ASTEROID_IMPACT_SPEED_TO_IMPULSE = 1.15

/** Extra impulse contributed by the asteroid's own size. */
export const ASTEROID_IMPACT_RADIUS_TO_IMPULSE = 1.4

/** Minimum camera shake for a light asteroid hit. */
export const ASTEROID_IMPACT_MIN_SHAKE = 0.45

/** Maximum camera shake for a severe asteroid hit. */
export const ASTEROID_IMPACT_MAX_SHAKE = 2.4

/** Duration of asteroid impact camera shake in seconds. */
export const ASTEROID_IMPACT_SHAKE_DURATION_SEC = 0.22

/** Minimum apparent shuttle size as a fraction of viewport height. */
export const MAP_SHUTTLE_MIN_APPARENT_SIZE = 0.012

/** How fast the shuttle scale lerps toward its target. */
export const MAP_SHUTTLE_SCALE_LERP = 8

/** Fixed apparent size of the tactical reticle as a fraction of screen height. */
export const MAP_RETICLE_APPARENT_SIZE = 0.06

/** Shuttle overscale multiplier at which the reticle begins fading in. */
export const MAP_RETICLE_FADE_START = 0.8

/** Shuttle overscale multiplier at which the reticle reaches full opacity. */
export const MAP_RETICLE_FADE_END = 2.0

/** Minimum planar speed before the reticle motion wedge appears. */
export const MAP_RETICLE_MIN_SPEED = 0.12

/** Target apparent size for the asteroid mission site marker. */
export const WAYPOINT_APPARENT_SIZE = 0.175

/** Offset behind Earth so the shuttle does not overlap the planet mesh. */
export const SPAWN_OFFSET_BEHIND_EARTH = 7.5

/** Y height above the map plane where the portal wormhole spawns during a portal arrival. */
export const PORTAL_ARRIVAL_WORMHOLE_Y = 1.5

/**
 * Wormhole core sphere radius for map-view portal arrivals, matched to Earth's apparent size.
 */
export const PORTAL_WORMHOLE_RADIUS =
  (PLANETS.find((p) => p.id === 'earth')?.displayRadius ?? 0.0077) * SIZE_SCALE * 0.5

/**
 * Seconds the camera holds on Earth alone before the wormhole becomes visible.
 * Gives players a moment to orient before the portal appears.
 */
export const PORTAL_EARTH_HOLD_DURATION = 0.5

/**
 * Seconds the wormhole is visible and stable before the eject pulse fires.
 * Camera stays on the wide static shot so players can see the portal opening.
 */
export const PORTAL_WORMHOLE_VIEW_DURATION = 1

/** How much grid slope affects shuttle speed. */
export const CURVATURE_SPEED_FACTOR = 0.3

/** Rail snap distance in grid cells for Gravity Surfing coupling. */
export const GRAVITY_SURF_SNAP_DISTANCE_CELLS = 0.2

/** Seconds to slide onto the rail during coupling (includes tether visual). */
export const GRAVITY_SURF_COUPLE_DURATION_SEC = 1.0

/** Seconds to fast-stop during manual decouple. */
export const GRAVITY_SURF_DECOUPLE_DURATION_SEC = 0.45

/** Default coupled rail cruise speed relative to map thrust speed. */
export const GRAVITY_SURF_CRUISE_SPEED_MULTIPLIER = 25

/** Seconds-ish response for ramping into gravity surf cruise. */
export const GRAVITY_SURF_ACCEL_PER_SEC = 10

/** Passive shuttle systems fuel drain multiplier while Gravity Surfing is active. */
export const GRAVITY_SURF_PASSIVE_FUEL_MULTIPLIER = 3

/** Maximum nose pitch applied while riding curved Gravity Surf rails. */
export const GRAVITY_SURF_MAX_PITCH_RAD = 0.12

/** Maximum roll applied while riding cross-curved Gravity Surf rails. */
export const GRAVITY_SURF_MAX_ROLL_RAD = 0.16

/** Response speed for easing Gravity Surf tilt toward the target pose. */
export const GRAVITY_SURF_TILT_RESPONSE_PER_SEC = 8

/** Speeds below this threshold count as fully stopped on the rail. */
export const GRAVITY_SURF_STOP_SPEED = 0.05

/** Strength of the first-pass decouple wave anomaly. */
export const GRAVITY_SURF_DECOUPLE_WAVE_MASS = 1.8e-5

/** First-pass decouple wave spreads wide rather than moving far. */
export const GRAVITY_SURF_DECOUPLE_WAVE_WIDTH_MULT = 1.1

/** Shed momentum carries the decouple wave forward along the rail. */
export const GRAVITY_SURF_DECOUPLE_WAVE_SPEED = 4

/** Lifetime of the synthetic decouple wave anomaly. */
export const GRAVITY_SURF_DECOUPLE_WAVE_DURATION_SEC = 2.5

/** Spawn the decouple wave well ahead of the shuttle nose — momentum shed forward. */
export const GRAVITY_SURF_DECOUPLE_WAVE_FORWARD_OFFSET = 40

// ─── Orbital Surfing (Manifold Highway) ────────────────────────────────────

/** World units below the grid plane for the manifold tunnel cruise altitude. */
export const ORBITAL_SURF_TUNNEL_DEPTH = 40

/** Cruise speed multiplier on maxThrustSpeed for spline travel. */
export const ORBITAL_SURF_CRUISE_SPEED_MULTIPLIER = 5

/** Seconds to dive from surface to tunnel depth (entry ramp). */
export const ORBITAL_SURF_RAMP_DURATION_SEC = 1.2

/** Seconds to snap onto the orbit path during coupling. */
export const ORBITAL_SURF_COUPLE_DURATION_SEC = 1.0

/** Max world units from an orbit ellipse point to allow attach. */
export const ORBITAL_SURF_SNAP_DISTANCE = 15

/** Passive fuel drain multiplier while orbital surfing (same as gravity surfing). */
export const ORBITAL_SURF_FUEL_MULTIPLIER = 3

/** Number of sample points along the orbital arc for the manifold spline. */
export const ORBITAL_SURF_SPLINE_SEGMENTS = 64

/** Deep indigo base color for manifold wireframe lines. */
export const ORBITAL_SURF_SPLINE_COLOR = 0x2a1a4e

/** Dim blue-violet edge glow for manifold lines. */
export const ORBITAL_SURF_SPLINE_GLOW_COLOR = 0x4433aa

/** Low opacity — ancient, dormant viroid infrastructure. */
export const ORBITAL_SURF_SPLINE_OPACITY = 0.25

/** Slow flicker speed for the manifold pulse — barely alive. */
export const ORBITAL_SURF_PULSE_SPEED = 0.4

/** Threshold where the whole space-time fabric is considered visible. */
export const GRID_DEFORM_WHOLE_MAP_COVERAGE = 0.82

/** Lower deform cadence while the whole map is visible. */
export const GRID_DEFORM_INTERVAL_SCALE_WHOLE_MAP = 3

/** Duration in seconds for the orbit-approach tether / lock animation. */
export const APPROACH_DURATION = 2.4

/** Seconds to fully charge slingshot from 0 to 1. */
export const SLINGSHOT_CHARGE_TIME = 2.0

/** Seconds without fuel in free flight before game over. */
export const ADRIFT_TIMEOUT = 60

/** Default shuttle reserve fuel cells placed into an empty hold. */
export const STARTER_SHUTTLE_FUEL_CELL_COUNT = 1

/** Default lander fuel cells placed into an empty hold. */
export const STARTER_LANDER_FUEL_CELL_COUNT = 1

/** The Sun supports a much faster orbital lane than planets. */
export const SUN_ORBIT_SPEED_MULTIPLIER = 12

/** Sun capture radius multiplier used for orbit-preview tuning. */
export const SUN_CAPTURE_RADIUS_MULTIPLIER = 0.2

/** Earth defines the baseline orbital lane speed multiplier of 1. */
export const EARTH_PLANET_ID = 'earth'

/** Per-planet slingshot speed overrides for gameplay balance. */
export const SLINGSHOT_SPEED_OVERRIDES: Record<string, number> = {
  mars: 1.2,
  neptune: 1.5,
  pluto: 1.5,
}

/** Earth display radius from the catalog for dev-warp standoff scaling. */
export const EARTH_CATALOG_DISPLAY_RADIUS =
  PLANETS.find((planet) => planet.id === EARTH_PLANET_ID)?.displayRadius ?? 0.0077

/** Maximum arrow length at full charge (in shuttle local space, pre-scale). */
export const ARROW_MAX_LENGTH = 150
export const ARROW_COLOR_SAFE = 0x00ffff
export const ARROW_COLOR_BLOCKED = 0xff3333
export const ARROW_HEAD_LENGTH = 40
export const ARROW_HEAD_WIDTH = 20
export const AIM_BLOCK_THRESHOLD = 0.3

/** Number of segments for the dashed orbit ring. */
export const ORBIT_RING_SEGMENTS = 64

/** Orbit ring visual style. */
export const ORBIT_RING_COLOR = 0x00ccff
export const ORBIT_RING_OPACITY = 0.4
export const ORBIT_RING_DASH_SIZE = 0.3
export const ORBIT_RING_GAP_SIZE = 0.2
export const ORBIT_PREVIEW_MULTIPLIER = 2.0
export const ORBIT_PREVIEW_OPACITY = 0.3
export const ORBIT_TETHER_COLOR = new THREE.Color('#7ce6ff')
export const ORBIT_TETHER_PULSE_COLOR = new THREE.Color('#ffffff')
export const ORBIT_TETHER_ANCHOR_COLOR = new THREE.Color('#34d7ff')
export const ORBIT_TETHER_MAX_OPACITY = 0.95
export const ORBIT_TETHER_MAX_WIDTH = 6
export const ORBIT_TETHER_SHIP_GLOW_RADIUS = 0.85
export const ORBIT_TETHER_PLANET_GLOW_RADIUS = 1.35

/** Gravity surf coupling tether — emerald green to distinguish from orbit cyan. */
export const SURF_TETHER_COLOR = new THREE.Color('#34ff88')
export const SURF_TETHER_PULSE_COLOR = new THREE.Color('#aaffdd')
export const SURF_TETHER_ANCHOR_COLOR = new THREE.Color('#22dd77')
export const SURF_TETHER_MAX_OPACITY = 0.9
export const SURF_TETHER_SHIP_GLOW_RADIUS = 0.7

/** Map-scale gravity tuning loaded from JSON. */
export const MAP_GRAVITY_CONFIG: GravityConfig = {
  gravityConstant: mapGravityData.gravityConstant,
  minDistance: mapGravityData.minDistance,
  influenceScale: mapGravityData.influenceScale,
  eventHorizonScale: mapGravityData.eventHorizonScale,
}

/** The Sun orbit lane — midpoint between event horizon and influence edge. */
export const SUN_BUMP_ORBIT_RADIUS =
  (eventHorizonRadius(SUN.mass, MAP_GRAVITY_CONFIG) + influenceRadius(SUN.mass, MAP_GRAVITY_CONFIG)) * 0.4

/** Intro camera starting shot. */
export const MAP_INTRO_CAMERA_START_POSITION = new THREE.Vector3(0, 320, 900)
export const MAP_INTRO_CAMERA_START_TARGET = new THREE.Vector3(0, 0, 0)
export const MAP_INTRO_CAMERA_START_FOV = 32

/** Enceladus intro shot framing. */
export const MAP_INTRO_ENCELADUS_CAMERA_OFFSET = new THREE.Vector3(0.4, 0.3, 0.8)
export const MAP_INTRO_ENCELADUS_FOV = 28

/**
 * Jupiter intro framing.
 * Jupiter world-radius ≈ 0.0863 × SIZE_SCALE(80) ≈ 6.9 units.
 * Galilean moons orbit up to semiMajorAxis = 28 world units from Jupiter.
 * Reveal shot: camera ~95 units out so all four moons fit inside a 48° FOV
 *   (visible half-width = 95 × tan(24°) ≈ 42 units > Callisto at 28).
 * City shot: zooms in closer, framing Jupiter's north pole + rising city.
 */
export const MAP_INTRO_JUPITER_CAMERA_OFFSET = new THREE.Vector3(15, 25, 90)
export const MAP_INTRO_JUPITER_CLOSE_OFFSET = new THREE.Vector3(16, 6, 68)
export const MAP_INTRO_JUPITER_FOV = 48
export const MAP_INTRO_JUPITER_CITY_FOV = 38

/** Existing hero shuttle framing used during the intro. */
export const MAP_INTRO_HERO_OFFSET = new THREE.Vector3(-24, 6, 14)
export const MAP_INTRO_HERO_LOOK_AT_OFFSET = new THREE.Vector3(0, 1.5, 0)
export const MAP_INTRO_HERO_FOV = 42

/** Intro prop rotation speeds in radians per second. */
export const INTRO_VIRUS_YAW_SPEED = 0.3
export const INTRO_CITY_YAW_SPEED = 0.2

/**
 * Cloud city Y positions for the rise-from-atmosphere beat.
 * Jupiter mesh radius ≈ 6.9 world units, so positions must exceed that.
 * The city starts just above the north pole and rises to a clear viewing height.
 */
export const INTRO_CITY_START_Y_BASE = 1
export const INTRO_CITY_END_Y_BASE = 5
export const INTRO_CITY_Y_LOWER = 0.6
export const INTRO_CITY_START_Y = INTRO_CITY_START_Y_BASE - INTRO_CITY_Y_LOWER
export const INTRO_CITY_END_Y = INTRO_CITY_END_Y_BASE - INTRO_CITY_Y_LOWER

/**
 * Cloud city intro model tuning.
 * At camera distance ≈ 70 units, scale must be ~2–3 world units to be clearly visible.
 * INTRO_CITY_MODEL_BASE_SCALE × INTRO_CITY_MODEL_SIZE_MULTIPLIER = world-space size.
 */
export const INTRO_CITY_MODEL_BASE_SCALE = 0.05
export const INTRO_CITY_MODEL_SIZE_MULTIPLIER = 15
/** How far below the city's Y the camera look-target sits, framing city above Jupiter's limb. */
export const INTRO_CITY_CAMERA_LOOK_DROP = 5.5

/** Enceladus is the second moon of Saturn in the catalog. */
export const ENCELADUS_MOON_INDEX = 1

export const EARTH_DEPARTURE_MESSAGE_DISTANCE = 12
export const EARTH_DEPARTURE_MIN_HISTORY_POINTS = 3
export const VENUS_ORBIT_WARNING_DISTANCE = 1.5

/** Delay before auto-opening the habitat after the startup intro finishes. */
export const POST_STARTUP_INTRO_HABITAT_DELAY_SEC = 2

/** Target screen-height fraction for the planet indicator sprite. */
export const PLANET_INDICATOR_APPARENT_SIZE = 0.028

/** Planet apparent screen fraction below which the indicator fades in. */
export const PLANET_INDICATOR_FADE_SCREEN_FRACTION = 0.008

/**
 * Aggregated config export so future domain facades can depend on one object
 * instead of re-importing a long constant list.
 */
export const MAP_VIEW_CONTROLLER_CONFIG = {
  ADRIFT_TIMEOUT,
  AIM_BLOCK_THRESHOLD,
  APPROACH_DURATION,
  ASTEROID_IMPACT_COOLDOWN_SEC,
  ASTEROID_IMPACT_MAX_DAMAGE,
  ASTEROID_IMPACT_MAX_SHAKE,
  ASTEROID_IMPACT_MIN_DAMAGE,
  ASTEROID_IMPACT_MIN_IMPULSE,
  ASTEROID_IMPACT_MIN_SHAKE,
  ASTEROID_IMPACT_RADIUS_TO_IMPULSE,
  ASTEROID_IMPACT_SHAKE_DURATION_SEC,
  ASTEROID_IMPACT_SPEED_TO_IMPULSE,
  ARROW_COLOR_BLOCKED,
  ARROW_COLOR_SAFE,
  ARROW_HEAD_LENGTH,
  ARROW_HEAD_WIDTH,
  ARROW_MAX_LENGTH,
  CURVATURE_SPEED_FACTOR,
  GRAVITY_SURF_COUPLE_DURATION_SEC,
  GRAVITY_SURF_CRUISE_SPEED_MULTIPLIER,
  GRAVITY_SURF_ACCEL_PER_SEC,
  GRAVITY_SURF_DECOUPLE_DURATION_SEC,
  GRAVITY_SURF_DECOUPLE_WAVE_DURATION_SEC,
  GRAVITY_SURF_DECOUPLE_WAVE_FORWARD_OFFSET,
  GRAVITY_SURF_DECOUPLE_WAVE_MASS,
  GRAVITY_SURF_DECOUPLE_WAVE_SPEED,
  GRAVITY_SURF_DECOUPLE_WAVE_WIDTH_MULT,
  GRAVITY_SURF_MAX_PITCH_RAD,
  GRAVITY_SURF_MAX_ROLL_RAD,
  GRAVITY_SURF_PASSIVE_FUEL_MULTIPLIER,
  GRAVITY_SURF_SNAP_DISTANCE_CELLS,
  GRAVITY_SURF_STOP_SPEED,
  GRAVITY_SURF_TILT_RESPONSE_PER_SEC,
  EARTH_CATALOG_DISPLAY_RADIUS,
  EARTH_DEPARTURE_MESSAGE_DISTANCE,
  EARTH_DEPARTURE_MIN_HISTORY_POINTS,
  EARTH_PLANET_ID,
  ENCELADUS_MOON_INDEX,
  GRID_DEFORM_INTERVAL_SCALE_WHOLE_MAP,
  GRID_DEFORM_WHOLE_MAP_COVERAGE,
  GRID_MASS_THRESHOLD,
  INTRO_CITY_CAMERA_LOOK_DROP,
  INTRO_CITY_END_Y,
  INTRO_CITY_END_Y_BASE,
  INTRO_CITY_MODEL_BASE_SCALE,
  INTRO_CITY_MODEL_SIZE_MULTIPLIER,
  INTRO_CITY_START_Y,
  INTRO_CITY_START_Y_BASE,
  INTRO_CITY_YAW_SPEED,
  INTRO_CITY_Y_LOWER,
  INTRO_VIRUS_YAW_SPEED,
  MAP_GRAVITY_CONFIG,
  MAP_GRID_GAS_GIANT_WELL_WIDTH_MULT,
  MAP_INTRO_CAMERA_START_FOV,
  MAP_INTRO_CAMERA_START_POSITION,
  MAP_INTRO_CAMERA_START_TARGET,
  MAP_INTRO_ENCELADUS_CAMERA_OFFSET,
  MAP_INTRO_ENCELADUS_FOV,
  MAP_INTRO_HERO_FOV,
  MAP_INTRO_HERO_LOOK_AT_OFFSET,
  MAP_INTRO_HERO_OFFSET,
  MAP_INTRO_JUPITER_CAMERA_OFFSET,
  MAP_INTRO_JUPITER_CITY_FOV,
  MAP_INTRO_JUPITER_CLOSE_OFFSET,
  MAP_INTRO_JUPITER_FOV,
  MAP_RETICLE_APPARENT_SIZE,
  MAP_RETICLE_FADE_END,
  MAP_RETICLE_FADE_START,
  MAP_RETICLE_MIN_SPEED,
  MAP_SHUTTLE_BASE_SIZE,
  MAP_SHUTTLE_COLLISION_RADIUS,
  MAP_SHUTTLE_MIN_APPARENT_SIZE,
  MAP_SHUTTLE_SCALE,
  MAP_SHUTTLE_SCALE_LERP,
  MAP_SPACE_TIME_GRID_BASE_RESOLUTION,
  MAP_SPACE_TIME_GRID_RESOLUTION,
  MAP_SPACE_TIME_GRID_RESOLUTION_BOOST,
  ONE_SHOT_PRIORITY,
  PLANET_INDICATOR_APPARENT_SIZE,
  PLANET_INDICATOR_FADE_SCREEN_FRACTION,
  ORBIT_PREVIEW_MULTIPLIER,
  ORBIT_PREVIEW_OPACITY,
  ORBIT_TETHER_ANCHOR_COLOR,
  ORBIT_TETHER_COLOR,
  ORBIT_TETHER_MAX_OPACITY,
  ORBIT_TETHER_MAX_WIDTH,
  ORBIT_TETHER_PLANET_GLOW_RADIUS,
  ORBIT_TETHER_PULSE_COLOR,
  ORBIT_TETHER_SHIP_GLOW_RADIUS,
  ORBIT_RING_COLOR,
  ORBIT_RING_DASH_SIZE,
  ORBIT_RING_GAP_SIZE,
  ORBIT_RING_OPACITY,
  ORBIT_RING_SEGMENTS,
  ORBITAL_SURF_COUPLE_DURATION_SEC,
  ORBITAL_SURF_CRUISE_SPEED_MULTIPLIER,
  ORBITAL_SURF_FUEL_MULTIPLIER,
  ORBITAL_SURF_PULSE_SPEED,
  ORBITAL_SURF_RAMP_DURATION_SEC,
  ORBITAL_SURF_SNAP_DISTANCE,
  ORBITAL_SURF_SPLINE_COLOR,
  ORBITAL_SURF_SPLINE_GLOW_COLOR,
  ORBITAL_SURF_SPLINE_OPACITY,
  ORBITAL_SURF_SPLINE_SEGMENTS,
  ORBITAL_SURF_TUNNEL_DEPTH,
  POST_STARTUP_INTRO_HABITAT_DELAY_SEC,
  SLINGSHOT_CHARGE_TIME,
  SLINGSHOT_SPEED_OVERRIDES,
  SPAWN_OFFSET_BEHIND_EARTH,
  PORTAL_ARRIVAL_WORMHOLE_Y,
  PORTAL_EARTH_HOLD_DURATION,
  PORTAL_WORMHOLE_RADIUS,
  PORTAL_WORMHOLE_VIEW_DURATION,
  STARTER_LANDER_FUEL_CELL_COUNT,
  STARTER_SHUTTLE_FUEL_CELL_COUNT,
  SURF_TETHER_ANCHOR_COLOR,
  SURF_TETHER_COLOR,
  SURF_TETHER_MAX_OPACITY,
  SURF_TETHER_PULSE_COLOR,
  SURF_TETHER_SHIP_GLOW_RADIUS,
  SUN_BUMP_ORBIT_RADIUS,
  SUN_CAPTURE_RADIUS_MULTIPLIER,
  SUN_ORBIT_SPEED_MULTIPLIER,
  TICK_PRIORITY_COMPOSIT,
  VENUS_ORBIT_WARNING_DISTANCE,
  WAYPOINT_APPARENT_SIZE,
} as const
