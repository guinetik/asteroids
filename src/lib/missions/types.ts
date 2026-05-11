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
import type { YamadaMissionState } from './yamadaArchetype'

/** The asteroid objective types a mission can contain. */
export type ObjectiveType =
  | 'gather'
  | 'exterminate'
  | 'rescue'
  | 'survey'
  | 'photometry'
  | 'dan'
  | 'collect'
  | 'bunker'
  | 'mineral-analysis'
  | 'prospectus-terminal'

/** Solar system region where missions spawn. Determines fuel cost and distance. */
export type MissionRegion =
  | 'near-earth'
  | 'asteroid-belt'
  | 'kuiper-belt'
  | 'jovian-trojans'
  | 'saturn-trojans'

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

/** Scalable params for SURVEY objectives. */
export interface SurveyScalableParams {
  /** Discriminator for the union type. */
  type: 'survey'
  /** Number of gravitometric probes to calibrate. Scales up with difficulty. */
  probeCount: NumberRange
  /** Seconds to collect all probes. INVERTED: decreases with difficulty (easy=90s, hard=45s). */
  timeLimit: NumberRange
}

/** Scalable params for PHOTOMETRY objectives. */
export interface PhotometryScalableParams {
  /** Discriminator for the union type. */
  type: 'photometry'
  /** Seconds to complete the probe flight, scan, and telemetry return. */
  timeLimit: NumberRange
  /** Seconds the pilot must hold the lander stable for the X-ray exposure. */
  scanHoldSeconds: NumberRange
  /** Distance from the asteroid objective site to the side standoff probe point. */
  probeDistance: NumberRange
}

/** Difficulty bucket for DAN particle and enemy pressure. */
export type DanPressureTier = 'low' | 'medium' | 'high'

/** Scalable params for DAN subsurface survey objectives. */
export interface DanScalableParams {
  /** Discriminator for the union type. */
  type: 'dan'
  /** Active scan duration, in seconds. Scales up with difficulty. */
  scanDurationSeconds: NumberRange
  /** Particle hits required to complete the scan meter. Scales up with difficulty. */
  requiredParticleHits: NumberRange
  /** Seconds before viroid pressure starts after scan activation. Inverted for harder bands. */
  enemyGraceSeconds: NumberRange
  /** Particle pressure preset for the runtime DAN system. */
  particleTier: DanPressureTier
  /** Enemy pressure preset for the runtime DAN system. */
  enemyTier: DanPressureTier
}

/** Scalable params for COLLECT objectives. Currently authored-only. */
export interface CollectScalableParams {
  /** Discriminator for the union type. */
  type: 'collect'
  /** Placeholder count range for one-off pickups. */
  pickupCount: NumberRange
}

/**
 * Catalog of bunker enemy variants. Default `'standard'` is the viroid swarm;
 * `'astronaut-chimera'` is the Ceres Institute reveal at Site CIB-7.
 *
 * @author guinetik
 * @date 2026-05-04
 * @spec docs/superpowers/specs/2026-05-04-ceres-institute-contract-design.md
 */
export type BunkerEnemyVariant = 'standard' | 'astronaut-chimera'

/**
 * Scalable params for BUNKER objectives. Wave count is not authored per
 * template — the generator picks 3 / 5 / 7 waves from the rolled mission
 * difficulty band (1–4 / 5–7 / 8–10). Slice 1 has no other knobs.
 */
export interface BunkerScalableParams {
  /** Discriminator for the union type. */
  type: 'bunker'
  /**
   * Optional enemy variant to spawn in the bunker. When set, the runtime
   * spawns this specific variant instead of the default viroid swarm.
   * Example: `"astronaut-chimera"`. Wired to the spawn factory in Phase 4.
   */
  enemyVariant?: BunkerEnemyVariant
}

/** Scalable params for MINERAL ANALYSIS objectives. */
export interface MineralAnalysisScalableParams {
  /** Discriminator for the union type. */
  type: 'mineral-analysis'
  /** Number of distinct rocks the pilot must fully analyze with the SCI gun. */
  analysisRockCount: NumberRange
  /** Kilograms of the terminal-selected mineral sample the pilot must mine and deliver. */
  sampleKg: NumberRange
}

/** Union of all objective-specific scalable parameters. */
export type ScalableParams =
  | GatherScalableParams
  | ExterminateScalableParams
  | RescueScalableParams
  | SurveyScalableParams
  | PhotometryScalableParams
  | DanScalableParams
  | CollectScalableParams
  | BunkerScalableParams
  | MineralAnalysisScalableParams

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
  /** Display name of the organization or authority posting these missions. */
  giverName?: string
  /** The 3 missions in this planet's pool. */
  missions: ShuttleMissionTemplate[]
}

