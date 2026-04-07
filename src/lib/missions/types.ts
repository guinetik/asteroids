/**
 * Mission template data model.
 *
 * Defines the structure for data-driven mission templates loaded from
 * JSON. Templates define generation rules — objective types, param
 * ranges, reward ranges, difficulty tiers. The generator (separate
 * system) creates concrete missions at runtime.
 *
 * @author guinetik
 * @date 2026-04-03
 * @spec docs/superpowers/specs/2026-04-03-mission-templates-design.md
 */

import type { RestockTimer } from '@/lib/shop/tradeTypes'

/** The three objective types a mission can contain. */
export type ObjectiveType = 'gather' | 'exterminate' | 'rescue'

/** Solar system region where missions spawn. Determines fuel cost and distance. */
export type MissionRegion = 'near-earth' | 'asteroid-belt' | 'kuiper-belt'

/** A min/max range for procedural generation. Generator interpolates based on difficulty. */
export interface NumberRange {
  /** Lower bound (or upper bound for inverted ranges like oxygenTime). */
  min: number
  /** Upper bound (or lower bound for inverted ranges like oxygenTime). */
  max: number
}

/** Scalable params for GATHER objectives. */
export interface GatherScalableParams {
  /** Discriminator for the union type. */
  type: 'gather'
  /** Kilograms of resource to collect at waypoint. Scales up with difficulty. */
  resourceAmount: NumberRange
}

/** Scalable params for EXTERMINATE objectives. */
export interface ExterminateScalableParams {
  /** Discriminator for the union type. */
  type: 'exterminate'
  /** Number of bug nests to destroy at this waypoint. */
  nestCount: NumberRange
  /** Number of crawlers spawned per nest. */
  swarmSize: NumberRange
  /** Probability (0–1) that spitter enemies are present. Scales with difficulty. */
  spitterChance: number
}

/** Scalable params for RESCUE objectives. */
export interface RescueScalableParams {
  /** Discriminator for the union type. */
  type: 'rescue'
  /** Number of colonists to extract from cocoons. */
  colonistCount: NumberRange
  /** Seconds before colonists die. INVERTED: decreases with difficulty (easy=120s, hard=30s). */
  oxygenTime: NumberRange
  /** Probability (0–1) that bugs guard the cocoon site. */
  guardedChance: number
}

/** Union of all objective-specific scalable parameters. */
export type ScalableParams =
  | GatherScalableParams
  | ExterminateScalableParams
  | RescueScalableParams

/** A slot in a mission template that the generator fills with a concrete objective. */
export interface ObjectiveSlot {
  /** Which objective type this slot generates. */
  type: ObjectiveType
  /** Probability weight when the generator picks among multiple slot options. */
  weight: number
  /** Min/max ranges for objective parameters, interpolated by difficulty. */
  params: ScalableParams
  /** Credit payout range for completing this objective. */
  reward: NumberRange
}

/** Top-level mission template loaded from a JSON data file. */
export interface MissionTemplate {
  /** Unique key, e.g. "mining_contract". */
  id: string
  /** Display name for the mission board, e.g. "Mining Contract". */
  name: string
  /** Flavor text shown on the mission board. */
  description: string
  /** Minimum difficulty level (1–10) at which this template can appear. */
  minDifficulty: number
  /** Maximum difficulty level (1–10) at which this template can appear. */
  maxDifficulty: number
  /** Defines what objectives can be generated for this mission. */
  objectiveSlots: ObjectiveSlot[]
  /** Credit bonus range awarded for completing ALL objectives in the mission. */
  completionBonus: NumberRange
  /** Maps region to [minDifficulty, maxDifficulty] range. Determines where the asteroid spawns based on mission difficulty. */
  regionByDifficulty: Record<MissionRegion, [number, number]>
}

// ---------------------------------------------------------------------------
// Shuttle Missions — planet-to-planet orbital tasks
// ---------------------------------------------------------------------------

/** A shuttle mission template from JSON — one entry in a planet's pool. */
export interface ShuttleMissionTemplate {
  /** Unique key, e.g. "earth_venus_gas_science". */
  id: string
  /** Display name for the mission board. */
  name: string
  /** Flavor text describing the mission. */
  description: string
  /** Planet id the player must travel to. */
  targetPlanet: string
  /** Number of items to gather at the target planet. */
  gatherQuantity: number
  /** Credits awarded on delivery. */
  reward: number
}

/** A planet's full shuttle mission pool loaded from JSON. */
export interface ShuttleMissionPool {
  /** Planet id that offers these missions. */
  planetId: string
  /** The 3 missions in this planet's pool. */
  missions: ShuttleMissionTemplate[]
}

