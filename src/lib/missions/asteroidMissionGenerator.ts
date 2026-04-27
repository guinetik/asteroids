/**
 * Asteroid mission generator.
 *
 * Takes a difficulty level, picks a giver and template, rolls
 * concrete objective values, and generates a waypoint near the posting station's orbital
 * ring (angular separation + modest radial jitter). Belt `region` on templates still tiers
 * objective difficulty; spawn is host-local unless using legacy helpers like
 * {@link generateWaypointInRegion}.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-asteroid-missions-design.md
 */
import type {
  NumberRange,
  MissionRegion,
  ObjectiveSlot,
  ConcreteObjective,
  MissionGiverTemplate,
  GeneratedAsteroidMission,
} from './types'
import { getGiversForDifficulty, MISSION_GIVERS } from './giverCatalog'
import { ASTEROID_BELTS, getPlanet, PLANETS } from '@/lib/planets/catalog'
import { ORBIT_SCALE, SIZE_SCALE } from '@/lib/planets/constants'
import { generateFlatZones } from '@/lib/terrain/terrainGenerator'
import difficultyMap from '@/data/asteroids/difficulty-map.json'
import shipHealthData from '@/data/shuttle/ship-health.json'
import hostGiverOverridesData from '@/data/missions/host-giver-overrides.json'
import { MIN_ASTEROID_MISSION_REWARD } from './missionEconomy'