/** Upgrade requirement to access a planet as a mission target. */
export interface PlanetAccessRequirement {
  /** Planet id. */
  planetId: string
  /** Upgrade id required (e.g. "shuttleHeatResistance"). */
  upgradeId: string
  /** Minimum upgrade level needed to survive at this planet. */
  minLevel: number
}

/** Planet orbital config — what a planet produces when visited for a mission. */
export interface PlanetOrbitalConfig {
  /** Planet id. */
  planetId: string
  /** Item id gathered at this planet (e.g. "venusian-gas"). */
  gatherItem: string
  /** Minigame type — dispatched by orbitalMiniGameFactory to create the appropriate OrbitalMiniGame. */
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
  /** Which planet is offering the asteroid mission (null if not docked). */
  offeringAsteroidPlanet: string | null
  /** The one active asteroid mission (null if none accepted). */
  activeAsteroidMission: GeneratedAsteroidMission | null
  /** Restock timer for asteroid missions. */
  asteroidRestockTimer: RestockTimer | null
  /** Currently offered EVA (visit-relay) mission at the docked planet. */
  offeredEvaMission: VisitRelayShuttleMissionTemplate | null
  /** Which planet is offering the EVA mission (null if not docked). */
  offeringEvaPlanet: string | null
  /** Restock timer for EVA missions — counts down after one is taken. */
  evaRestockTimer: RestockTimer | null
  /** All active EVA missions the player has accepted. */
  activeEvaMissions: ActiveVisitRelayMission[]
  /** Currently offered mining mission at the docked planet (null if restocking or not docked). */
  offeredMiningMission: TurretMiningMissionTemplate | null
  /** Which planet is offering the mining mission (null if not docked). */
  offeringMiningPlanet: string | null
  /** Restock timer for mining missions — counts down after one is taken. */
  miningRestockTimer: RestockTimer | null
  /** All active mining missions the player has accepted. */
  activeMiningMissions: ActiveTurretMiningMission[]
}

// ---------------------------------------------------------------------------
// Shuttle EVA (visit-relay) missions
// ---------------------------------------------------------------------------

/**
 * POI prop model spawned at the EVA waypoint. Drives the `EvaMissionPoi` factory;
 * new flavors (e.g. `'telescope'`) are added here plus one new branch in the factory.
 */
export type EvaMissionPoiType = 'satellite' | 'relay_antenna' | 'telescope'

/**
 * A shuttle EVA mission template from JSON — player flies to a waypoint and spacewalks.
 *
 * Waypoints are not authored in the template: they are generated at accept time close
 * to the giver planet's current world position so the POI always sits near the player's
 * current orbit rather than at an absolute coordinate that drifts away as planets move.
 */
export interface VisitRelayShuttleMissionTemplate {
  /** Unique key, e.g. "earth_relay_tx4_reboot". */
  id: string
  /** Display name for the mission board. */
  name: string
  /** Flavor text describing the mission. */
  description: string
  /** Which prop spawns at the waypoint. Same minigame; different lore + model. */
  poiType: EvaMissionPoiType
  /** Minigame id dispatched via OrbitalMiniGameFactory once the EVA terminal is interacted with. */
  minigameType: string
  /** Credits awarded on delivery back at the giver planet. */
  reward: number
}

/** A planet's EVA mission pool loaded from JSON. */
export interface VisitRelayMissionPool {
  /** Planet id that offers these missions. */
  planetId: string
  /** Display name of the organization or authority posting these EVA missions. */
  giverName?: string
  /** The missions in this planet's EVA pool. */
  missions: VisitRelayShuttleMissionTemplate[]
}

/** Status of an active EVA mission. */
export type VisitRelayMissionStatus = 'active' | 'ready-to-deliver'

/** An EVA mission the player has accepted and is working on. */
export interface ActiveVisitRelayMission {
  /** The original template. */
  template: VisitRelayShuttleMissionTemplate
  /** Planet the mission was accepted at (and where it must be delivered). */
  giverPlanet: string
  /**
   * World-space waypoint generated at accept time near the giver planet's then-current
   * position. Snapshotted so the POI stays put while the giver planet keeps orbiting.
   * The root always sits on the shuttle's Y=0 orbital plane (beam marker stays aligned
   * with overhead map); `poiLocalY` raises or lowers the POI prop inside the root so
   * egress has a small vertical component.
   */
  waypoint: { worldX: number; worldZ: number; poiLocalY: number }
  /** Current mission status. */
  status: VisitRelayMissionStatus
  /**
   * For `satellite_servicing` missions only: names of rigged sub-objects on the POI
   * that start in the damaged state. Rolled deterministically from the mission id
   * at accept time so retries see the same damage.
   */
  brokenComponents?: string[]
  /**
   * For `satellite_servicing` missions only: the POI variant rolled at accept time
   * from the variant pool (satellite/voyager/hubble). Overrides {@link template.poiType}
   * at spawn so the same generic mission template can present any of the three models.
   * Omitted on legacy missions or non-servicing flows — callers fall back to template.
   */
  rolledPoiType?: EvaMissionPoiType
}

