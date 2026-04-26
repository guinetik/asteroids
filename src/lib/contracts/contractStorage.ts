/**
 * localStorage persistence for the contract system.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-contracts-design.md
 */
import type { ContractInstance, ContractStoreSnapshot } from './contractTypes'

/** Versioned localStorage key for persisted contract state. */
export const CONTRACT_STORAGE_KEY = 'asteroid-lander-contracts-v1'

/** Empty snapshot used on first load or when storage is unreadable. */
export function emptyContractSnapshot(): ContractStoreSnapshot {
  return {
    instances: {},
    observedMissionCompletions: 0,
    giverPlanetCompletions: {},
    missionCompletionsByKind: {},
    version: 1,
  }
}

/**
 * Persist the full contract snapshot, replacing any previous value.
 *
 * @param snapshot - Complete snapshot to write.
 */
export function saveContractSnapshot(snapshot: ContractStoreSnapshot): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(CONTRACT_STORAGE_KEY, JSON.stringify(snapshot))
}

/**
 * Load the contract snapshot from disk.
 *
 * @returns Parsed snapshot, or {@link emptyContractSnapshot} when absent or corrupt.
 */
export function loadContractSnapshot(): ContractStoreSnapshot {
  if (typeof localStorage === 'undefined') return emptyContractSnapshot()
  const raw = localStorage.getItem(CONTRACT_STORAGE_KEY)
  if (raw === null) return emptyContractSnapshot()

  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return emptyContractSnapshot()
    }
    const obj = parsed as Partial<ContractStoreSnapshot>
    const instances: Record<string, ContractInstance> =
      obj.instances && typeof obj.instances === 'object' && !Array.isArray(obj.instances)
        ? (obj.instances as Record<string, ContractInstance>)
        : {}
    const observedMissionCompletions =
      typeof obj.observedMissionCompletions === 'number' &&
      Number.isFinite(obj.observedMissionCompletions)
        ? obj.observedMissionCompletions
        : 0
    let giverPlanetCompletions: Record<string, number> = {}
    if (
      obj.giverPlanetCompletions &&
      typeof obj.giverPlanetCompletions === 'object' &&
      !Array.isArray(obj.giverPlanetCompletions)
    ) {
      giverPlanetCompletions = { ...(obj.giverPlanetCompletions as Record<string, number>) }
    }
    let missionCompletionsByKind: Partial<Record<string, number>> = {}
    if (
      obj.missionCompletionsByKind &&
      typeof obj.missionCompletionsByKind === 'object' &&
      !Array.isArray(obj.missionCompletionsByKind)
    ) {
      missionCompletionsByKind = { ...(obj.missionCompletionsByKind as Record<string, number>) }
    }
    return {
      instances,
      observedMissionCompletions,
      giverPlanetCompletions,
      missionCompletionsByKind:
        missionCompletionsByKind as ContractStoreSnapshot['missionCompletionsByKind'],
      version: 1,
    }
  } catch {
    return emptyContractSnapshot()
  }
}
