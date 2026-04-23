/**
 * Contract progression engine.
 *
 * Manages the lifecycle of {@link Contract} instances, registers all contract-related
 * messages with the {@link MessageSystem}, and advances step counters in response to
 * gameplay events (mission completions, upgrade installs, planet visits, message
 * archives). Contracts are pure data — see `src/data/contracts/*.json`.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-contracts-design.md
 */
import type { MessageSystem } from '@/lib/messages/messageSystem'
import type { ShipMessageDefinition } from '@/lib/messages/messageTypes'
import type {
  Contract,
  ContractInstance,
  ContractStep,
  ContractStoreSnapshot,
  DropCollectedEvent,
  MissionCompletedEvent,
  OrbitalLaunchEvent,
  OrbitalMissionCompletedEvent,
  RewardEffect,
  TradeTransactionEvent,
} from './contractTypes'
import { emptyContractSnapshot, loadContractSnapshot, saveContractSnapshot } from './contractStorage'

/** Persistence adapter for the contract snapshot; swap in tests. */
export interface ContractPersistence {
  /** Loads the persisted snapshot from disk (or in-memory store in tests). */
  load(): ContractStoreSnapshot
  /** Replaces the stored snapshot. */
  save(snapshot: ContractStoreSnapshot): void
}

/** Optional callbacks for embedding {@link ContractSystem} in a UI shell. */
export interface ContractSystemHooks {
  /**
   * Called whenever a contract instance changes (offered, accepted, advanced, completed,
   * declined). Receivers typically refresh inbox UI and re-evaluate fast-travel buttons.
   */
  onContractsChanged?: () => void
  /**
   * Called for each {@link RewardEffect} when a contract completes. Receivers apply the
   * effect to the player profile (e.g. unlock fast-travel kiosks, set pay multipliers).
   *
   * @param effect - One reward effect from `Contract.rewards`.
   * @param contract - The contract that was completed.
   */
  onRewardGranted?: (effect: RewardEffect, contract: Contract) => void
  /**
   * Called once per contract when its instance transitions into `completed` status,
   * both on the live path and during `replayCompletedRewards`. Receivers typically
   * emit a journey trigger or run post-completion UI cleanup.
   *
   * @param contractId - Id of the contract that just completed.
   */
  onContractCompleted?: (contractId: string) => void
  /**
   * Called once per contract when its instance transitions from `available` to
   * `active` (the player tapped Accept). Receivers typically emit a journey
   * trigger that gates a later arc on explicit buy-in.
   *
   * @param contractId - Id of the contract that was just accepted.
   */
  onContractAccepted?: (contractId: string) => void
  /**
   * Called exactly once per step when its counter first crosses the required
   * threshold during live progression (never during {@link ContractSystem.replayCompletedRewards}).
   * Receivers typically credit the player's wallet with `creditsReward` and
   * surface a UI toast plus an audio cue.
   *
   * @param payload - Identifies the contract + step that just satisfied,
   *   plus the authored CR payout (defaults to `0` when omitted in JSON).
   */
  onContractStepCompleted?: (payload: ContractStepCompletedPayload) => void
}

/** Payload for {@link ContractSystemHooks.onContractStepCompleted}. */
export interface ContractStepCompletedPayload {
  /** Contract whose step just satisfied. */
  contractId: string
  /** Index into `Contract.steps` of the step that just satisfied. */
  stepIndex: number
  /** Authored CR payout for the step (`0` when omitted). Fractional values preserved. */
  creditsReward: number
}

/** Default persistence backed by `loadContractSnapshot`/`saveContractSnapshot`. */
const defaultPersistence: ContractPersistence = {
  load: () => loadContractSnapshot(),
  save: (snapshot) => saveContractSnapshot(snapshot),
}

/** Trigger value applied to all dynamically registered contract messages. */
const CONTRACT_MESSAGE_TRIGGER = 'contract' as const

/** Priority used for contract-driven inbox messages (above tutorial Jay messages). */
const CONTRACT_MESSAGE_PRIORITY = 80

/** Priority used for the pinned active-brief message; sorts above siblings within the pinned group. */
const CONTRACT_BRIEF_PRIORITY = 100

/**
 * Owns contract definitions, persisted instance state, and the event hooks used to
 * advance steps. Holds a reference to the shared {@link MessageSystem} so it can
 * register contract messages and enqueue them as steps unlock.
 */