// ---------------------------------------------------------------------------
// Turret Mining Missions — contract-driven bulk ore collection on /map
// ---------------------------------------------------------------------------

/** Difficulty tier of a turret mining mission. Drives ore specificity and reward band. */
export type MiningMissionDifficulty = 'easy' | 'medium' | 'hard'

/**
 * What ore a mining mission wants. `'any'` counts every main-belt ore toward
 * progress (easy tier). Specific IDs restrict progress tracking to that exact
 * catalog item from `src/data/inventory/items.json`.
 */
export type MiningOreCategory = 'any' | 'olivine' | 'magnetite' | 'iron-nickel-alloy' | 'water-ice'

/** A turret mining mission template from JSON — one entry in a giver planet's pool. */
export interface TurretMiningMissionTemplate {
  /** Unique key, e.g. "mars_marines_olivine_plating". */
  id: string
  /** Display name shown on the mission board. */
  name: string
  /** Flavor text / briefing from the giver. */
  description: string
  /** Difficulty tier — drives authoring of ore category and reward. */
  difficulty: MiningMissionDifficulty
  /** Which ore counts toward progress. */
  oreCategory: MiningOreCategory
  /** Kilograms required to mark the mission ready-to-deliver. */
  targetKg: number
  /** Credits awarded on delivery (before Science Station multiplier). */
  reward: number
}

/** A giver planet's mining mission pool loaded from JSON. */
export interface TurretMiningMissionPool {
  /** Planet id that offers these missions. */
  planetId: string
  /** Display name of the giver organization (e.g. "Martian Marines Corps"). */
  giverName: string
  /**
   * Stable id for contract filters and future scripting (e.g. `martian-marines`
   * for the MMC mining board at Mars).
   */
  giverId: string
  /** Missions in this planet's mining pool. */
  missions: TurretMiningMissionTemplate[]
}

/**
 * A mining mission the player has accepted. Progress and readiness are
 * computed on-demand from current cargo inventory — no per-commit event
 * tracking. The player just needs the right ore in the hold when they
 * dock at the giver planet.
 */
export interface ActiveTurretMiningMission {
  /** The original template. */
  template: TurretMiningMissionTemplate
  /** Planet where the mission was accepted (and where delivery must occur). */
  giverPlanet: string
  /**
   * Giver org id (from the pool), for contract and telemetry matching.
   * Omitted on boards accepted before the field existed — resolved at deliver time.
   */
  giverId?: string
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
  /**
   * Optional story flag gating this giver. When set, the giver only surfaces
   * if `profile.activeStoryFlags[requiresFlag] === true`. Use for post-outcome
   * content (e.g. Mr. Finch and Cloud City Ops, post-tamper).
   */
  requiresFlag?: string
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
  /**
   * Optional planet-id allowlist. When set, this template only rolls when the
   * asteroid mission is generated at one of these planets. Templates without
   * `planetIds` remain globally available (current default behavior).
   */
  planetIds?: string[]
  /**
   * Optional story flag gating this individual mission entry. Use when the
   * giver itself is always-on but a subset of missions is post-outcome
   * (e.g. Jay Mercer's Jupiter expansion entries gated by `'jovianContractTampered'`).
   */
  requiresFlag?: string
  /**
   * Optional archetype tag — purely informational metadata for content-side
   * differentiation when multiple templates share the same `objectiveType`
   * but represent distinct narrative archetypes (e.g. Yamada Farms's
   * `'bunker-protect'`, `'bunker-extract'`, `'patient-rescue'`). Reserved as
   * the future branching knob for archetype-specific customization passes
   * (model swaps, extra success/fail conditions, delivery loops). The
   * generator and runtime ignore this field today.
   */
  archetype?: string
}

