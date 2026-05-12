/**
 * Yamada Farms archetype-specific mission state.
 *
 * The `archetype` string on `MissionGiverTemplate` is a template-side tag.
 * After a mission is rolled and accepted, `stampYamadaState()` translates that
 * tag into a discriminated runtime state attached to the active mission as
 * `GeneratedAsteroidMission.yamada`. Consumers (level controller, HUD,
 * overlay, mission board) branch on `yamada.archetype` to apply archetype
 * behavior.
 *
 * @author guinetik
 * @date 2026-05-11
 * @spec docs/superpowers/specs/2026-05-11-yamada-mission-pool-design.md
 */

/** Bunker Protect runtime state. */
export interface YamadaBunkerProtectState {
  /** Discriminator. */
  archetype: 'bunker-protect'
  /**
   * Total seconds the player has from arrival on the asteroid to complete every
   * wave AND reboot the cylinder. Expiry hard-fails the mission. Length is
   * difficulty-derived at acceptance (see `pickSuspensionLapseSeconds`).
   */
  suspensionLapseSeconds: number
}

/** Bunker Extract runtime state. */
export interface YamadaBunkerExtractState {
  /** Discriminator. */
  archetype: 'bunker-extract'
  /** Planet id where the organ must be delivered. */
  destinationPlanetId: string
  /** Total countdown in seconds from dispense completion to required delivery. */
  deliveryTimerSeconds: number
  /** Inventory item id granted by the cylinder dispense beat. */
  organItemId: string
  /**
   * Set true after the dispense beat completes. Persists across the map↔level
   * boundary via `saveActiveMission`. Consumers branch on this to enable the
   * Deliver button at the destination planet (Phase 7) and to drive the cargo
   * HUD readouts during flight (Phase 6).
   */
  organDispensed?: boolean
}

/** Patient Rescue runtime state. */
export interface YamadaPatientRescueState {
  /** Discriminator. */
  archetype: 'patient-rescue'
  /**
   * Index of the VIP within the rescue operator list (0-based). The operator
   * at this index is rendered in yellow and hard-fails the mission on death.
   */
  vipOperatorIndex: number
}

/** Union of all Yamada archetype runtime states. */
export type YamadaMissionState =
  | YamadaBunkerProtectState
  | YamadaBunkerExtractState
  | YamadaPatientRescueState

/**
 * Suspension-lapse timer by difficulty for Bunker Protect.
 * 4–6 → 7 min; 7–9 → 5 min. Tuneable per design open-questions list.
 *
 * @param difficulty - Mission difficulty (1–10).
 */
export function pickSuspensionLapseSeconds(difficulty: number): number {
  if (difficulty <= 6) return 420
  return 300
}

/** Inventory item id granted by the Bunker Extract dispense. */
export const YAMADA_ORGAN_ITEM_ID = 'yamada-organ-case'

/** Acceptance-time context required to stamp the Yamada runtime state. */
export interface YamadaStampInput {
  /** Archetype string from the giver template (may be undefined). */
  archetype: string | undefined
  /** Rolled mission difficulty. */
  difficulty: number
  /** Bunker Extract: pinned destination planet id. */
  destinationPlanetId?: string
  /** Bunker Extract: precomputed timer length (seconds). */
  deliveryTimerSeconds?: number
  /** Patient Rescue: total operators in the rescue objective. */
  operatorCount?: number
  /** Optional RNG injectable for tests. Defaults to `Math.random`. */
  rand?: () => number
}

/**
 * Translate a giver template's `archetype` tag into the Yamada runtime state
 * attached to `GeneratedAsteroidMission.yamada`. Returns `undefined` for any
 * archetype outside the three asteroid Yamada variants — that signals the
 * caller (asteroid mission generator) not to set the field.
 *
 * @param input - Acceptance-time context.
 * @returns Discriminated state, or undefined for non-Yamada archetypes.
 */
export function stampYamadaState(input: YamadaStampInput): YamadaMissionState | undefined {
  const rand = input.rand ?? Math.random
  switch (input.archetype) {
    case 'bunker-protect':
      return {
        archetype: 'bunker-protect',
        suspensionLapseSeconds: pickSuspensionLapseSeconds(input.difficulty),
      }
    case 'bunker-extract': {
      if (!input.destinationPlanetId || input.deliveryTimerSeconds === undefined) {
        return undefined
      }
      return {
        archetype: 'bunker-extract',
        destinationPlanetId: input.destinationPlanetId,
        deliveryTimerSeconds: input.deliveryTimerSeconds,
        organItemId: YAMADA_ORGAN_ITEM_ID,
      }
    }
    case 'patient-rescue': {
      const count = Math.max(1, input.operatorCount ?? 1)
      return {
        archetype: 'patient-rescue',
        vipOperatorIndex: Math.floor(rand() * count),
      }
    }
    default:
      return undefined
  }
}