export class ContractSystem {
  private readonly contracts: Map<string, Contract>
  private readonly messageSystem: MessageSystem
  private readonly persistence: ContractPersistence
  private readonly hooks: ContractSystemHooks
  private snapshot: ContractStoreSnapshot
  private hasReplayedCompletedRewards = false

  /**
   * @param contracts - Static contract catalog.
   * @param messageSystem - Shared message system used to deliver contract messages.
   * @param persistence - Persistence adapter; defaults to localStorage.
   * @param hooks - Optional callbacks for UI sync and reward application.
   */
  constructor(
    contracts: Contract[],
    messageSystem: MessageSystem,
    persistence: ContractPersistence = defaultPersistence,
    hooks: ContractSystemHooks = {},
  ) {
    this.contracts = new Map(contracts.map((contract) => [contract.id, contract]))
    this.messageSystem = messageSystem
    this.persistence = persistence
    this.hooks = hooks
    this.snapshot = persistence.load()

    const definitions: ShipMessageDefinition[] = []
    for (const contract of contracts) {
      definitions.push(...buildContractMessageDefinitions(contract))
    }
    this.messageSystem.registerDefinitions(definitions)
    this.evaluatePrerequisiteContractOffers()
  }

  /**
   * Snapshot of all contract instances (read-only copy).
   *
   * @returns Cloned `instances` map suitable for UI consumption.
   */
  listInstances(): ContractInstance[] {
    return Object.values(this.snapshot.instances).map((entry) => ({ ...entry }))
  }

  /** Lookup a contract definition by id. */
  getContract(id: string): Contract | null {
    return this.contracts.get(id) ?? null
  }

  /** Lookup the persisted instance for a contract id. */
  getInstance(id: string): ContractInstance | null {
    return this.snapshot.instances[id] ?? null
  }

  /**
   * Re-fire `onRewardGranted` and `onContractCompleted` for every contract instance
   * currently in `completed` state. Reward effects and completion listeners are required
   * to be idempotent (`unlockFastTravelPlanet` is a no-op on duplicates, journey step
   * applicators are step-idempotent), so this is safe to call on startup as a recovery
   * path for profiles that lost a reward or need to catch up journey progress.
   *
   * Intended to be called exactly once per runtime session; subsequent calls are no-ops
   * to protect downstream subscribers (staging, UI, analytics) from duplicate events.
   *
   * Persisted instance state is untouched — this only re-applies the side-effects through
   * the registered hooks.
   */
  replayCompletedRewards(): void {
    if (this.hasReplayedCompletedRewards) return
    this.hasReplayedCompletedRewards = true
    for (const instance of Object.values(this.snapshot.instances)) {
      if (instance.status !== 'completed') continue
      const contract = this.contracts.get(instance.contractId)
      if (!contract) continue
      this.applyRewards(contract)
      this.hooks.onContractCompleted?.(contract.id)
    }
  }

  /**
   * Notify the system that a message was archived. If any contract was waiting on
   * this id (`triggerOnMessageArchived`), it transitions to `available` and its
   * intro message is delivered to the contract folder.
   *
   * @param messageId - Id of the just-archived message.
   */
  notifyMessageArchived(messageId: string): void {
    let changed = false
    for (const contract of this.contracts.values()) {
      if (contract.triggerOnMessageArchived !== messageId) continue
      if (this.snapshot.instances[contract.id]) continue
      this.offerContract(contract)
      changed = true
    }
    if (changed) this.afterChange()
  }