/** Planet orbital config — what a planet produces when visited for a mission. */
export interface PlanetOrbitalConfig {
  /** Planet id. */
  planetId: string
  /** Item id gathered at this planet (e.g. "venusian-gas"). */
  gatherItem: string
  /** Minigame type (ignored until minigames are implemented). */
  minigameType: string
}

/** Status of an active shuttle mission. */
export type ShuttleMissionStatus = 'active' | 'ready-to-deliver'

/** A mission the player has accepted and is working on. */
export interface ActiveShuttleMission {
  /** The original template. */
  template: ShuttleMissionTemplate
  /** Planet id where the mission was accepted and must be delivered. */
  giverPlanet: string
  /** Current mission status. */
  status: ShuttleMissionStatus
}

/** The mission board state for the shuttle control terminal. */
export interface ShuttleMissionBoard {
  /** Currently offered mission at the docked planet (null if restocking or not docked). */
  offeredMission: ShuttleMissionTemplate | null
  /** Which planet is offering (null if not docked). */
  offeringPlanet: string | null
  /** Restock timer — counts down after a mission is taken. */
  restockTimer: RestockTimer | null
  /** All active missions the player has accepted. */
  activeMissions: ActiveShuttleMission[]
  /** Currently offered asteroid mission (null if restocking). */
  offeredAsteroidMission: GeneratedAsteroidMission | null
  /** The one active asteroid mission (null if none accepted). */
  activeAsteroidMission: GeneratedAsteroidMission | null
  /** Restock timer for asteroid missions. */
  asteroidRestockTimer: RestockTimer | null
}

// ---------------------------------------------------------------------------
// Asteroid Missions — giver-driven, belt/kuiper waypoint missions
// ---------------------------------------------------------------------------

/** A mission giver — character or organization that offers asteroid missions. */
export interface MissionGiver {
  /** Unique giver id, e.g. "jay". */
  id: string
  /** Display name, e.g. "Jay Mercer". */
  name: string
  /** Title or role, e.g. "Senior Hauler". */
  title: string
  /** Which objective types this giver offers. */
  objectiveTypes: ObjectiveType[]
  /** Minimum difficulty (1-10) this giver operates at. */
  minDifficulty: number
  /** Maximum difficulty (1-10) this giver operates at. */
  maxDifficulty: number
  /** The mission templates this giver can offer. */
  missions: MissionGiverTemplate[]
}

/** A mission template within a giver's manifest. */
export interface MissionGiverTemplate {
  /** Unique template id, e.g. "jay_mineral_survey". */
  id: string
  /** Display name. */
  name: string
  /** Flavor text from the giver. */
  briefing: string
  /** Objective slots with scalable params. */
  objectiveSlots: ObjectiveSlot[]
  /** Credit bonus range for completing all objectives. */
  completionBonus: NumberRange
  /** Maps region to difficulty range. */
  regionByDifficulty: Partial<Record<MissionRegion, [number, number]>>
}

/** Concrete rolled objective values for a generated mission. */
export interface ConcreteObjective {
  /** Objective type. */
  type: ObjectiveType
  /** For gather: kg to collect. */
  resourceAmount?: number
  /** For exterminate: nest count. */
  nestCount?: number
  /** For exterminate: swarm size per nest. */
  swarmSize?: number
  /** For exterminate: whether spitters are present. */
  hasSpitters?: boolean
  /** For rescue: colonist count. */
  colonistCount?: number
  /** For rescue: seconds of oxygen. */
  oxygenTime?: number
  /** For rescue: whether site is guarded. */
  isGuarded?: boolean
  /** Credit reward for this objective. */
  reward: number
}

/** Status of an asteroid mission. */
export type AsteroidMissionStatus = 'available' | 'accepted' | 'in-transit'

/** A fully generated asteroid mission ready for play. */
export interface GeneratedAsteroidMission {
  /** Unique instance id (templateId + timestamp). */
  id: string
  /** Asteroid template id from the catalog, e.g. "bennu", "kr3". Drives terrain and visuals. */
  asteroidId: string
  /** Giver id. */
  giverId: string
  /** Giver display name. */
  giverName: string
  /** Template id. */
  templateId: string
  /** Mission display name. */
  name: string
  /** Flavor text from the giver. */
  briefing: string
  /** Rolled difficulty (1-10). */
  difficulty: number
  /** Belt region where waypoint spawns. */
  region: MissionRegion
  /** Concrete objectives with rolled values. */
  objectives: ConcreteObjective[]
  /** Total credits: sum of objective rewards + completion bonus. */
  totalReward: number
  /** Waypoint world position. */
  waypoint: { worldX: number; worldZ: number }
  /** Current status. */
  status: AsteroidMissionStatus
}
