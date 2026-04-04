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