  /**
   * Notify the system that a mission of any family completed. Increments the
   * global counter (used by `triggerOnMissionCompletedNth`) and advances any
   * active `complete-missions` steps that match the event filters.
   *
   * @param event - Mission tagging used to match step filters.
   */
  notifyMissionCompleted(event: MissionCompletedEvent): void {
    const nextGiver: Record<string, number> = { ...this.snapshot.giverPlanetCompletions }
    if (event.giverPlanetId) {
      const g = event.giverPlanetId
      nextGiver[g] = (nextGiver[g] ?? 0) + 1
    }
    const prevByKind = this.snapshot.missionCompletionsByKind ?? {}
    const nextByKind: typeof prevByKind = { ...prevByKind }
    nextByKind[event.kind] = (nextByKind[event.kind] ?? 0) + 1
    this.snapshot = {
      ...this.snapshot,
      observedMissionCompletions: this.snapshot.observedMissionCompletions + 1,
      giverPlanetCompletions: nextGiver,
      missionCompletionsByKind: nextByKind,
    }

    let changed = false

    for (const contract of this.contracts.values()) {
      if (contract.triggerOnMissionCompletedNth === undefined) continue
      if (this.snapshot.observedMissionCompletions !== contract.triggerOnMissionCompletedNth) continue
      if (this.snapshot.instances[contract.id]) continue
      this.offerContract(contract)
      changed = true
    }

    for (const contract of this.contracts.values()) {
      const t = contract.triggerOnMissionOfKind
      if (t === undefined) continue
      if (t.missionType !== event.kind) continue
      if ((this.snapshot.missionCompletionsByKind?.[t.missionType] ?? 0) !== t.n) continue
      if (this.snapshot.instances[contract.id]) continue
      this.offerContract(contract)
      changed = true
    }

    for (const instance of Object.values(this.snapshot.instances)) {
      if (instance.status !== 'active') continue
      const contract = this.contracts.get(instance.contractId)
      if (!contract) continue
      const step = contract.steps[instance.currentStepIndex]
      if (!step || step.kind !== 'complete-missions') continue
      if (!matchesMissionEvent(step, event)) continue
      this.advanceStep(contract, instance, 1)
      changed = true
    }

    if (this.evaluatePrerequisiteContractOffers()) {
      changed = true
    }

    this.persist()
    if (changed) this.afterChange()
  }

  /**
   * Notify the system that an upgrade was installed (or its level changed).
   *
   * @param upgradeId - Upgrade id whose level changed.
   * @param newLevel - Current installed level for the upgrade.
   */
  notifyUpgradeInstalled(upgradeId: string, newLevel: number): void {
    let changed = false
    for (const instance of Object.values(this.snapshot.instances)) {
      if (instance.status !== 'active') continue
      const contract = this.contracts.get(instance.contractId)
      if (!contract) continue
      const step = contract.steps[instance.currentStepIndex]
      if (!step || step.kind !== 'install-upgrade') continue
      if (step.upgradeId !== upgradeId) continue
      if (newLevel < step.minLevel) continue
      this.advanceStep(contract, instance, 1)
      changed = true
    }
    if (changed) this.afterChange()
  }

  /**
   * Notify the system that the player entered orbit at a planet (any visit, including repeats).
   *
   * @param planetId - Planet id (e.g. `'mars'`).
   */
  notifyPlanetVisited(planetId: string): void {
    let changed = false
    for (const contract of this.contracts.values()) {
      if (contract.triggerOnPlanetVisited !== planetId) continue
      if (this.snapshot.instances[contract.id]) continue
      this.offerContract(contract)
      changed = true
    }
    for (const instance of Object.values(this.snapshot.instances)) {
      if (instance.status !== 'active') continue
      const contract = this.contracts.get(instance.contractId)
      if (!contract) continue
      const step = contract.steps[instance.currentStepIndex]
      if (!step || step.kind !== 'visit-planet') continue
      if (step.planetId !== planetId) continue
      this.advanceStep(contract, instance, 1)
      changed = true
    }
    if (changed) this.afterChange()
  }

  /**
   * Notify the system that the player completed the orbital pickup phase of a
   * planetary shuttle mission. Both the giver (posting station) and target
   * (orbital body) planet ids are passed so steps can filter on either side.
   *
   * @param event - Giver + target planet ids for the just-completed pickup.
   */
  notifyOrbitalMissionCompleted(event: OrbitalMissionCompletedEvent): void {
    let changed = false
    for (const instance of Object.values(this.snapshot.instances)) {
      if (instance.status !== 'active') continue
      const contract = this.contracts.get(instance.contractId)
      if (!contract) continue
      const step = contract.steps[instance.currentStepIndex]
      if (!step || step.kind !== 'orbital-mission') continue
      if (step.giverPlanetId && step.giverPlanetId !== event.giverPlanetId) continue
      if (step.targetPlanetId && step.targetPlanetId !== event.targetPlanetId) continue
      this.advanceStep(contract, instance, 1)
      changed = true
    }
    if (changed) this.afterChange()
  }

