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
  ensureUpgradeAtLeast,
  getPlayerUpgradeLevelsSnapshot,
  type UpgradeId,
} from '@/lib/upgrades'
import { CONTRACT_CATALOG } from './contractCatalog'
import { ContractSystem } from './ContractSystem'
import type { RewardEffect } from './contractTypes'

/** Subscribers notified whenever a contract state mutation occurs. */
const contractChangeListeners = new Set<() => void>()

/**
 * Apply a contract reward effect to the persisted player profile. Idempotent:
 * unlocking the same planet twice is a no-op, raising a multiplier never
 * regresses an existing bonus.
 *
 * @param effect - Reward effect drawn from `Contract.rewards`.
 */
function applyRewardToProfile(effect: RewardEffect): void {
  const profile = loadProfile()
  if (!profile) return
  let next = profile
  if (effect.type === 'fast-travel') {
    next = unlockFastTravelPlanet(next, effect.planetId)
  } else if (effect.type === 'mission-pay-multiplier') {
    next = setMissionPayMultiplier(next, effect.planetId, effect.multiplier)
  } else if (effect.type === 'shuttle-upgrade') {
    ensureUpgradeAtLeast(effect.upgradeId, effect.minLevel)
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
    onRewardGranted: (effect) => applyRewardToProfile(effect),
  },
)

shipMessageSystem.onMessageArchived((id) => {
  contractSystem.notifyMessageArchived(id)
})

// Recovery path: re-apply rewards for any contract that finished in a previous
// session. Reward effects are idempotent so this is a safe no-op for healthy
// profiles, and a self-heal for ones that lost the unlock for any reason.
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