/** Simple string hash to derive a numeric seed. */
function hashSeed(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/** Level terrain grid size — shared with LevelViewController. */
export const LEVEL_GRID_SIZE = 3500

export { MIN_ASTEROID_MISSION_REWARD }

/** Objective count bands by difficulty. */
const OBJECTIVE_COUNT_BY_DIFFICULTY: [number, number, number][] = [
  [1, 3, 1],
  [4, 6, 2],
  [7, 10, 3],
]

/** Easiest difficulty where Jovian photometry contracts appear. */
const PHOTOMETRY_MIN_DIFFICULTY = 3

/** Difficulty that should feel like the midpoint of photometry tuning. */
const PHOTOMETRY_MID_DIFFICULTY = 5

/** Hardest authored photometry difficulty. */
const PHOTOMETRY_MAX_DIFFICULTY = 10

/**
 * Determine number of objectives based on mission difficulty.
 *
 * @author guinetik
 * @date 2026-04-07
 * @param difficulty - Mission difficulty (1-10).
 * @returns Number of objectives (1-3).
 */
export function objectiveCountForDifficulty(difficulty: number): number {
  for (const [min, max, count] of OBJECTIVE_COUNT_BY_DIFFICULTY) {
    if (difficulty >= min && difficulty <= max) return count
  }
  return 1
}

/**
 * Interpolate photometry-specific values around its intended band: 3 is the
 * easiest value, 5 is the midpoint, and 10 is the hardest value.
 *
 * @param range - Tunable value range from easiest to hardest.
 * @param difficulty - Mission difficulty.
 * @returns Integer-scaled concrete value for photometry objectives.
 */
function interpolatePhotometryRange(range: NumberRange, difficulty: number): number {
  const clamped = Math.max(
    PHOTOMETRY_MIN_DIFFICULTY,
    Math.min(PHOTOMETRY_MAX_DIFFICULTY, difficulty),
  )
  const t =
    clamped <= PHOTOMETRY_MID_DIFFICULTY
      ? ((clamped - PHOTOMETRY_MIN_DIFFICULTY) /
          (PHOTOMETRY_MID_DIFFICULTY - PHOTOMETRY_MIN_DIFFICULTY)) *
        0.5
      : 0.5 +
        ((clamped - PHOTOMETRY_MID_DIFFICULTY) /
          (PHOTOMETRY_MAX_DIFFICULTY - PHOTOMETRY_MID_DIFFICULTY)) *
          0.5

  return Math.round(range.min + (range.max - range.min) * t)
}

/** Entry from the difficulty-map JSON. */
interface DifficultyMapEntry {
  asteroidId: string
  minDifficulty: number
  maxDifficulty: number
  planetIds?: string[]
}

/**
 * Whether a difficulty-map entry is available for a host planet.
 *
 * Entries without `planetIds` stay globally available.
 *
 * @param entry - Candidate asteroid map entry.
 * @param hostPlanetId - Mission board planet id, when known.
 * @returns `true` when the entry can be selected for the host.
 */
function isAsteroidEntryAvailableForHost(
  entry: DifficultyMapEntry,
  hostPlanetId?: string,
): boolean {
  if (!entry.planetIds) return true
  if (!hostPlanetId) return false
  return entry.planetIds.includes(hostPlanetId)
}

/**
 * Pick a random asteroid template that fits the given difficulty and host planet.
 *
 * Host-specific entries only appear for listed planets. Global entries remain available
 * everywhere, and are used as a fallback if the host has no matching specific entries.
 *
 * @param difficulty - Mission difficulty (1-10).
 * @param hostPlanetId - Optional planet id for the board posting the mission.
 * @returns Asteroid id from the catalog.
 */
export function pickAsteroidForDifficulty(difficulty: number, hostPlanetId?: string): string {
  const difficultyEntries = (difficultyMap as DifficultyMapEntry[]).filter(
    (e) => difficulty >= e.minDifficulty && difficulty <= e.maxDifficulty,
  )
  if (difficultyEntries.length === 0) {
    return (difficultyMap as DifficultyMapEntry[])[0]!.asteroidId
  }

  const hostEntries = difficultyEntries.filter((entry) =>
    isAsteroidEntryAvailableForHost(entry, hostPlanetId),
  )
  const entries =
    hostEntries.length > 0 ? hostEntries : difficultyEntries.filter((entry) => !entry.planetIds)

  if (entries.length === 0) {
    return (difficultyMap as DifficultyMapEntry[])[0]!.asteroidId
  }

  return entries[Math.floor(Math.random() * entries.length)]!.asteroidId
}

/**
 * Legacy catalog floor for the near-earth mission annulus (pre–temp-safe tuning).
 * Actual inner radius is {@link nearEarthInnerCatalogForWaypointSpawn} so waypoints stay
 * outside the shuttle hot zone (`ship-health.json` `hotBoundary`).
 */
const NEAR_EARTH_INNER_RADIUS = 200

/** Main belt inner radius — default outer bound for near-earth missions (catalog units). */
const NEAR_EARTH_OUTER_RADIUS = 420

/**
 * Minimum catalog radial span for near-earth waypoints so the annulus stays valid when the
 * temperature-safe inner radius exceeds {@link NEAR_EARTH_OUTER_RADIUS}.
 */
const NEAR_EARTH_MIN_RADIAL_SPAN_CATALOG = 80

/**
 * World-units padding beyond `hotBoundary` so drafted missions are clearly outside solar heat
 * damage (same distance basis as `ShipHealth.tick` `sunDistance`).
 */
const SHUTTLE_HOT_ZONE_WAYPOINT_MARGIN_WORLD = 8

/**
 * Difficulties 1–2 only pick `near-earth` templates so new pilots are not sent to the main belt
 * or Kuiper (extreme range / cold) before upgrades.
 */
const NEAR_EARTH_ONLY_MAX_MISSION_DIFFICULTY = 2

/**
 * Catalog inner radius for near-earth waypoints: at least legacy inner edge, and far enough
 * from the Sun to stay below shuttle heat (see `ship-health.json`).
 *
 * @returns Semi-major axis in planetarium catalog units (before `ORBIT_SCALE`).
 */
export function nearEarthInnerCatalogForWaypointSpawn(): number {
  const safeInnerWorld = shipHealthData.hotBoundary + SHUTTLE_HOT_ZONE_WAYPOINT_MARGIN_WORLD
  const fromTemp = safeInnerWorld / ORBIT_SCALE
  return Math.max(NEAR_EARTH_INNER_RADIUS, fromTemp)
}

/**
 * Outer catalog radius for near-earth waypoint sampling: at least main-belt inner, and always
 * beyond {@link nearEarthInnerCatalogForWaypointSpawn} by {@link NEAR_EARTH_MIN_RADIAL_SPAN_CATALOG}.
 *
 * @returns Semi-major axis cap in catalog units (before `ORBIT_SCALE`).
 */
export function nearEarthOuterCatalogForWaypointSpawn(): number {
  const inner = nearEarthInnerCatalogForWaypointSpawn()
  return Math.max(NEAR_EARTH_OUTER_RADIUS, inner + NEAR_EARTH_MIN_RADIAL_SPAN_CATALOG)
}

/**
 * At difficulty 1, waypoint radius samples only this fraction of the region annulus (from the inner
 * edge); at difficulty 10 the full annulus is used. Blended linearly between.
 *
 * Exported for tests and tuning; must stay in sync with {@link generateWaypointInRegion}.
 */
export const WAYPOINT_ANNULUS_INNER_FRACTION_AT_MIN_DIFFICULTY = 0.22

/** Mission difficulty bounds for waypoint radius blending. */
const MIN_WAYPOINT_DIFFICULTY = 1
const MAX_WAYPOINT_DIFFICULTY = 10

/**
 * Blend factor 0–1 from difficulty for waypoint outer reach (1 → 0, 10 → 1).
 *
 * @param difficulty - Mission difficulty (clamped 1–10).
 */
export function missionDifficultyReachT(difficulty: number): number {
  const d = Math.max(MIN_WAYPOINT_DIFFICULTY, Math.min(MAX_WAYPOINT_DIFFICULTY, difficulty))
  return (d - MIN_WAYPOINT_DIFFICULTY) / (MAX_WAYPOINT_DIFFICULTY - MIN_WAYPOINT_DIFFICULTY)
}

/**
 * Extra world-units beyond the planet mesh radius so mission waypoints avoid active orbit lanes.
 */
const MISSION_WAYPOINT_PLANET_ORBIT_STANDOFF_WORLD = 22

/** Random samples inside the allowed annulus before running a deterministic radial sweep. */
const WAYPOINT_ORBIT_CLEARANCE_MAX_ATTEMPTS = 56

/** Steps when sweeping from inner to outer world radius for a corridor-free distance. */
const WAYPOINT_ORBIT_CLEARANCE_SWEEP_STEPS = 56

/** How much of a planet's eccentric radial span (world units) adds to required gap vs. nominal ring. */
const WAYPOINT_ORBIT_ECCENTRICITY_PAD_FRACTION = 0.35

/** Multipliers tried in order when the preferred annulus has no slot at full standoff (stays in band). */
const WAYPOINT_ORBIT_STANDOFF_RELAXATION_SEQUENCE = [1, 0.55, 0.3] as const

/**
 * Whether a waypoint at this distance from the Sun (XZ plane, world units) stays clear of each
 * planet's nominal orbit ring: worst-case aligned with the body, distance between circle radii
 * `Rw` and `a·ORBIT_SCALE` must exceed mesh size + standoff (eccentricity adds a small radial pad).
 *
 * @param worldRadiusFromSun - `sqrt(worldX² + worldZ²)` for the waypoint.
 * @param standoffMultiplier - Scales orbit standoff + eccentricity pad (`1` = strict, lower = fallback).
 * @returns `false` if any planet's orbit ring is too close at this solar distance.
 */
export function isMissionWaypointSolarDistanceClearOfPlanets(
  worldRadiusFromSun: number,
  standoffMultiplier = 1,
): boolean {
  const Rw = worldRadiusFromSun
  const m = standoffMultiplier
  for (const planet of PLANETS) {
    const aCatalog = planet.orbit.semiMajorAxis
    const orbitRadiusWorld = aCatalog * ORBIT_SCALE
    const meshRadiusWorld = planet.displayRadius * SIZE_SCALE
    const eccRadialPadWorld = aCatalog * planet.orbit.eccentricity * ORBIT_SCALE
    const minGap =
      meshRadiusWorld +
      MISSION_WAYPOINT_PLANET_ORBIT_STANDOFF_WORLD * m +
      eccRadialPadWorld * WAYPOINT_ORBIT_ECCENTRICITY_PAD_FRACTION * m
    if (Math.abs(Rw - orbitRadiusWorld) < minGap) {
      return false
    }
  }
  return true
}

/**
 * Pick waypoint polar coordinates inside the catalog annulus, resampling until the solar distance
 * clears all planet corridors; may broaden to the full region outer radius as a last resort.
 *
 * @param innerRadiusCatalog - Inner bound of the region (catalog units).
 * @param outerRadiusCatalog - Outer bound of the region (catalog units).
 * @param maxRadialOffsetCatalog - Max extra catalog radius outward from inner (difficulty clamp).
 */
function pickWaypointWorldXZInAnnulus(
  innerRadiusCatalog: number,
  outerRadiusCatalog: number,
  maxRadialOffsetCatalog: number,
): { worldX: number; worldZ: number } {
  const bandCatalog = outerRadiusCatalog - innerRadiusCatalog
  const radialSpanCatalog = Math.min(maxRadialOffsetCatalog, bandCatalog)
  const outerReachCatalog = innerRadiusCatalog + radialSpanCatalog
  const innerWorld = innerRadiusCatalog * ORBIT_SCALE
  const outerWorldPreferred = outerReachCatalog * ORBIT_SCALE

  const tryRandom = (
    minW: number,
    maxW: number,
    standoffMult: number,
  ): { worldX: number; worldZ: number } | null => {
    if (maxW <= minW) return null
    for (let attempt = 0; attempt < WAYPOINT_ORBIT_CLEARANCE_MAX_ATTEMPTS; attempt++) {
      const angle = Math.random() * Math.PI * 2
      const Rw = minW + Math.random() * (maxW - minW)
      if (isMissionWaypointSolarDistanceClearOfPlanets(Rw, standoffMult)) {
        return { worldX: Math.cos(angle) * Rw, worldZ: Math.sin(angle) * Rw }
      }
    }
    return null
  }

  const trySweep = (
    minW: number,
    maxW: number,
    standoffMult: number,
  ): { worldX: number; worldZ: number } | null => {
    if (maxW <= minW) return null
    const angle = Math.random() * Math.PI * 2
    for (let s = 0; s <= WAYPOINT_ORBIT_CLEARANCE_SWEEP_STEPS; s++) {
      const t = s / WAYPOINT_ORBIT_CLEARANCE_SWEEP_STEPS
      const Rw = minW + t * (maxW - minW)
      if (isMissionWaypointSolarDistanceClearOfPlanets(Rw, standoffMult)) {
        return { worldX: Math.cos(angle) * Rw, worldZ: Math.sin(angle) * Rw }
      }
    }
    return null
  }

  for (const mult of WAYPOINT_ORBIT_STANDOFF_RELAXATION_SEQUENCE) {
    let picked = tryRandom(innerWorld, outerWorldPreferred, mult)
    if (picked) return picked
    picked = trySweep(innerWorld, outerWorldPreferred, mult)
    if (picked) return picked
  }

  const angle = Math.random() * Math.PI * 2
  const RwFallback = (innerWorld + outerWorldPreferred) * 0.5
  return { worldX: Math.cos(angle) * RwFallback, worldZ: Math.sin(angle) * RwFallback }
}

/**
 * Interpolate a NumberRange linearly by difficulty (1-10).
 *
 * @param range - Min/max range from template.
 * @param difficulty - Current difficulty (1-10).
 * @returns Interpolated integer value.
 */
export function interpolateRange(range: NumberRange, difficulty: number): number {
  const t = (difficulty - 1) / 9
  return Math.round(range.min + t * (range.max - range.min))
}

/**
 * Roll a concrete objective from a template slot and difficulty.
 *
 * @param slot - Objective slot with scalable params.
 * @param difficulty - Current difficulty (1-10).
 * @returns Concrete objective with rolled values.
 */
export function rollObjective(slot: ObjectiveSlot, difficulty: number): ConcreteObjective {
  const reward = interpolateRange(slot.reward, difficulty)

  switch (slot.params.type) {
    case 'gather':
      return {
        type: 'gather',
        x: 0,
        z: 0,
        resourceAmount: interpolateRange(slot.params.resourceAmount, difficulty),
        reward,
      }
    case 'exterminate':
      return {
        type: 'exterminate',
        x: 0,
        z: 0,
        nestCount: interpolateRange(slot.params.nestCount, difficulty),
        swarmSize: interpolateRange(slot.params.swarmSize, difficulty),
        hasSpitters: Math.random() < slot.params.spitterChance,
        reward,
      }
    case 'rescue':
      return {
        type: 'rescue',
        x: 0,
        z: 0,
        colonistCount: interpolateRange(slot.params.colonistCount, difficulty),
        oxygenTime: interpolateRange(slot.params.oxygenTime, difficulty),
        isGuarded: Math.random() < slot.params.guardedChance,
        reward,
      }
    case 'survey':
      return {
        type: 'survey',
        x: 0,
        z: 0,
        probeCount: interpolateRange(slot.params.probeCount, difficulty),
        timeLimit: interpolateRange(slot.params.timeLimit, difficulty),
        reward,
      }
    case 'photometry':
      return {
        type: 'photometry',
        x: 0,
        z: 0,
        probeCount: 1,
        timeLimit: interpolatePhotometryRange(slot.params.timeLimit, difficulty),
        scanHoldSeconds: interpolatePhotometryRange(slot.params.scanHoldSeconds, difficulty),
        probeDistance: interpolatePhotometryRange(slot.params.probeDistance, difficulty),
        reward,
      }
    case 'collect':
      return {
        type: 'collect',
        x: 0,
        z: 0,
        reward,
      }
    case 'bunker':
      return {
        type: 'bunker',
        x: 0,
        z: 0,
        reward,
      }
  }
}

/**
 * Find the region for a template at a given difficulty.
 *
 * @param template - Giver mission template.
 * @param difficulty - Current difficulty (1-10).
 * @returns Matching region or undefined.
 */
function findRegionForTemplate(
  template: MissionGiverTemplate,
  difficulty: number,
): MissionRegion | undefined {
  for (const [region, range] of Object.entries(template.regionByDifficulty)) {
    if (range && difficulty >= range[0] && difficulty <= range[1]) {
      return region as MissionRegion
    }
  }
  return undefined
}

/**
 * True when every slot on a giver template only rolls exterminate or rescue objectives.
 *
 * @param template - Giver mission entry from JSON.
 * @returns Whether the template is restricted to those objective types.
 */
function isExterminateOrRescueOnlyTemplate(template: MissionGiverTemplate): boolean {
  return template.objectiveSlots.every((s) => s.type === 'exterminate' || s.type === 'rescue')
}

/**
 * True when every slot on a giver template only rolls exterminate (bug-clearing) objectives.
 *
 * Used to keep nest-hunt / hive-assault contracts off civilian mission boards. Combat-only
 * hosts (Mercury / Saturn) still surface them because their `combatOnlyHost` branch uses the
 * positive `isExterminateOrRescueOnlyTemplate` filter; this predicate is the *negative*
 * filter applied at every other planet so Colonial Guard's wide near-earth band cannot
 * dominate the random pool at low difficulty.
 *
 * @param template - Giver mission entry from JSON.
 * @returns Whether the template is restricted to extermination objectives.
 */
function isExterminateOnlyTemplate(template: MissionGiverTemplate): boolean {
  return template.objectiveSlots.every((s) => s.type === 'exterminate')
}

/**
 * Station that posts a procedural asteroid contract — solar-map waypoint is anchored from
 * {@link worldX}/{@link worldZ} when the offer is drafted.
 */
export interface AsteroidMissionHostAnchor {
  planetId: string
  worldX: number
  worldZ: number
}

/**
 * Default host for dev/query mission generation — Earth at 1 AU on +X (matches catalog scale).
 */
export function syntheticEarthHostAnchor(): AsteroidMissionHostAnchor {
  const earth = getPlanet('earth')
  const r = earth.orbit.semiMajorAxis * ORBIT_SCALE
  return { planetId: 'earth', worldX: r, worldZ: 0 }
}

/** Max orbital separation (degrees) from the host along its orbit ring — scales with difficulty. */
const HOST_ASTEROID_MAX_ANGLE_DEG_BASE = 8

/** Extra degrees at max difficulty (added to {@link HOST_ASTEROID_MAX_ANGLE_DEG_BASE}). */
const HOST_ASTEROID_MAX_ANGLE_DEG_SPAN = 34

/** Max inward/outward tweak to solar radius (world units), scaled by difficulty. */
const HOST_ASTEROID_RADIAL_JITTER_BASE = 20

const HOST_ASTEROID_RADIAL_JITTER_SPAN = 95

/** Moon semi-major axes are rendered locally around their parent, not in solar AU space. */
const LOCAL_MOON_ORBIT_SCALE_DIVISOR = 150

/** Fresh Earth asteroid contracts must stay well outside the Moon's local orbital lane. */
const EARLY_EARTH_MIN_MOON_ORBIT_CLEARANCE_MULTIPLE = 1.5

/** Upper edge of the early Earth local contract annulus, measured in local Moon-orbit radii. */
const EARLY_EARTH_LOCAL_DISTANCE_MAX_MOON_ORBIT_MULTIPLE = 2.25

/** Only low-difficulty Earth asteroid missions use the tight onboarding annulus. */
const EARLY_EARTH_LOCAL_MAX_MISSION_DIFFICULTY = 2

/**
 * Place an asteroid contract waypoint near the host world's orbital ring: mostly angular
 * separation along the orbit (like EVA), with a modest radial jitter that scales with
 * difficulty. Avoids sun-centered main-belt sampling that sent inner-planet stations to the
 * outer system when upgrades raised mission tier.
 *
 * @param hostWorldX - Giver planet world X when the mission is offered.
 * @param hostWorldZ - Giver planet world Z when the mission is offered.
 * @param difficulty - Mission difficulty 1–10 (drives max angle / radial jitter).
 * @param rand - RNG in [0,1); injectable for tests.
 */
export function generateAsteroidWaypointNearHostPlanet(
  hostWorldX: number,
  hostWorldZ: number,
  difficulty: number,
  rand: () => number = Math.random,
  hostPlanetId: string | null = null,
): { worldX: number; worldZ: number } {
  if (hostPlanetId === 'earth' && difficulty <= EARLY_EARTH_LOCAL_MAX_MISSION_DIFFICULTY) {
    const earth = getPlanet('earth')
    const moonOrbitWorld =
      ((earth.moons[0]?.orbit.semiMajorAxis ?? 0) * SIZE_SCALE) / LOCAL_MOON_ORBIT_SCALE_DIVISOR
    const earthRadiusWorld = earth.displayRadius * SIZE_SCALE
    const minDistance = Math.max(
      moonOrbitWorld * EARLY_EARTH_MIN_MOON_ORBIT_CLEARANCE_MULTIPLE,
      earthRadiusWorld * 3,
    )
    const maxDistance = Math.max(
      minDistance + earthRadiusWorld * 2,
      moonOrbitWorld * EARLY_EARTH_LOCAL_DISTANCE_MAX_MOON_ORBIT_MULTIPLE,
    )

    for (let attempt = 0; attempt < 96; attempt++) {
      const angle = rand() * Math.PI * 2
      const distance = minDistance + rand() * (maxDistance - minDistance)
      const wx = hostWorldX + Math.cos(angle) * distance
      const wz = hostWorldZ + Math.sin(angle) * distance
      if (isMissionWaypointSolarDistanceClearOfPlanets(Math.hypot(wx, wz))) {
        return { worldX: wx, worldZ: wz }
      }
    }

    return {
      worldX: hostWorldX + (minDistance + maxDistance) * 0.5,
      worldZ: hostWorldZ,
    }
  }

  const hostAngle = Math.atan2(hostWorldZ, hostWorldX)
  const hostR = Math.hypot(hostWorldX, hostWorldZ)
  const t = missionDifficultyReachT(difficulty)
  const maxAngleRad =
    ((HOST_ASTEROID_MAX_ANGLE_DEG_BASE + t * HOST_ASTEROID_MAX_ANGLE_DEG_SPAN) * Math.PI) / 180
  const maxRadialJitter = HOST_ASTEROID_RADIAL_JITTER_BASE + t * HOST_ASTEROID_RADIAL_JITTER_SPAN

  const tryPick = (): { worldX: number; worldZ: number } | null => {
    const deltaAngle = (rand() * 2 - 1) * maxAngleRad
    const deltaR = (rand() * 2 - 1) * maxRadialJitter
    const newR = Math.max(1e-3, hostR + deltaR)
    const wx = Math.cos(hostAngle + deltaAngle) * newR
    const wz = Math.sin(hostAngle + deltaAngle) * newR
    const Rw = Math.hypot(wx, wz)
    if (!isMissionWaypointSolarDistanceClearOfPlanets(Rw)) return null
    return { worldX: wx, worldZ: wz }
  }

  for (let attempt = 0; attempt < 96; attempt++) {
    const p = tryPick()
    if (p) return p
  }

  // Last resort: tiny jitter only (still host-local).
  const tinyAngle = ((rand() * 2 - 1) * maxAngleRad) / 4
  const tinyR = (rand() * 2 - 1) * Math.min(maxRadialJitter, 40)
  const r0 = Math.max(1e-3, hostR + tinyR)
  return {
    worldX: Math.cos(hostAngle + tinyAngle) * r0,
    worldZ: Math.sin(hostAngle + tinyAngle) * r0,
  }
}

/**
 * Legacy sun-centered waypoint sampling inside a belt annulus (tests / tooling).
 * Lower difficulty biases radius toward the inner edge.
 *
 * @param region - Target belt band in catalog space.
 * @param difficulty - Mission difficulty (1–10); lower values bias radius inward.
 * @returns World-space XZ coordinates within the belt.
 */
export function generateWaypointInRegion(
  region: MissionRegion,
  difficulty: number,
): { worldX: number; worldZ: number } {
  let innerRadius: number
  let outerRadius: number

  if (region === 'near-earth') {
    innerRadius = nearEarthInnerCatalogForWaypointSpawn()
    outerRadius = nearEarthOuterCatalogForWaypointSpawn()
  } else {
    const beltId = region === 'asteroid-belt' ? 'main-belt' : 'kuiper-belt'
    const belt = ASTEROID_BELTS.find((b) => b.id === beltId)
    if (!belt) {
      innerRadius = nearEarthInnerCatalogForWaypointSpawn()
      outerRadius = nearEarthOuterCatalogForWaypointSpawn()
    } else {
      innerRadius = belt.innerRadius
      outerRadius = belt.outerRadius
    }
  }

  const band = outerRadius - innerRadius
  const reachT = missionDifficultyReachT(difficulty)
  const outerExtentFraction =
    WAYPOINT_ANNULUS_INNER_FRACTION_AT_MIN_DIFFICULTY +
    (1 - WAYPOINT_ANNULUS_INNER_FRACTION_AT_MIN_DIFFICULTY) * reachT
  const maxRadialOffsetCatalog = band * outerExtentFraction

  return pickWaypointWorldXZInAnnulus(innerRadius, outerRadius, maxRadialOffsetCatalog)
}

/**
 * Stations whose mission boards are restricted to exterminate / rescue (combat & SAR) work.
 * Adding a planet here makes that planet's asteroid board reject mining / survey templates,
 * regardless of difficulty band — used for narrative-tagged worlds whose flavor would clash
 * with generic hauler contracts (Saturn = hazard cleanup; Mercury = Cinderline territory,
 * viroid hunting).
 */
const COMBAT_ONLY_HOST_PLANET_IDS: ReadonlySet<string> = new Set(['saturn', 'mercury'])

/**
 * Whether the host planet only posts exterminate / rescue contracts on its asteroid board.
 *
 * @param planetId - Host planet identifier.
 * @returns `true` when the board should hide gather/survey templates entirely.
 */
function isCombatOnlyHostPlanet(planetId: string): boolean {
  return COMBAT_ONLY_HOST_PLANET_IDS.has(planetId)
}

/**
 * Per-host re-attribution for asteroid contracts. When a planet is listed here, every mission
 * drafted at that station is re-stamped with the override `giverId` / `giverName` so the board
 * UI and downstream contract filters see the local order rather than the underlying template
 * source (e.g. Mercury's combat work is signed by The Cinderline at The Anvil, even though the
 * mechanical template still comes from Colonial Guard).
 */
interface HostGiverOverride {
  /** Host planet id whose mission board this override applies to. */
  planetId: string
  /** Replacement stable id used for `giverId` propagation (contract filters, telemetry). */
  giverId: string
  /** Replacement display name shown on the mission board's "From: ..." line. */
  giverName: string
}

const HOST_GIVER_OVERRIDES: ReadonlyMap<string, HostGiverOverride> = new Map(
  (hostGiverOverridesData as HostGiverOverride[]).map((entry) => [entry.planetId, entry]),
)

/**
 * Resolve the giver attribution for a mission drafted at the given host. Returns the host
 * override when one exists; otherwise the underlying template's giver is used as-is.
 *
 * @param planetId - Host planet identifier.
 * @returns Host-side override, or `undefined` when the host has no re-attribution rule.
 */
function getHostGiverOverride(planetId: string): HostGiverOverride | undefined {
  return HOST_GIVER_OVERRIDES.get(planetId)
}

/**
 * Generate a complete asteroid mission at a given difficulty.
 *
 * @param difficulty - Mission difficulty (1-10).
 * @param host - Station planet and world position when the contract is drafted; waypoint is
 *   generated near that orbit. When omitted (tests, level URL overrides), uses Earth @ 1 AU.
 * @param rand - Optional RNG for deterministic tests.
 * @param requiredObjectiveType - Optional objective type the generated mission must include.
 * @returns Fully generated mission ready for the mission board.
 */
export function generateAsteroidMission(
  difficulty: number,
  host: AsteroidMissionHostAnchor | null = null,
  rand: () => number = Math.random,
  requiredObjectiveType: ConcreteObjective['type'] | null = null,
): GeneratedAsteroidMission {
  const anchor = host ?? syntheticEarthHostAnchor()
  const combatOnlyHost = isCombatOnlyHostPlanet(anchor.planetId)
  /**
   * Combat-only hosts use the full giver catalog so Colonial Guard / Frontier Rescue are not
   * squeezed out by low-tier miners and surveyors that share the same difficulty band; the
   * subsequent template loop drops anything that is not exterminate/rescue.
   */
  const givers = combatOnlyHost ? MISSION_GIVERS : getGiversForDifficulty(difficulty)
  if (givers.length === 0) {
    throw new Error(`No givers available for difficulty ${difficulty}`)
  }

  const candidates: {
    giver: (typeof givers)[0]
    template: MissionGiverTemplate
    region: MissionRegion
  }[] = []

  for (const giver of givers) {
    for (const template of giver.missions) {
      if (combatOnlyHost && !isExterminateOrRescueOnlyTemplate(template)) continue
      // Civilian (non-combat-only) boards never post pure extermination work — that flavor is
      // reserved for Cinderline (Mercury) and the Saturn hazard cleanup boards. Without this
      // filter, Colonial Guard's wide `near-earth` band swamps Earth/Mars/Venus at low diff.
      if (!combatOnlyHost && isExterminateOnlyTemplate(template)) continue
      if (
        requiredObjectiveType &&
        !template.objectiveSlots.some((slot) => slot.type === requiredObjectiveType)
      ) {
        continue
      }
      const region = findRegionForTemplate(template, difficulty)
      if (region) {
        candidates.push({ giver, template, region })
      }
    }
  }

  if (candidates.length === 0) {
    const planetSuffix = combatOnlyHost ? ` for ${anchor.planetId} (exterminate/rescue only)` : ''
    throw new Error(`No templates match difficulty ${difficulty}${planetSuffix}`)
  }

  let pool = candidates
  if (difficulty <= NEAR_EARTH_ONLY_MAX_MISSION_DIFFICULTY) {
    const nearEarthOnly = candidates.filter((c) => c.region === 'near-earth')
    if (nearEarthOnly.length > 0) {
      pool = nearEarthOnly
    }
  }

  const pick = pool[Math.floor(Math.random() * pool.length)]!
  const missionId = `${pick.template.id}_${Date.now()}`
  const count = objectiveCountForDifficulty(difficulty)
  const slots = [...pick.template.objectiveSlots]
    .sort((a, b) => {
      if (requiredObjectiveType) {
        const aMatches = a.type === requiredObjectiveType
        const bMatches = b.type === requiredObjectiveType
        if (aMatches !== bMatches) return aMatches ? -1 : 1
      }
      return b.weight - a.weight
    })
    .slice(0, count)
  const objectives = slots.map((s) => rollObjective(s, difficulty))

  const zones = generateFlatZones(objectives.length, LEVEL_GRID_SIZE, hashSeed(missionId))
  for (let i = 0; i < objectives.length; i++) {
    objectives[i]!.x = zones[i]!.x
    objectives[i]!.z = zones[i]!.z
  }

  const completionBonus = interpolateRange(pick.template.completionBonus, difficulty)
  const rawReward = objectives.reduce((sum, o) => sum + o.reward, 0) + completionBonus
  const totalReward = Math.max(MIN_ASTEROID_MISSION_REWARD, rawReward)

  const waypoint = generateAsteroidWaypointNearHostPlanet(
    anchor.worldX,
    anchor.worldZ,
    difficulty,
    rand,
    anchor.planetId,
  )

  const asteroidId = pickAsteroidForDifficulty(difficulty, anchor.planetId)
  const hostGiverOverride = getHostGiverOverride(anchor.planetId)

  return {
    kind: 'standard',
    id: missionId,
    asteroidId,
    giverId: hostGiverOverride?.giverId ?? pick.giver.id,
    giverName: hostGiverOverride?.giverName ?? pick.giver.name,
    templateId: pick.template.id,
    name: pick.template.name,
    briefing: pick.template.briefing,
    difficulty,
    originPlanetId: anchor.planetId,
    region: pick.region,
    objectives,
    totalReward,
    waypoint,
    status: 'available',
  }
}