/** Concrete rolled objective values for a generated mission. */
export interface ConcreteObjective {
  /** Objective type. */
  type: ObjectiveType
  /** World-space X position (flat zone center). */
  x: number
  /** World-space Z position (flat zone center). */
  z: number
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
  /** For survey: number of probes to calibrate. */
  probeCount?: number
  /** For survey: time limit in seconds. */
  timeLimit?: number
  /** For photometry: seconds of stable lander hold required for the exposure. */
  scanHoldSeconds?: number
  /** For photometry: distance from objective site to the side standoff probe point. */
  probeDistance?: number
  /** For DAN: active scan duration, in seconds. */
  scanDurationSeconds?: number
  /** For DAN: particle hits needed to complete the scan meter. */
  requiredParticleHits?: number
  /** For DAN: seconds before viroid spawns begin. */
  enemyGraceSeconds?: number
  /** For DAN: particle pressure preset, consumed by runtime tuning. */
  particleTier?: DanPressureTier
  /** For DAN: enemy pressure preset, consumed by runtime tuning. */
  enemyTier?: DanPressureTier
  /** For collect: stable inventory/item id granted by the pickup. */
  collectItemId?: string
  /** For collect: UI-facing item label. */
  collectItemLabel?: string
  /** For collect: prompt shown when in interaction range. */
  interactionLabel?: string
  /** For bunker: number of waves to clear, stamped from the rolled difficulty band (3 / 5 / 7). */
  waveCount?: number
  /**
   * For bunker: optional enemy variant override. When set, the runtime spawns this specific
   * enemy variant instead of the default viroid swarm. See {@link BunkerEnemyVariant} for valid options.
   * Wired to the spawn factory in Phase 4.
   */
  enemyVariant?: BunkerEnemyVariant
  /** For mineral analysis: number of distinct rocks to fully analyze with the SCI gun. */
  analysisRockCount?: number
  /** For mineral analysis: kilograms of the selected mineral sample to mine and deliver. */
  sampleKg?: number
  /** Credit reward for this objective. */
  reward: number
  /**
   * Lower bound of reward when the objective supports partial credit (DAN).
   * Omitted = binary objective; full {@link reward} always granted on completion.
   */
  rewardMin?: number
  /**
   * Reward actually granted at completion time. Set by the level controller when
   * partial-credit objectives finish. Falls back to {@link reward} for binary
   * objectives at persist time.
   */
  actualReward?: number
}

/** Status of an asteroid mission. */
export type AsteroidMissionStatus = 'available' | 'accepted' | 'in-transit'

/** Standard procedural content or an authored special mission. */
export type AsteroidMissionKind = 'standard' | 'special'

/**
 * Where a `kind: 'special'` mission is staged.
 *
 * - `'asteroid'` (implicit when omitted) — mission is placed on the asteroid mission slot
 *   and pinned to `asteroidId`. This is the default for legacy specials
 *   (`consortium-certification`, `jovian-prospection-*`).
 * - `'planet-eva'` — mission is placed on the EVA mission board for `planetId`,
 *   spawning a single POI of `poiType` (currently `'telescope'`).
 *
 * @author guinetik
 * @date 2026-05-04
 * @spec docs/superpowers/plans/2026-05-04-finch-recovery-contract-loop.md
 */
export type SpecialMissionTarget =
  | { kind: 'asteroid' }
  | { kind: 'planet-eva'; planetId: string; poiType: 'telescope' }

/** A fully generated asteroid mission ready for play. */
export interface GeneratedAsteroidMission {
  /** Whether the mission is procedural or authored special content. */
  kind: AsteroidMissionKind
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
  /**
   * Station planet that posted this contract; procedural waypoints are generated near this
   * world's orbit. Omitted on older saves or authored specials with fixed waypoints.
   */
  originPlanetId?: string
  /**
   * Template tier / flavor (near-earth, main belt, kuiper). Objective difficulty — not the
   * solar-map spawn location when {@link originPlanetId} is set.
   */
  region: MissionRegion
  /** Concrete objectives with rolled values. */
  objectives: ConcreteObjective[]
  /** Total credits: sum of objective rewards + completion bonus. */
  totalReward: number
  /** Waypoint world position. */
  waypoint: { worldX: number; worldZ: number }
  /** Current status. */
  status: AsteroidMissionStatus
  /**
   * For `kind: 'special'` missions only — declares whether the mission is staged on
   * the asteroid mission slot (default / omitted) or routed to the EVA mission board.
   * Procedural missions and legacy asteroid specials leave this undefined; planet-EVA
   * specials (e.g. Finch telescope-EVA missions) declare `{ kind: 'planet-eva', ... }`.
   */
  target?: SpecialMissionTarget
  /**
   * Optional inventory grant on successful completion. When
   * `replenishWhileStepOpen` is true, the grant is suppressed if the player
   * already holds at least `count` of `itemId` (no duplicates), and is
   * suppressed entirely once any paired delivery step in any active contract
   * has already advanced past the matching `itemId`. Softlock-prevention
   * rule: lost-crate-on-death triggers a re-grant; the loop closes when the
   * deliver step advances.
   */
  grantsItemOnComplete?: {
    /** Inventory item id to grant on success. */
    itemId: string
    /** Units to grant. */
    count: number
    /** When true, applies the dedup + close-on-deliver-advance rules. */
    replenishWhileStepOpen?: boolean
  }
  /**
   * Archetype-specific runtime state for Yamada Farms missions. Stamped at
   * acceptance time when the giver template's `archetype` is one of
   * `'bunker-protect'`, `'bunker-extract'`, or `'patient-rescue'`. Omitted for
   * all non-Yamada missions.
   *
   * @see {@link YamadaMissionState}
   */
  yamada?: YamadaMissionState
}
