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

/** Earth's approximate semi-major axis in catalog units. */
const NEAR_EARTH_INNER_RADIUS = 200

/** Main belt inner radius — upper bound for near-earth missions. */
const NEAR_EARTH_OUTER_RADIUS = 420

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
        resourceAmount: interpolateRange(slot.params.resourceAmount, difficulty),
        reward,
      }
    case 'exterminate':
      return {
        type: 'exterminate',
        nestCount: interpolateRange(slot.params.nestCount, difficulty),
        swarmSize: interpolateRange(slot.params.swarmSize, difficulty),
        hasSpitters: Math.random() < slot.params.spitterChance,
        reward,
      }
    case 'rescue':
      return {
        type: 'rescue',
        colonistCount: interpolateRange(slot.params.colonistCount, difficulty),
        oxygenTime: interpolateRange(slot.params.oxygenTime, difficulty),
        isGuarded: Math.random() < slot.params.guardedChance,
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
 *
 * @param region - Target region.
 * @returns World-space XZ coordinates within the belt.
 */
export function generateWaypointInRegion(region: MissionRegion): { worldX: number; worldZ: number } {
  let innerRadius: number
  let outerRadius: number

  if (region === 'near-earth') {
    innerRadius = NEAR_EARTH_INNER_RADIUS
    outerRadius = NEAR_EARTH_OUTER_RADIUS
  } else {
    const beltId = region === 'asteroid-belt' ? 'main-belt' : 'kuiper-belt'
    const belt = ASTEROID_BELTS.find((b) => b.id === beltId)
    if (!belt) {
      innerRadius = NEAR_EARTH_INNER_RADIUS
      outerRadius = NEAR_EARTH_OUTER_RADIUS
    } else {
      innerRadius = belt.innerRadius
      outerRadius = belt.outerRadius
    }
  }

  const angle = Math.random() * Math.PI * 2
  const radius = innerRadius + Math.random() * (outerRadius - innerRadius)
  const worldRadius = radius * ORBIT_SCALE

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

  const pick = candidates[Math.floor(Math.random() * candidates.length)]!
  const slot = pick.template.objectiveSlots[0]!
  const objective = rollObjective(slot, difficulty)
  const completionBonus = interpolateRange(pick.template.completionBonus, difficulty)
  const totalReward = objective.reward + completionBonus

  const waypoint = generateWaypointInRegion(pick.region)

  return {
    id: `${pick.template.id}_${Date.now()}`,
    giverId: pick.giver.id,
    giverName: pick.giver.name,
    templateId: pick.template.id,
    name: pick.template.name,
    briefing: pick.template.briefing,
    difficulty,
    region: pick.region,
    objectives: [objective],
    totalReward,
    waypoint,
    status: 'available',
  }
}
