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
import { shipMessageSystem } from '@/lib/messages/runtime'
import {
  loadProfile,
  saveProfile,
  setMissionPayMultiplier,
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
import { ContractSystem } from './ContractSystem'
import type { Contract, RewardEffect } from './contractTypes'

/** Subscribers notified whenever a contract state mutation occurs. */
const contractChangeListeners = new Set<() => void>()

/** Fired when a `shuttle-upgrade` contract reward actually raised the stored level (not on replay no-ops). */
const contractShuttleUpgradeListeners = new Set<(payload: ContractShuttleUpgradeGrantPayload) => void>()

/** Subscribers notified once per contract that transitions to `completed`. */
const contractCompletedListeners = new Set<(contractId: string) => void>()

/** Subscribers notified when a contract transitions from `available` to `active`. */
const contractAcceptedListeners = new Set<(contractId: string) => void>()

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
 * regresses an existing bonus.
 *
 * @param effect - Reward effect drawn from `Contract.rewards`.
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
  }
  if (next !== profile) saveProfile(next)
}

/** Singleton contract system bound to the shared message system. */
export const contractSystem = new ContractSystem(
  CONTRACT_CATALOG,
  shipMessageSystem,
  undefined,
  {
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
  },
)

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
