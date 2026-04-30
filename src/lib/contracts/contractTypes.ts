/**
 * Contract data model types.
 *
 * Contracts are guided multi-step progression arcs delivered as messages
 * in their own per-contract inbox folder. Each step is one of:
 *  - complete-missions:  count missions matching optional filters
 *  - install-upgrade:    have an upgrade installed at >= minLevel
 *  - visit-planet:       enter orbit at a specific planet
 *  - orbital-mission:    complete a planetary shuttle mission targeting a planet
 *  - trade-goods:        buy or sell N units of an item at a planet shop
 *  - collect-drops:      collect N units of a dropped inventory item
 *  - launch-from-body:   slingshot-launch out of orbit at a specific body
 *  - deliver-items:      orbit a planet to consume N units of an item from inventory
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
  /** Which mission family completed (e.g. turret mining = `mining`). */
  kind: ContractMissionType
  /** Planet id that issued the mission (for shuttle/eva) or the asteroid's home planet (asteroid). */
  giverPlanetId: string | null
  /** Optional giver id (e.g. `jay` for Jay's mission templates). */
  giverId: string | null
  /** For shuttle planetary missions, the planet the mission targets. */
  targetPlanetId: string | null
  /**
   * Objective subtype emitted by the mission session (e.g. `'photometry'`,
   * `'dan'`, `'gather'`, `'mining'`). Asteroid missions emit the primary
   * `objectives[0]?.type`; turret mining emits `'mining'`; planetary shuttle
   * and EVA emissions currently emit `''` (no clear slot type). Contract
   * steps that filter on `objectiveType` will reject events with `''` — to
   * filter on a shuttle/eva slot type, populate the relevant emission site
   * first.
   */
  objectiveType?: string
  /** Optional region tag (e.g. `'jovian-trojans'`). Plan 5 populates and matches. */
  region?: string
  /** Optional pinned-asset ref the mission targets. Plan 4 populates and matches. */
  pinnedAssetRef?: string
  /**
   * Optional special-mission id the completed mission carries (e.g.
   * `'jovian-prospection-hektor-photometry'`). Plan 4 populates from the
   * asteroid mission completion path when the active mission is `kind: 'special'`.
   */
  specialMissionId?: string
}

/**
 * Mixin applied to every {@link ContractStep} variant. Authored CR payout that
 * fires once when the step transitions from incomplete to complete. Fractional
 * values (e.g. `666.69`) are preserved end-to-end — payout uses
 * `addCredits` directly, not the rounding {@link MapViewController.giveCredits}.
 */
export interface ContractStepRewardMixin {
  /** CR paid the moment this step transitions from incomplete to complete (default 0). */
  creditsReward?: number
}

/** Step that requires N completed missions matching optional filters. */
export interface CompleteMissionsStep extends ContractStepRewardMixin {
  kind: 'complete-missions'
  /** Total missions of the matching kind required to mark the step complete. */
  count: number
  /** Restrict to a single mission family. */
  missionType?: ContractMissionType
  /** Restrict to a single giver id (matches {@link MissionCompletedEvent.giverId}). */
  giverId?: string
  /** Restrict to a single giver planet (matches {@link MissionCompletedEvent.giverPlanetId}). */
  giverPlanetId?: string
  /**
   * Restrict to a single objective type (e.g. `'photometry'`, `'dan'`, `'gather'`).
   * Honored by the matcher — only events with matching `objectiveType` advance.
   */
  objectiveType?: string
  /**
   * Restrict to missions spawned in this region (e.g. `'saturn-trojans'`).
   * Honored by the matcher — only events whose `region` matches advance.
   */
  targetRegion?: string
  /**
   * Restrict to missions targeting the contract's pinned body with this ref.
   * Honored by the matcher — only events with the matching `pinnedAssetRef` advance.
   */
  pinnedAssetRef?: string
  /**
   * When set, step activation auto-activates a specific entry from
   * `SPECIAL_MISSIONS`. Plan 4 wires the activation; this plan stores the
   * field.
   */
  specialMissionId?: string
  /**
   * When set, step activation flips `bodyAccess[revealsBody]` to
   * `'unrestricted'` so a pinned body becomes visible and orbit-able. Plan 4
   * wires the activation; this plan stores the field.
   */
  revealsBody?: string
  /** Authored summary shown on the step's flavor message subject. */
  subject: string
  /** Authored body paragraphs for the step's flavor message. */
  flavor: string[]
}