  /**
   * Notify the system that a trade transaction completed in a planetary shop.
   * Advances active `trade-goods` steps that match action, planet, and item id.
   *
   * @param event - Transaction details for the committed buy/sell action.
   */
  notifyTradeTransaction(event: TradeTransactionEvent): void {
    if (event.quantity <= 0) return
    let changed = false
    for (const instance of Object.values(this.snapshot.instances)) {
      if (instance.status !== 'active') continue
      const contract = this.contracts.get(instance.contractId)
      if (!contract) continue
      const step = contract.steps[instance.currentStepIndex]
      if (!step || step.kind !== 'trade-goods') continue
      if (!matchesTradeTransaction(step, event)) continue
      this.advanceStep(contract, instance, event.quantity)
      changed = true
    }
    if (changed) this.afterChange()
  }

  /**
   * Notify the system that the player picked up a dropped item (e.g. viroid
   * psychosphere collected by walking over the pickup mesh in the FPS layer).
   * Advances any active `collect-drops` step whose `itemId` matches.
   *
   * @param event - Item id and units gained on this pickup.
   */
  notifyDropCollected(event: DropCollectedEvent): void {
    if (event.quantity <= 0) return
    let changed = false
    for (const instance of Object.values(this.snapshot.instances)) {
      if (instance.status !== 'active') continue
      const contract = this.contracts.get(instance.contractId)
      if (!contract) continue
      const step = contract.steps[instance.currentStepIndex]
      if (!step || step.kind !== 'collect-drops') continue
      if (step.itemId !== event.itemId) continue
      this.advanceStep(contract, instance, event.quantity)
      changed = true
    }
    if (changed) this.afterChange()
  }

  /**
   * Notify the system that the player slingshot-launched out of orbit at a
   * specific body. Advances active `launch-from-body` steps whose `planetId`
   * matches.
   *
   * @param event - Body id the launch originated from.
   */
  notifyOrbitalLaunched(event: OrbitalLaunchEvent): void {
    let changed = false
    for (const instance of Object.values(this.snapshot.instances)) {
      if (instance.status !== 'active') continue
      const contract = this.contracts.get(instance.contractId)
      if (!contract) continue
      const step = contract.steps[instance.currentStepIndex]
      if (!step || step.kind !== 'launch-from-body') continue
      if (step.planetId !== event.planetId) continue
      this.advanceStep(contract, instance, 1)
      changed = true
    }
    if (changed) this.afterChange()
  }

  /**
   * Player accepted a contract from the mail reader. Transitions to `active`,
   * stamps `acceptedAt`, and delivers the first step's flavor message.
   *
   * @param contractId - Contract to accept.
   * @returns True when the contract was accepted on this call.
   */
  acceptContract(contractId: string): boolean {
    const instance = this.snapshot.instances[contractId]
    if (!instance || instance.status !== 'available') return false

    const contract = this.contracts.get(contractId)
    if (!contract) return false

    const updated: ContractInstance = {
      ...instance,
      status: 'active',
      acceptedAt: new Date().toISOString(),
    }
    this.snapshot = {
      ...this.snapshot,
      instances: { ...this.snapshot.instances, [contractId]: updated },
    }
    this.deliverBriefMessage(contract)
    this.deliverStepMessage(contract, 0)
    this.persist()
    this.hooks.onContractAccepted?.(contractId)
    this.afterChange()
    return true
  }

  /**
   * Player declined a contract. Marks the instance as declined; the intro message
   * stays archived in the inbox folder so the player can revisit the lore.
   *
   * @param contractId - Contract to decline.
   * @returns True when the contract transitioned to declined.
   */
  declineContract(contractId: string): boolean {
    const instance = this.snapshot.instances[contractId]
    if (!instance || instance.status !== 'available') return false

    const updated: ContractInstance = { ...instance, status: 'declined' }
    this.snapshot = {
      ...this.snapshot,
      instances: { ...this.snapshot.instances, [contractId]: updated },
    }
    this.persist()
    this.afterChange()
    return true
  }

  /**
   * Create a new instance for a contract and deliver its intro message.
   *
   * @param contract - Contract to offer.
   */
  private offerContract(contract: Contract): void {
    const instance: ContractInstance = {
      contractId: contract.id,
      status: 'available',
      currentStepIndex: 0,
      stepCounters: contract.steps.map(() => 0),
      offeredAt: new Date().toISOString(),
      acceptedAt: null,
      completedAt: null,
    }
    this.snapshot = {
      ...this.snapshot,
      instances: { ...this.snapshot.instances, [contract.id]: instance },
    }
    if (contract.headsUpInboxMessageId) {
      this.messageSystem.enqueueById(contract.headsUpInboxMessageId)
    }
    this.messageSystem.enqueueById(contractIntroMessageId(contract.id))
    this.persist()
  }

