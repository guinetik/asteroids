/**
 * App-wide contract runtime wiring.
 *
 * Builds the singleton {@link ContractSystem}, hooks reward effects into
 * {@link PlayerProfile} mutators, and subscribes to message archive events so a
 * `triggerOnMessageArchived` contract is offered the moment its trigger message is
 * dismissed by the player.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-contracts-design.md
 */
import { DevConsole } from '@/lib/devConsole'
import { shipMessageSystem } from '@/lib/messages/runtime'
import { addItem, removeItem, createInventory } from '@/lib/inventory/inventory'
import { loadInventory, saveInventory } from '@/lib/inventory/inventoryStorage'
import {
  addCredits,
  disableGiver,
  loadProfile,
  saveProfile,
  setBodyAccess,
  setMissionPayMultiplier,
  setShuttleBuff,
  setStoryFlag,
  unlockFastTravelPlanet,
} from '@/lib/player/profile'
import {
  CURRENT_PLAYER_UPGRADE_LEVELS,
  ensureUpgradeAtLeast,
  getPlayerUpgradeLevelsSnapshot,
  hydratePlayerUpgradeLevelsFromStorage,
  type UpgradeId,
} from '@/lib/upgrades'
import { CONTRACT_CATALOG } from './contractCatalog'
import {
  ContractSystem,
  type ContractStepCompletedPayload,
  type ContractStepActivatedPayload,
} from './ContractSystem'
import type { Contract, RewardEffect } from './contractTypes'

/** Subscribers notified whenever a contract state mutation occurs. */
const contractChangeListeners = new Set<() => void>()

/** Fired when a `shuttle-upgrade` contract reward actually raised the stored level (not on replay no-ops). */
const contractShuttleUpgradeListeners = new Set<
  (payload: ContractShuttleUpgradeGrantPayload) => void
>()

/** Subscribers notified once per contract that transitions to `completed`. */
const contractCompletedListeners = new Set<(contractId: string) => void>()

/** Subscribers notified when a contract transitions from `available` to `active`. */
const contractAcceptedListeners = new Set<(contractId: string) => void>()

/** Subscribers notified when a contract step crosses its completion threshold. */
const contractStepCompletedListeners = new Set<(payload: ContractStepCompletedPayload) => void>()

/** Subscribers notified when a contract step transitions to current. */
const contractStepActivatedListeners = new Set<(payload: ContractStepActivatedPayload) => void>()

/**
 * Synthetically re-fire `onStepActivated` for every active contract instance's
 * current step. Used by dev console (and could be used as a self-heal
 * mechanism). Each subscriber's handler is called once per active instance —
 * idempotent guards in `MapViewController.handleContractStepActivated` ensure
 * already-staged missions are skipped.
 */
function replayActiveStepActivations(): number {
  let fired = 0
  for (const instance of contractSystem.listInstances()) {
    if (instance.status !== 'active') continue
    const contract = contractSystem.getContract(instance.contractId)
    if (!contract) continue
    const step = contract.steps[instance.currentStepIndex]
    if (!step) continue
    let specialMissionId: string | null = null
    let revealsBody: string | null = null
    if (step.kind === 'complete-missions') {
      specialMissionId = step.specialMissionId ?? null
      revealsBody = step.revealsBody ?? null
    } else if (step.kind === 'choice-mission') {
      specialMissionId = step.specialMissionId ?? null
    }
    const payload: ContractStepActivatedPayload = {
      contractId: contract.id,
      stepIndex: instance.currentStepIndex,
      specialMissionId,
      revealsBody,
    }
    for (const listener of Array.from(contractStepActivatedListeners)) {
      try {
        listener(payload)
      } catch {
        // listeners must not break replay
      }
    }
    fired += 1
  }
  return fired
}

/**
 * Upgrade grant from a completed contract, after `ensureUpgradeAtLeast` has persisted.
 */