/** Step that requires the player to have a specific upgrade at >= minLevel. */
export interface InstallUpgradeStep extends ContractStepRewardMixin {
  kind: 'install-upgrade'
  upgradeId: UpgradeId
  minLevel: number
  subject: string
  flavor: string[]
}

/** Step that requires the player to enter orbit at a specific planet. */
export interface VisitPlanetStep extends ContractStepRewardMixin {
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
export interface OrbitalMissionStep extends ContractStepRewardMixin {
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

/** Trade action kind tracked by contract trade-loop steps. */
export type ContractTradeAction = 'buy' | 'sell'

/**
 * Step that requires buying or selling N units of a specific trade good at a
 * specific planet shop.
 */
export interface TradeGoodsStep extends ContractStepRewardMixin {
  /** Buy (`'buy'`) or sell (`'sell'`) action required. */
  kind: 'trade-goods'
  /** Required shop action. */
  action: ContractTradeAction
  /** Planet where the transaction must happen (e.g. `'venus'`). */
  planetId: string
  /** Trade-good id from `src/data/shop/trade-goods.json`. */
  itemId: string
  /** Required total units across matching transactions. */
  count: number
  /** Authored summary shown on the step's flavor message subject. */
  subject: string
  /** Authored body paragraphs for the step's flavor message. */
  flavor: string[]
}

/** Event payload emitted when a trade-shop transaction completes successfully. */
export interface TradeTransactionEvent {
  /** Which action happened. */
  action: ContractTradeAction
  /** Planet where the transaction occurred. */
  planetId: string
  /** Trade-good id bought or sold. */
  itemId: string
  /** Quantity transacted (units). */
  quantity: number
}

/**
 * Step that requires the player to collect N units of a specific dropped item
 * (e.g. viroid psychosphere harvested from FPS-level kills). Counter advances
 * by `event.quantity` per pickup; step satisfies when `>= count`.
 */
export interface CollectDropsStep extends ContractStepRewardMixin {
  /** Discriminator. */
  kind: 'collect-drops'
  /** Inventory item id from `src/data/inventory/items.json` (e.g. `'viroid-psychosphere'`). */
  itemId: string
  /** Required total units to collect after the step becomes active. */
  count: number
  /** Authored summary shown on the step's flavor message subject. */
  subject: string
  /** Authored body paragraphs for the step's flavor message. */
  flavor: string[]
}

/**
 * Step that requires the player to slingshot-launch out of orbit at a specific
 * body (e.g. break solar orbit at the Sun). Matches by `planetId`.
 */
export interface LaunchFromBodyStep extends ContractStepRewardMixin {
  /** Discriminator. */
  kind: 'launch-from-body'
  /** Body id the launch must originate from (e.g. `'sun'`, `'mercury'`). */
  planetId: string
  /** Authored summary shown on the step's flavor message subject. */
  subject: string
  /** Authored body paragraphs for the step's flavor message. */
  flavor: string[]
}

/**
 * Step that requires the player to **deliver** N units of an inventory item to
 * a specific planet. Trigger is the existing planet-visit signal: when the
 * player establishes orbit at `planetId` while this step is active, the engine
 * asks the host (via {@link ContractSystemHooks.consumeItemsForDelivery}) to
 * remove `count` units of `itemId` from the player's inventory. If the host
 * confirms the consumption (i.e. inventory had enough), the step advances and
 * the next flavor message arrives. If not, the step stays pending — the player
 * gathers more and tries again on their next orbit.
 *
 * This is the explicit "turn-in" counterpart to {@link CollectDropsStep}: that
 * step counts pickups; this one consumes them at a destination.
 */
export interface DeliverItemsStep extends ContractStepRewardMixin {
  /** Discriminator. */
  kind: 'deliver-items'
  /** Planet id where delivery must take place (matches the orbit event). */
  planetId: string
  /** Inventory item id from `src/data/inventory/items.json`. */
  itemId: string
  /** Required units to consume from inventory on a successful delivery. */
  count: number
  /** Authored summary shown on the step's flavor message subject. */
  subject: string
  /** Authored body paragraphs for the step's flavor message. */
  flavor: string[]
}

/** Event payload emitted when the player collects a drop pickup in the FPS layer. */
export interface DropCollectedEvent {
  /** Inventory item id that was picked up (matches {@link CollectDropsStep.itemId}). */
  itemId: string
  /** Units gained on this pickup (typically 1). */
  quantity: number
}

/** Event payload emitted when the player slingshot-launches out of orbit at a body. */
export interface OrbitalLaunchEvent {
  /** Body id the launch originated from (e.g. `'sun'`). */
  planetId: string
}

/** Outcome option presented to the player at a choice-mission terminal. */
export interface ChoiceMissionOutcome extends ContractStepRewardMixin {
  /** Stable id (e.g. `'transmit'`, `'tamper'`). */
  outcomeId: string
  /** Display label (e.g. `'Transmit Report'`). */
  label: string
}

/**
 * Step that requires the player to pick one of N authored outcomes at a special
 * mission. This plan resolves it via a dev picker; later plans wire the actual
 * canvas overlay. Per-outcome `creditsReward` is paid when the choice resolves.
 */
export interface ChoiceMissionStep {
  /** Discriminator. */
  kind: 'choice-mission'
  /** Mission id presented to the choice-mission runner. */
  missionId: string
  /** Authored kind name for the runner (e.g. `'terminal-prospectus'`). */
  minigameType: string
  /** Asset ref the choice-mission spawns at (matches `Contract.pinnedAssets[].assetRef`). */
  pinnedAssetRef?: string
  /**
   * Special asteroid mission id that auto-stages on step activation. The
   * mission's objective spawns the terminal POI in `/level`; the overlay's
   * resolve callback fires `notifyChoiceResolved`.
   */
  specialMissionId?: string
  /** Authored outcomes; one is selected by the player. */
  outcomes: ChoiceMissionOutcome[]
  /** Authored summary for the step's flavor message subject. */
  subject: string
  /** Authored body paragraphs for the step's flavor message. */
  flavor: string[]
}

/** Discriminated union of all supported contract steps. */
export type ContractStep =
  | CompleteMissionsStep
  | InstallUpgradeStep
  | VisitPlanetStep
  | OrbitalMissionStep
  | TradeGoodsStep
  | CollectDropsStep
  | LaunchFromBodyStep
  | DeliverItemsStep
  | ChoiceMissionStep

/** Reward applied when a contract is completed. */
export type RewardEffect =
  | { type: 'fast-travel'; planetId: string }
  | { type: 'mission-pay-multiplier'; planetId: string; multiplier: number }
  | { type: 'shuttle-upgrade'; upgradeId: UpgradeId; minLevel: number }
  | { type: 'shuttle-buff'; buffId: string; multiplier: number }
  | { type: 'disable-giver'; giverId: string }
  | {
      type: 'set-body-access'
      bodyId: string
      state: 'restricted' | 'unrestricted' | 'liberated' | 'destroyed'
    }

/**
 * Body the contract pins for its duration. Plan 2 stores; later plans route
 * mission generation to it.
 */
export interface PinnedAsset {
  /** Stable ref used by step `pinnedAssetRef` lookups (e.g. `'hektor'`). */
  assetRef: string
  /** Region the body lives in (e.g. `'jovian-trojans'`). */
  region: string
  /** Display label for inbox flavor and asset cards (e.g. `'Asset 2306-J'`). */
  label: string
}

/** One completion arm per outcome id of a contained `'choice-mission'` step. */
export interface ContractCompletionArm {
  /** Subject line for this outcome's completion message. */
  completionSubject: string
  /** Body paragraphs for this outcome's completion message. */
  completionBody: string[]
  /** Reward effects applied when this arm resolves. */
  rewards: RewardEffect[]
}

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
  /** Offer this contract when the player completes their Nth mission overall (any family). */
  triggerOnMissionCompletedNth?: number
  /**
   * Offer when the player completes their Nth mission of a specific family
   * (e.g. first asteroid: `{ n: 1, missionType: "asteroid" }`). Mutually useful
   * with but independent from {@link triggerOnMissionCompletedNth}.
   */
  triggerOnMissionOfKind?: { n: number; missionType: ContractMissionType }
  /** Offer this contract when the player first enters orbit at this planet id. */
  triggerOnPlanetVisited?: string
  /**
   * Combined offer gate. The runtime AND-s every present sub-field. Authoring
   * just one of these fields makes the gate degenerate to a single check.
   */
  offerWhenPrerequisites?: {
    /** Optional — id of a contract the player must have finished. */
    requiredCompletedContractId?: string
    /** Optional — giver-planet completion gate (legacy combined gate). */
    minGiverPlanetCompletions?: { planetId: string; min: number }
    /** Optional — fires when the player orbits this planet, with all other gates met. */
    triggerOnPlanetVisited?: string
  }
  /**
   * When set, {@link ContractSystem} enqueues this catalog id into the main inbox
   * when the contract is first offered, before the offer intro. Use for “Jay nudge”
   * style messages so the player has a default-folder prompt to open mail.
   */
  headsUpInboxMessageId?: string
  /** Bodies pinned at acceptance. Empty/absent for non-pinning contracts. */
  pinnedAssets?: PinnedAsset[]
  /** Subject for the offer/intro message. */
  introSubject: string
  /** Body paragraphs for the offer/intro message (rendered above the Accept button). */
  introBody: string[]
  /** Optional voice log for the offer message. */
  introAudioUrl?: string
  /** Ordered list of steps. */
  steps: ContractStep[]
  /** Subject for the contract-completion message (legacy single-arm). */
  completionSubject?: string
  /** Body paragraphs for the contract-completion message (legacy single-arm). */
  completionBody?: string[]
  /** Reward effects applied on completion (legacy single-arm). */
  rewards?: RewardEffect[]
  /**
   * Mutually exclusive with the legacy `completionSubject / completionBody / rewards`
   * triple. When present, the completion handler reads
   * `instance.resolvedOutcomeId` and dispatches the matching arm. When neither
   * block resolves, the contract still completes but emits no rewards and a
   * console warning.
   */
  completionByOutcome?: Record<string, ContractCompletionArm>
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
   * `stepCounters[i] >= contractStepRequiredCount(steps[i])`. Counters only advance
   * for events that occur AFTER the contract is accepted.
   */
  stepCounters: number[]
  /** ISO timestamp set when the offer was created. */
  offeredAt: string | null
  /** ISO timestamp set on `acceptContract`. */
  acceptedAt: string | null
  /** ISO timestamp set when all steps were satisfied. */
  completedAt: string | null
  /**
   * Outcome id resolved by a `'choice-mission'` step, or `null` if none has
   * resolved yet. Read by the completion handler to dispatch the matching
   * `completionByOutcome` arm.
   */
  resolvedOutcomeId: string | null
}

/** Persisted contract bundle stored on disk under one localStorage key. */
export interface ContractStoreSnapshot {
  /** Per-contract instance state. */
  instances: Record<string, ContractInstance>
  /** Total mission completions observed since the system was first booted (used by Nth triggers). */
  observedMissionCompletions: number
  /**
   * Count of completed missions whose `giverPlanetId` was each planet
   * (e.g. shuttle / EVA / turret posted from that world). Drives
   * `offerWhenPrerequisites` checks.
   */
  giverPlanetCompletions: Record<string, number>
  /**
   * Total completions per {@link ContractMissionType} (used by
   * `triggerOnMissionOfKind` and for diagnostics).
   */
  missionCompletionsByKind: Partial<Record<ContractMissionType, number>>
  /**
   * Planet ids the player has orbited at least once since the contract system
   * started observing. Drives `offerWhenPrerequisites.triggerOnPlanetVisited`.
   */
  visitedPlanetIds?: Record<string, true>
  /** Schema version for forward-compatible migrations. */
  version: 1
}
