/**
 * Asteroid mission generator.
 *
 * Takes a difficulty level, picks a giver and template, rolls
 * concrete objective values, and generates a waypoint position
 * within the appropriate belt region.
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
import { getGiversForDifficulty } from './giverCatalog'
import { ASTEROID_BELTS } from '@/lib/planets/catalog'
import { ORBIT_SCALE } from '@/lib/planets/constants'
import { generateFlatZones } from '@/lib/terrain/terrainGenerator'
import difficultyMap from '@/data/asteroids/difficulty-map.json'
import shipHealthData from '@/data/shuttle/ship-health.json'

/** Simple string hash to derive a numeric seed. */
function hashSeed(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/** Level terrain grid size — shared with LevelViewController. */
export const LEVEL_GRID_SIZE = 12000

/** Objective count bands by difficulty. */
const OBJECTIVE_COUNT_BY_DIFFICULTY: [number, number, number][] = [
  [1, 3, 1],
  [4, 6, 2],
  [7, 10, 3],
]

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

/** Entry from the difficulty-map JSON. */
interface DifficultyMapEntry {
  asteroidId: string
  minDifficulty: number
  maxDifficulty: number
}

/**
 * Pick a random asteroid template that fits the given difficulty.
 *
 * @param difficulty - Mission difficulty (1-10).
 * @returns Asteroid id from the catalog.
 */
export function pickAsteroidForDifficulty(difficulty: number): string {
  const entries = (difficultyMap as DifficultyMapEntry[]).filter(
    (e) => difficulty >= e.minDifficulty && difficulty <= e.maxDifficulty,
  )
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

/** Main belt inner radius — upper bound for near-earth missions. */
const NEAR_EARTH_OUTER_RADIUS = 420

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
function waypointAnnulusReachT(difficulty: number): number {
  const d = Math.max(MIN_WAYPOINT_DIFFICULTY, Math.min(MAX_WAYPOINT_DIFFICULTY, difficulty))
  return (d - MIN_WAYPOINT_DIFFICULTY) / (MAX_WAYPOINT_DIFFICULTY - MIN_WAYPOINT_DIFFICULTY)
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
 * Generate a waypoint position within a belt region.
 * Lower difficulty places the waypoint closer to the inner edge (e.g. nearer Earth in near-earth).
 *
 * @param region - Target region.
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
    outerRadius = NEAR_EARTH_OUTER_RADIUS
  } else {
    const beltId = region === 'asteroid-belt' ? 'main-belt' : 'kuiper-belt'
    const belt = ASTEROID_BELTS.find((b) => b.id === beltId)
    if (!belt) {
      innerRadius = nearEarthInnerCatalogForWaypointSpawn()
      outerRadius = NEAR_EARTH_OUTER_RADIUS
    } else {
      innerRadius = belt.innerRadius
      outerRadius = belt.outerRadius
    }
  }

  const band = outerRadius - innerRadius
  const reachT = waypointAnnulusReachT(difficulty)
  const outerExtentFraction =
    WAYPOINT_ANNULUS_INNER_FRACTION_AT_MIN_DIFFICULTY
    + (1 - WAYPOINT_ANNULUS_INNER_FRACTION_AT_MIN_DIFFICULTY) * reachT
  const maxRadialOffsetCatalog = band * outerExtentFraction

  const angle = Math.random() * Math.PI * 2
  const radiusCatalog = innerRadius + Math.random() * maxRadialOffsetCatalog
  const worldRadius = radiusCatalog * ORBIT_SCALE

  return {
    worldX: Math.cos(angle) * worldRadius,
    worldZ: Math.sin(angle) * worldRadius,
  }
}

/**
 * Generate a complete asteroid mission at a given difficulty.
 *
 * @param difficulty - Mission difficulty (1-10).
 * @returns Fully generated mission ready for the mission board.
 */
export function generateAsteroidMission(difficulty: number): GeneratedAsteroidMission {
  const givers = getGiversForDifficulty(difficulty)
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
      const region = findRegionForTemplate(template, difficulty)
      if (region) {
        candidates.push({ giver, template, region })
      }
    }
  }

  if (candidates.length === 0) {
    throw new Error(`No templates match difficulty ${difficulty}`)
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
    .sort((a, b) => b.weight - a.weight)
    .slice(0, count)
  const objectives = slots.map((s) => rollObjective(s, difficulty))

  const zones = generateFlatZones(objectives.length, LEVEL_GRID_SIZE, hashSeed(missionId))
  for (let i = 0; i < objectives.length; i++) {
    objectives[i]!.x = zones[i]!.x
    objectives[i]!.z = zones[i]!.z
  }

  const completionBonus = interpolateRange(pick.template.completionBonus, difficulty)
  const totalReward = objectives.reduce((sum, o) => sum + o.reward, 0) + completionBonus

  const waypoint = generateWaypointInRegion(pick.region, difficulty)

  const asteroidId = pickAsteroidForDifficulty(difficulty)

  return {
    id: missionId,
    asteroidId,
    giverId: pick.giver.id,
    giverName: pick.giver.name,
    templateId: pick.template.id,
    name: pick.template.name,
    briefing: pick.template.briefing,
    difficulty,
    region: pick.region,
    objectives,
    totalReward,
    waypoint,
    status: 'available',
  }
}