export interface ContractShuttleUpgradeGrantPayload {
  /** Catalog upgrade id. */
  upgradeId: UpgradeId
  /** New persisted level. */
  newLevel: number
  /** Contract folder label (e.g. for overlay meta). */
  contractInboxName: string
}

/**
 * Apply a contract reward effect to the persisted player profile. Idempotent:
 * unlocking the same planet twice is a no-op, raising a multiplier never
 * regresses an existing bonus, replaying body-access transitions just rewrites
 * to the same state.
 *
 * @param effect - Reward effect drawn from `Contract.rewards` or
 *   `Contract.completionByOutcome[outcomeId].rewards`.
 * @param contract - Contract that produced this effect (for shuttle-upgrade UI meta).
 */
function applyRewardToProfile(effect: RewardEffect, contract: Contract): void {
  const profile = loadProfile()
  if (!profile) return
  let next = profile
  if (effect.type === 'fast-travel') {
    next = unlockFastTravelPlanet(next, effect.planetId)
  } else if (effect.type === 'mission-pay-multiplier') {
    next = setMissionPayMultiplier(next, effect.planetId, effect.multiplier)
  } else if (effect.type === 'shuttle-upgrade') {
    const leveled = ensureUpgradeAtLeast(effect.upgradeId, effect.minLevel)
    if (leveled) {
      const newLevel = CURRENT_PLAYER_UPGRADE_LEVELS[effect.upgradeId] ?? 0
      const payload: ContractShuttleUpgradeGrantPayload = {
        upgradeId: effect.upgradeId,
        newLevel,
        contractInboxName: contract.inboxName,
      }
      for (const listener of contractShuttleUpgradeListeners) {
        try {
          listener(payload)
        } catch {
          // best-effort; do not break reward application
        }
      }
    }
  } else if (effect.type === 'shuttle-buff') {
    next = setShuttleBuff(next, effect.buffId, effect.multiplier)
  } else if (effect.type === 'disable-giver') {
    next = disableGiver(next, effect.giverId)
  } else if (effect.type === 'set-body-access') {
    next = setBodyAccess(next, effect.bodyId, effect.state)
  } else if (effect.type === 'set-story-flag') {
    next = setStoryFlag(next, effect.flag)
  }
  if (next !== profile) saveProfile(next)
}

/** Singleton contract system bound to the shared message system. */
export const contractSystem = new ContractSystem(CONTRACT_CATALOG, shipMessageSystem, undefined, {
  onContractsChanged: () => {
    for (const listener of contractChangeListeners) {
      try {
        listener()
      } catch {
        // listeners must not break the system; swallow to keep other subscribers alive
      }
    }
  },
  onRewardGranted: (effect, c) => applyRewardToProfile(effect, c),
  onContractCompleted: (id) => {
    const completedContract = CONTRACT_CATALOG.find((c) => c.id === id)
    if (completedContract?.homePlanet) {
      let profile = loadProfile()
      if (profile) {
        profile = unlockFastTravelPlanet(profile, completedContract.homePlanet)
        saveProfile(profile)
      }
    }
    for (const listener of Array.from(contractCompletedListeners)) {
      try {
        listener(id)
      } catch {
        // listeners must not break the system
      }
    }
  },
  onContractAccepted: (id) => {
    for (const listener of Array.from(contractAcceptedListeners)) {
      try {
        listener(id)
      } catch {
        // listeners must not break the system
      }
    }
  },
  onContractStepCompleted: (payload) => {
    payContractStepCredits(payload.creditsReward)
    for (const listener of Array.from(contractStepCompletedListeners)) {
      try {
        listener(payload)
      } catch {
        // listeners must not break the system
      }
    }
  },
  onChoiceOutcomeResolved: (payload) => {
    payContractStepCredits(payload.creditsReward)
  },
  onStepActivated: (payload) => {
    if (payload.revealsBody) {
      const profile = loadProfile()
      if (profile) {
        saveProfile(setBodyAccess(profile, payload.revealsBody, 'unrestricted'))
      }
    }
    for (const listener of Array.from(contractStepActivatedListeners)) {
      try {
        listener(payload)
      } catch {
        // listeners must not break the system
      }
    }
  },
  consumeItemsForDelivery: (itemId, count) => consumeInventoryItems(itemId, count),
  grantItemsForPickup: (itemId, count) => {
    const inv = loadInventory() ?? createInventory()
    const result = addItem(inv, itemId, count)
    if (!result.ok) {
      console.warn(`[contracts] grantItemsForPickup failed: ${result.reason ?? 'unknown reason'}`)
      return
    }
    saveInventory(result.inventory)
  },
  getInstalledUpgradeLevel: (upgradeId) => getInstalledUpgradeLevelForContracts(upgradeId),
  hasOrbitedPlanet: (planetId) => hasOrbitedPlanetForContracts(planetId),
})