  /**
   * Increment the step counter and either deliver the next step's message or complete
   * the contract when all steps are satisfied.
   *
   * @param contract - Definition for the active instance.
   * @param instance - Mutable snapshot of the instance (caller passes the live entry).
   * @param amount - Counter increment (typically 1).
   */
  private advanceStep(contract: Contract, instance: ContractInstance, amount: number): void {
    const stepIndex = instance.currentStepIndex
    const step = contract.steps[stepIndex]
    if (!step) return
    const required = requiredCount(step)
    const counters = [...instance.stepCounters]
    counters[stepIndex] = Math.min(required, (counters[stepIndex] ?? 0) + amount)

    let updated: ContractInstance = { ...instance, stepCounters: counters }

    if (counters[stepIndex]! >= required) {
      this.hooks.onContractStepCompleted?.({
        contractId: contract.id,
        stepIndex,
        creditsReward: step.creditsReward ?? 0,
      })
      const nextIndex = stepIndex + 1
      if (nextIndex >= contract.steps.length) {
        updated = { ...updated, status: 'completed', completedAt: new Date().toISOString() }
        this.snapshot = {
          ...this.snapshot,
          instances: { ...this.snapshot.instances, [contract.id]: updated },
        }
        this.deliverCompletionMessage(contract)
        this.applyRewards(contract)
        this.hooks.onContractCompleted?.(contract.id)
        this.evaluatePrerequisiteContractOffers()
      } else {
        updated = { ...updated, currentStepIndex: nextIndex }
        this.snapshot = {
          ...this.snapshot,
          instances: { ...this.snapshot.instances, [contract.id]: updated },
        }
        this.deliverStepMessage(contract, nextIndex)
      }
    } else {
      this.snapshot = {
        ...this.snapshot,
        instances: { ...this.snapshot.instances, [contract.id]: updated },
      }
    }

    this.persist()
  }

  /** Deliver a step's flavor message into the contract folder. */
  private deliverStepMessage(contract: Contract, stepIndex: number): void {
    this.messageSystem.enqueueById(contractStepMessageId(contract.id, stepIndex))
  }

  /**
   * Deliver the pinned "active brief" dossier message into the contract folder.
   * Always shows up first in the folder list and renders the live progress card
   * in the reader so the player has a one-click reference for this contract.
   */
  private deliverBriefMessage(contract: Contract): void {
    this.messageSystem.enqueueById(contractBriefMessageId(contract.id))
  }

  /** Deliver the completion message into the contract folder. */
  private deliverCompletionMessage(contract: Contract): void {
    this.messageSystem.enqueueById(contractCompletionMessageId(contract.id))
  }

  /** Fan reward effects out to the registered hook. */
  private applyRewards(contract: Contract): void {
    if (!this.hooks.onRewardGranted) return
    for (const effect of contract.rewards) {
      this.hooks.onRewardGranted(effect, contract)
    }
  }

  /** Persist the current snapshot and notify the change hook. */
  private persist(): void {
    this.persistence.save(this.snapshot)
  }

  /** Notify subscribers that contract state changed. */
  private afterChange(): void {
    this.hooks.onContractsChanged?.()
  }

  /** Reset the in-memory snapshot to empty (used by tests). */
  resetForTests(): void {
    this.snapshot = emptyContractSnapshot()
    this.persistence.save(this.snapshot)
  }

  /**
   * Offer contracts that list {@link Contract.offerWhenPrerequisites} when
   * the required contract is completed and giver-planet mission counts
   * satisfy the minima.
   *
   * @returns True if at least one new contract was offered.
   */
  private evaluatePrerequisiteContractOffers(): boolean {
    let offered = false
    for (const contract of this.contracts.values()) {
      const p = contract.offerWhenPrerequisites
      if (!p) continue
      if (this.snapshot.instances[contract.id]) continue
      const req = p.requiredCompletedContractId
      const pre = this.snapshot.instances[req]
      if (!pre || pre.status !== 'completed') continue
      const { planetId, min: minCount } = p.minGiverPlanetCompletions
      if ((this.snapshot.giverPlanetCompletions[planetId] ?? 0) < minCount) {
        continue
      }
      this.offerContract(contract)
      offered = true
    }
    return offered
  }
}

