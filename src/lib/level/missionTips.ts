/**
 * Resolves first-time mission guidance copy for the in-level visor HUD.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
import missionTipsData from '@/data/level/mission-tips.json'
import type { GeneratedAsteroidMission, ObjectiveType } from '@/lib/missions/types'
import type { PlayerProfile } from '@/lib/player/types'

/** Visual tone applied to the mission-tip HUD panel. */
export type MissionTipTone = 'mining' | 'science' | 'combat' | 'rescue' | 'logistics'

/** Gameplay view that can display a mission-tip transmission. */
export type MissionTipView = 'fps' | 'lander'

/** Resolved NPC transmission shown in the helmet visor HUD. */
export interface MissionTipTransmission {
  /** Stable id used by the HUD queue, for example `objective:gather` or `runtime:o2-low`. */
  id: string
  /** Speaker name shown in the HUD, for example `Jay` or `Frontier Rescue`. */
  speaker: string
  /** Short signal/channel label, for example `RESCUE BAND`. */
  channel: string
  /** Gameplay view this tip applies to, for example `fps` for multitool shortcuts. */
  view: MissionTipView
  /** Visual tone controlling the panel accent color. */
  tone: MissionTipTone
  /** Full guidance message shown to the player. */
  message: string
  /** Primary mission objective type this guidance teaches, for example `gather`. */
  objectiveType: ObjectiveType
}

/** JSON shape for one authored mission-tip entry. */
interface MissionTipDataEntry {
  /** Speaker name shown in the HUD. */
  speaker: string
  /** Short signal/channel label. */
  channel: string
  /** Gameplay view this tip applies to. */
  view: MissionTipView
  /** Visual tone controlling panel accent. */
  tone: MissionTipTone
  /** Guidance copy. */
  message: string
}

/** JSON shape for all mission-tip entries. */
interface MissionTipsData {
  /** Lander refresher copy shown before the player's first completed mission. */
  firstRunLanderTip: MissionTipDataEntry
  /** Runtime reactive tips keyed by symbolic trigger id. */
  runtimeTips: Record<string, MissionTipDataEntry>
  /** Fallback copy keyed by objective type. */
  objectiveTips: Record<ObjectiveType, MissionTipDataEntry>
  /** Giver-specific copy keyed by giver id then objective type. */
  giverTips: Partial<Record<string, Partial<Record<ObjectiveType, MissionTipDataEntry>>>>
}

/** Typed mission-tip data imported from JSON. */
const MISSION_TIPS = missionTipsData as MissionTipsData

/**
 * Check if the profile has no completed asteroid missions yet.
 *
 * @param profile - Current player profile, or `null` for a fresh/unknown save.
 * @returns True when this should be treated as the player's first mission run.
 */
export function isFirstMissionRun(profile: PlayerProfile | null): boolean {
  return (profile?.completedMissionCount ?? 0) <= 0
}

/**
 * Return the primary objective type used to decide first-time guidance.
 *
 * @param mission - Active asteroid mission.
 * @returns The first objective type, or `null` when the mission has no objectives.
 */
export function getMissionTipObjectiveType(
  mission: GeneratedAsteroidMission,
): ObjectiveType | null {
  return mission.objectives[0]?.type ?? null
}

/**
 * Check if the player has completed at least one objective of this type before.
 *
 * @param profile - Current player profile, or `null` for a fresh/unknown save.
 * @param objectiveType - Objective type being taught.
 * @returns True when a prior completion exists.
 */
export function hasCompletedMissionObjectiveType(
  profile: PlayerProfile | null,
  objectiveType: ObjectiveType,
): boolean {
  const completed = profile?.achievementStats.missionObjectivesCompletedByType[objectiveType] ?? 0
  return completed > 0
}

/**
 * Resolve the lander refresher for the player's first mission run.
 *
 * @param mission - Active asteroid mission, used to preserve the objective type context.
 * @param profile - Current player profile, or `null` when unavailable.
 * @returns A lander transmission when the player has never completed a mission.
 */
export function resolveFirstRunLanderTipTransmission(
  mission: GeneratedAsteroidMission,
  profile: PlayerProfile | null,
): MissionTipTransmission | null {
  const objectiveType = getMissionTipObjectiveType(mission)
  if (objectiveType === null || !isFirstMissionRun(profile)) return null

  return {
    id: 'first-run-lander',
    ...MISSION_TIPS.firstRunLanderTip,
    objectiveType,
  }
}

/**
 * Resolve the contextual first-time mission tip for the active mission.
 *
 * @param mission - Active asteroid mission.
 * @param profile - Current player profile, or `null` when unavailable.
 * @param view - Gameplay view currently eligible to display this tip.
 * @returns A transmission when this is the first completion attempt for the primary type.
 */
export function resolveMissionTipTransmission(
  mission: GeneratedAsteroidMission,
  profile: PlayerProfile | null,
  view: MissionTipView,
): MissionTipTransmission | null {
  const objectiveType = getMissionTipObjectiveType(mission)
  if (objectiveType === null || hasCompletedMissionObjectiveType(profile, objectiveType)) {
    return null
  }

  const giverTip = MISSION_TIPS.giverTips[mission.giverId]?.[objectiveType]
  const objectiveTip = MISSION_TIPS.objectiveTips[objectiveType]
  const tip = giverTip ?? objectiveTip
  if (!tip || tip.view !== view) return null

  return {
    id: `objective:${objectiveType}`,
    ...tip,
    objectiveType,
  }
}

/**
 * Resolve a reactive runtime tip authored in mission-tip JSON.
 *
 * @param id - Runtime tip id from `mission-tips.json`, for example `oxygenLow`.
 * @param objectiveType - Current primary objective type used for analytics/context.
 * @returns A runtime transmission, or `null` when the id is not authored.
 */
export function resolveRuntimeMissionTipTransmission(
  id: string,
  objectiveType: ObjectiveType,
): MissionTipTransmission | null {
  const tip = MISSION_TIPS.runtimeTips[id]
  if (!tip) return null

  return {
    id: `runtime:${id}`,
    ...tip,
    objectiveType,
  }
}