/**
 * Look up the player's currently installed level for a shuttle upgrade so
 * the contract engine can passively snap an `install-upgrade` step that
 * the player already satisfies. Reads the in-memory upgrade snapshot
 * (which {@link hydratePlayerUpgradeLevelsFromStorage} keeps in sync with
 * localStorage). Unknown ids return `0` and the engine treats that as
 * "not installed".
 *
 * @param upgradeId - Catalog upgrade id from the active step.
 * @returns Installed level, or `0` when the upgrade is not in the snapshot.
 */
function getInstalledUpgradeLevelForContracts(upgradeId: string): number {
  const snapshot = getPlayerUpgradeLevelsSnapshot()
  return snapshot[upgradeId as UpgradeId] ?? 0
}

/**
 * Check whether the player has previously orbited a body so the contract
 * engine can passively snap a `visit-planet` step that the player has
 * already fulfilled. Reads {@link PlayerProfile.orbitedSolarBodies} from
 * persisted profile state. Returns `false` when the profile is missing
 * (fresh game) or the body has never been orbited.
 *
 * @param planetId - Body id from the active step (e.g. `'mars'`, `'sun'`).
 * @returns `true` when the body has been orbited at least once.
 */
function hasOrbitedPlanetForContracts(planetId: string): boolean {
  const profile = loadProfile()
  if (!profile) return false
  return (profile.orbitedSolarBodies?.[planetId] ?? 0) > 0
}

/**
 * Atomic inventory consumption used by the engine when an active
 * `deliver-items` step's destination orbit fires. Loads the current inventory,
 * attempts a `removeItem`, and persists the new state on success.
 *
 * Returns `false` (and writes nothing) when the inventory is missing, the
 * stack is absent, or the stack has fewer than `count` units. The engine
 * uses the boolean to decide whether to advance the step.
 *
 * @param itemId - Inventory item id to consume.
 * @param count - Units to remove on a successful delivery.
 * @returns Whether the consumption committed.
 */
function consumeInventoryItems(itemId: string, count: number): boolean {
  if (!Number.isFinite(count) || count <= 0) return false
  const inventory = loadInventory()
  if (!inventory) return false
  const result = removeItem(inventory, itemId, count)
  if (!result.ok) return false
  saveInventory(result.inventory)
  return true
}

/**
 * Credit the player's wallet with a contract step payout. Fractional values are
 * preserved end-to-end (USC's `666.69` minimum-wage stipend depends on this).
 *
 * @param amount - Authored CR payout. Skips persistence when not a positive finite number.
 */
function payContractStepCredits(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return
  const profile = loadProfile()
  if (!profile) return
  saveProfile(addCredits(profile, amount))
}

shipMessageSystem.onMessageArchived((id) => {
  contractSystem.notifyMessageArchived(id)
})

// Recovery path: re-apply rewards for any contract that finished in a previous
// session. Reward effects are idempotent so this is a safe no-op for healthy
// profiles, and a self-heal for ones that lost the unlock for any reason.
//
// Must merge localStorage into `CURRENT_PLAYER_UPGRADE_LEVELS` before replay:
// `shuttle-upgrade` rewards call `ensureUpgradeAtLeast` → `saveCurrentPlayerUpgradesToStorage`,
// which persists the *entire* in-memory map. If this module loads before MapView
// (or any other hydrator), defaults would be all zeros and we would wipe LS.
hydratePlayerUpgradeLevelsFromStorage()
contractSystem.replayCompletedRewards()