/** Required completion count for a step (1 unless the step is `complete-missions`). */
function requiredCount(step: ContractStep): number {
  if (step.kind === 'complete-missions') return step.count
  if (step.kind === 'trade-goods') return step.count
  if (step.kind === 'collect-drops') return step.count
  return 1
}

/** True when a `complete-missions` step matches the supplied event filters. */
function matchesMissionEvent(
  step: { missionType?: string; giverId?: string; giverPlanetId?: string },
  event: MissionCompletedEvent,
): boolean {
  if (step.missionType !== undefined && step.missionType !== event.kind) return false
  if (step.giverId !== undefined && step.giverId !== event.giverId) return false
  if (step.giverPlanetId !== undefined && step.giverPlanetId !== event.giverPlanetId) return false
  return true
}

/** True when a `trade-goods` step matches a committed transaction event. */
function matchesTradeTransaction(
  step: { action: string; planetId: string; itemId: string },
  event: TradeTransactionEvent,
): boolean {
  if (step.action !== event.action) return false
  if (step.planetId !== event.planetId) return false
  if (step.itemId !== event.itemId) return false
  return true
}

/** Stable id for a contract's intro/offer message. */
export function contractIntroMessageId(contractId: string): string {
  return `contract.${contractId}.intro`
}

/** Stable id for the pinned active-contract brief shown at the top of the folder. */
export function contractBriefMessageId(contractId: string): string {
  return `contract.${contractId}.brief`
}

/** Stable id for a contract step's flavor message. */
export function contractStepMessageId(contractId: string, stepIndex: number): string {
  return `contract.${contractId}.step.${stepIndex}`
}

/** Stable id for a contract's completion message. */
export function contractCompletionMessageId(contractId: string): string {
  return `contract.${contractId}.completion`
}

/**
 * Build the full set of message definitions for one contract: intro + per-step flavor +
 * completion. All messages share the contract's folder, sender, and date.
 *
 * @param contract - Contract whose messages should be materialized.
 * @returns Array of message definitions to register with the {@link MessageSystem}.
 */
export function buildContractMessageDefinitions(contract: Contract): ShipMessageDefinition[] {
  const base = {
    from: contract.from,
    sentAt: contract.sentAt,
    trigger: CONTRACT_MESSAGE_TRIGGER,
    delivery: 'inbox_prompt' as const,
    priority: CONTRACT_MESSAGE_PRIORITY,
    folderId: contract.id,
    folderLabel: contract.inboxName,
    contractId: contract.id,
  }

  const intro: ShipMessageDefinition = {
    ...base,
    id: contractIntroMessageId(contract.id),
    subject: contract.introSubject,
    body: contract.introBody,
    contractMessageKind: 'intro',
    ...(contract.introAudioUrl ? { audioUrl: contract.introAudioUrl } : {}),
  }

  const brief: ShipMessageDefinition = {
    ...base,
    id: contractBriefMessageId(contract.id),
    subject: `Active Brief — ${contract.inboxName}`,
    body: buildContractBriefBody(contract),
    contractMessageKind: 'brief',
    pinned: true,
    priority: CONTRACT_BRIEF_PRIORITY,
  }

  const stepMessages: ShipMessageDefinition[] = contract.steps.map((step, index) => ({
    ...base,
    id: contractStepMessageId(contract.id, index),
    subject: step.subject,
    body: step.flavor,
    contractMessageKind: 'step',
    contractStepIndex: index,
  }))

  const completion: ShipMessageDefinition = {
    ...base,
    id: contractCompletionMessageId(contract.id),
    subject: contract.completionSubject,
    body: contract.completionBody,
    contractMessageKind: 'completion',
  }

  return [intro, brief, ...stepMessages, completion]
}

/**
 * Build the static body text for a contract's pinned active-brief message. The
 * reader pairs this with the live progress card, so this body acts as a flavor
 * preamble — short and punchy, not a duplicate of the step list.
 *
 * @param contract - Contract whose brief body should be generated.
 */
function buildContractBriefBody(contract: Contract): string[] {
  return [
    `Active contract — ${contract.inboxName}.`,
    'This brief stays pinned at the top of your folder for the duration of the job. Open it any time to review your objectives, see live step progress, and check the reward on completion.',
    'Step flavor messages will arrive as you unlock them. They will live below this brief in this same folder.',
    `— ${contract.from}`,
  ]
}
