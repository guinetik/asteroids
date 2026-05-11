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