// Save-migration self-heal: walk every active contract and snap any
// passive-state step the player already satisfies. Catches Cinderline
// instances stuck on the radiation-shielding install-upgrade step from
// before per-contract passive eval landed, and any future variant of
// the same class of bug. Order matters — must run after the upgrade
// snapshot is hydrated so `getInstalledUpgradeLevel` reads real levels,
// and after `replayCompletedRewards` so completed contracts aren't
// touched.
contractSystem.evaluatePassiveStateForActiveContracts()

/**
 * Register a callback fired whenever any contract state changes.
 *
 * @param listener - Callback invoked with no arguments after each mutation.
 * @returns Unsubscribe function. Calling it removes the listener.
 */
export function onContractsChanged(listener: () => void): () => void {
  contractChangeListeners.add(listener)
  return () => contractChangeListeners.delete(listener)
}

/**
 * Subscribe to “contract just granted a shuttle upgrade level” (after persistence).
 * Skipped on `replayCompletedRewards` when the level was already at target.
 *
 * @param listener - Receives the grant payload.
 * @returns Unsubscribe function.
 */
export function onContractShuttleUpgradeGranted(
  listener: (payload: ContractShuttleUpgradeGrantPayload) => void,
): () => void {
  contractShuttleUpgradeListeners.add(listener)
  return () => contractShuttleUpgradeListeners.delete(listener)
}

/**
 * Subscribe to "a contract just finished" (live path + `replayCompletedRewards`).
 *
 * @param listener - Receives the completed contract id.
 * @returns Unsubscribe function.
 */
export function onContractCompleted(listener: (contractId: string) => void): () => void {
  contractCompletedListeners.add(listener)
  return () => contractCompletedListeners.delete(listener)
}

/**
 * Subscribe to "a contract just moved from offered to accepted". Fires only on the
 * live path; startup self-heal for already-accepted contracts is done by the caller
 * iterating `contractSystem.listInstances()`.
 *
 * @param listener - Receives the accepted contract id.
 * @returns Unsubscribe function.
 */
export function onContractAccepted(listener: (contractId: string) => void): () => void {
  contractAcceptedListeners.add(listener)
  return () => contractAcceptedListeners.delete(listener)
}

/**
 * Subscribe to "a contract step just transitioned from incomplete to complete".
 * Fires only on the live path — never during {@link ContractSystem.replayCompletedRewards}.
 * Receivers typically refresh the credits HUD, show a toast, and play the
 * `sfx.money` cue.
 *
 * @param listener - Receives the step-completed payload (contract id, step index, payout).
 * @returns Unsubscribe function.
 */
export function onContractStepCompleted(
  listener: (payload: ContractStepCompletedPayload) => void,
): () => void {
  contractStepCompletedListeners.add(listener)
  return () => contractStepCompletedListeners.delete(listener)
}

/**
 * Subscribe to "a contract step just transitioned to current". Receivers
 * typically auto-activate special missions, refresh active-mission UI, etc.
 *
 * @param listener - Receives the activation payload.
 * @returns Unsubscribe function. Calling it removes the listener.
 */
export function onContractStepActivated(
  listener: (payload: ContractStepActivatedPayload) => void,
): () => void {
  contractStepActivatedListeners.add(listener)
  return () => contractStepActivatedListeners.delete(listener)
}

/**
 * Accept a contract and immediately re-fire `notifyPlanetVisited` and
 * `notifyUpgradeInstalled` for the player's current state. This lets
 * `visit-planet` and `install-upgrade` steps auto-complete when the player
 * already qualifies at acceptance time, while leaving `complete-missions`
 * counters untouched (they only count post-accept missions).
 *
 * @param contractId - Contract id from the catalog.
 * @returns Whether the contract transitioned from `available` to `active`.
 */
