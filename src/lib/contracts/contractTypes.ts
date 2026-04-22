/**
 * Contract data model types.
 *
 * Contracts are guided multi-step progression arcs delivered as messages
 * in their own per-contract inbox folder. Each step is one of:
 *  - complete-missions:  count missions matching optional filters
 *  - install-upgrade:    have an upgrade installed at >= minLevel
 *  - visit-planet:       enter orbit at a specific planet
 *  - orbital-mission:    complete a planetary shuttle mission targeting a planet
 *
 * Steps are completed in order. Completion grants {@link RewardEffect}s
 * such as a fast-travel kiosk unlock or a per-planet pay multiplier.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-contracts-design.md
 */
import type { UpgradeId } from '@/lib/upgrades'

/** Mission family that can satisfy a `complete-missions` step. */
export type ContractMissionType = 'shuttle' | 'asteroid' | 'eva' | 'mining'

/** Tag emitted on every mission-completed event for step matching. */
export interface MissionCompletedEvent {
  /** Which mission family completed. */
  kind: ContractMissionType
  /** Planet id that issued the mission (for shuttle/eva) or the asteroid's home planet (asteroid). */
  giverPlanetId: string | null
  /** Optional giver id (e.g. `jay` for Jay's mission templates). */
  giverId: string | null
  /** For shuttle planetary missions, the planet the mission targets. */
  targetPlanetId: string | null
}

/** Step that requires N completed missions matching optional filters. */
export interface CompleteMissionsStep {
  kind: 'complete-missions'
  /** Total missions of the matching kind required to mark the step complete. */
  count: number
  /** Restrict to a single mission family. */
  missionType?: ContractMissionType
  /** Restrict to a single giver id (matches {@link MissionCompletedEvent.giverId}). */
  giverId?: string
  /** Restrict to a single giver planet (matches {@link MissionCompletedEvent.giverPlanetId}). */
  giverPlanetId?: string
  /** Authored summary shown on the step's flavor message subject. */
  subject: string
  /** Authored body paragraphs for the step's flavor message. */
  flavor: string[]
}

/** Step that requires the player to have a specific upgrade at >= minLevel. */
export interface InstallUpgradeStep {
  kind: 'install-upgrade'
  upgradeId: UpgradeId
  minLevel: number
  subject: string
  flavor: string[]
}

/** Step that requires the player to enter orbit at a specific planet. */
export interface VisitPlanetStep {
  kind: 'visit-planet'
  planetId: string
  subject: string
  flavor: string[]
}

/**
 * Step that requires the player to complete the orbital pickup phase of a
 * planetary shuttle mission. Both filters are optional and AND-ed together:
 *   - `giverPlanetId` — the posting station the contract was picked up at
 *     (e.g. `'mars'` for "complete an orbital mission from Mars").
 *   - `targetPlanetId` — the body the orbital minigame runs at (e.g. `'venus'`).
 * Omitting both matches any orbital mission completion.
 */
export interface OrbitalMissionStep {
  kind: 'orbital-mission'
  giverPlanetId?: string
  targetPlanetId?: string
  subject: string
  flavor: string[]
}

/** Event payload emitted when a planetary shuttle orbital pickup completes. */
export interface OrbitalMissionCompletedEvent {
  /** Posting station that issued the contract. */
  giverPlanetId: string
  /** Body the orbital minigame ran at. */
  targetPlanetId: string
}

/** Discriminated union of all supported contract steps. */
export type ContractStep =
  | CompleteMissionsStep
  | InstallUpgradeStep
  | VisitPlanetStep
  | OrbitalMissionStep

/** Reward applied when a contract is completed. */
export type RewardEffect =
  | { type: 'fast-travel'; planetId: string }
  | { type: 'mission-pay-multiplier'; planetId: string; multiplier: number }

/** Static contract definition authored as JSON. */
export interface Contract {
  /** Stable id used for persistence and folder routing. */
  id: string
  /** Folder/sidebar label shown in the mail UI (e.g. `"Space Cowboys, Inc."`). */
  inboxName: string
  /** Sender name applied to all contract messages. */
  from: string
  /** Lore date string applied to all contract messages. */
  sentAt: string
  /** Offer this contract when the message with this id is archived. */
  triggerOnMessageArchived?: string
  /** Offer this contract when the player completes their Nth mission overall. */
  triggerOnMissionCompletedNth?: number
  /** Subject for the offer/intro message. */
  introSubject: string
  /** Body paragraphs for the offer/intro message (rendered above the Accept button). */
  introBody: string[]
  /** Optional voice log for the offer message. */
  introAudioUrl?: string
  /** Ordered list of steps. */
  steps: ContractStep[]
  /** Subject for the contract-completion message. */
  completionSubject: string
  /** Body paragraphs for the contract-completion message. */
  completionBody: string[]
  /** Reward effects applied on completion. */
  rewards: RewardEffect[]
}

/** Lifecycle of a {@link Contract} for one player save. */
export type ContractStatus = 'available' | 'active' | 'completed' | 'declined'

/** Persisted runtime state for one contract for one player save. */
export interface ContractInstance {
  /** Definition id. */
  contractId: string
  /** Lifecycle. */
  status: ContractStatus
  /** Index into `Contract.steps` of the next step to satisfy (0-based). */
  currentStepIndex: number
  /**
   * Per-step counter (length === steps.length). Step is satisfied when
   * `stepCounters[i] >= requiredCount(steps[i])`. Counters only advance
   * for events that occur AFTER the contract is accepted.
   */
  stepCounters: number[]
  /** ISO timestamp set when the offer was created. */
  offeredAt: string | null
  /** ISO timestamp set on `acceptContract`. */
  acceptedAt: string | null
  /** ISO timestamp set when all steps were satisfied. */
  completedAt: string | null
}

/** Persisted contract bundle stored on disk under one localStorage key. */
export interface ContractStoreSnapshot {
  /** Per-contract instance state. */
  instances: Record<string, ContractInstance>
  /** Total mission completions observed since the system was first booted (used by Nth triggers). */
  observedMissionCompletions: number
  /** Schema version for forward-compatible migrations. */
  version: 1
}