export function acceptContractWithRetroEval(contractId: string): boolean {
  const accepted = contractSystem.acceptContract(contractId)
  if (!accepted) return false

  const profile = loadProfile()
  if (!profile) return true

  const visitedKeys = Object.keys(profile.orbitedSolarBodies ?? {}).filter(
    (key) => (profile.orbitedSolarBodies?.[key] ?? 0) > 0,
  )
  for (const planetId of visitedKeys) {
    contractSystem.notifyPlanetVisited(planetId)
  }

  const upgradeLevels = getPlayerUpgradeLevelsSnapshot()
  for (const [upgradeId, level] of Object.entries(upgradeLevels) as Array<[UpgradeId, number]>) {
    if (level > 0) contractSystem.notifyUpgradeInstalled(upgradeId, level)
  }

  return true
}

/**
 * Dev console hooks for the contract system. Registered under
 * `AsteroidDev.Contracts` via the shared {@link DevConsole}. Available only
 * in DEV builds.
 *
 * Examples:
 * ```js
 * AsteroidDev.Contracts.forceOffer('jovian-society-prospection')
 * AsteroidDev.Contracts.forceAccept('jovian-society-prospection')
 * AsteroidDev.Contracts.resolveChoice('jovian_final_prospectus', 'transmit')
 * AsteroidDev.Contracts.listInstances()
 * ```
 */
DevConsole.register('Contracts', {
  /**
   * Bypass `offerWhenPrerequisites` and force a contract into the `available`
   * state so its intro message arrives in the inbox.
   *
   * @param contractId - Contract id from `CONTRACT_CATALOG`.
   */
  forceOffer: (contractId: string) => {
    contractSystem.offerForTests(contractId)
    return contractSystem.getInstance(contractId)
  },
  /**
   * Force-accept a contract. If it isn't already offered, offers it first.
   * Useful for skipping the inbox-accept click during dev playthroughs.
   *
   * @param contractId - Contract id from `CONTRACT_CATALOG`.
   */
  forceAccept: (contractId: string) => {
    if (!contractSystem.getInstance(contractId)) {
      contractSystem.offerForTests(contractId)
    }
    contractSystem.acceptContract(contractId)
    return contractSystem.getInstance(contractId)
  },
  /**
   * Resolve a `'choice-mission'` step by hand. Plan 6 will replace this with
   * the prospectus terminal canvas overlay.
   *
   * @param missionId - Choice-mission id (e.g. `'jovian_final_prospectus'`).
   * @param outcomeId - Selected outcome id (e.g. `'transmit'` or `'tamper'`).
   */
  resolveChoice: (missionId: string, outcomeId: string) =>
    contractSystem.notifyChoiceResolved(missionId, outcomeId),
  /**
   * Force-advance the active contract's current step (bypasses every matcher).
   * Cascades — passive auto-snap and `onStepActivated` hooks fire normally as
   * the contract walks forward. Run repeatedly to skip multiple steps.
   *
   * @param contractId - Contract id from `CONTRACT_CATALOG`.
   */
  advanceStep: (contractId: string) => {
    const ok = contractSystem.advanceStepForTests(contractId)
    return { advanced: ok, instance: contractSystem.getInstance(contractId) }
  },
  /**
   * Re-fire `onStepActivated` for every active contract's current step. Use
   * when the asteroid mission slot is unexpectedly empty (e.g. the original
   * step transition fired while MapViewController was unmounted and the
   * mount-time self-heal didn't run for some reason).
   *
   * @returns Number of activation payloads dispatched (one per active instance).
   */
  restageActive: () => replayActiveStepActivations(),
  /** Snapshot every contract instance for debugging. */
  listInstances: () => contractSystem.listInstances(),
  /** Look up a single contract instance by id. */
  getInstance: (contractId: string) => contractSystem.getInstance(contractId),
})
