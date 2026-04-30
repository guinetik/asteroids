/**
 * Helper to derive contract-driven constraints for asteroid mission generation.
 *
 * The mission board generator picks templates randomly from the eligible pool.
 * When a contract has an active step that filters on `giverId` and/or
 * `objectiveType` for asteroid missions, the random pick frequently fails to
 * satisfy the step — the player ends up with a board that can't advance the
 * contract. This helper looks at currently-active contracts and returns the
 * constraints (if any) the board generator should respect when drafting at a
 * specific planet.
 *
 * Steps that carry `specialMissionId` are deliberately excluded — special
 * missions are auto-staged via `MapViewController.handleContractStepActivated`
 * and bypass the random board generator entirely.
 *
 * @author guinetik
 * @date 2026-04-29
 * @spec docs/superpowers/plans/2026-04-29-contract-aware-asteroid-mission-bias.md
 */
import type { ContractSystem } from './ContractSystem'

/** Constraints derived from an active contract step's filter shape. */
export interface AsteroidContractConstraints {
  /** Required giver id (matches `MissionCompletedEvent.giverId`). */
  giverId?: string
  /** Required objective type (matches `MissionCompletedEvent.objectiveType`). */
  objectiveType?: string
}

/**
 * Walk active contract instances, find the first whose current step is a
 * `complete-missions` step with `missionType: 'asteroid'` that could be
 * satisfied at this planet, and return its constraints. Steps with
 * `specialMissionId` are skipped (those are auto-staged elsewhere).
 *
 * @param contracts - Live contract system (read-only access).
 * @param planetId - Host planet id where a mission is about to be drafted.
 * @returns Constraints to pass into the generator, or `null` if no active
 *   step needs biased generation at this planet.
 */
export function getActiveAsteroidContractConstraints(
  contracts: ContractSystem,
  planetId: string,
): AsteroidContractConstraints | null {
  for (const instance of contracts.listInstances()) {
    if (instance.status !== 'active') continue
    const contract = contracts.getContract(instance.contractId)
    if (!contract) continue
    const step = contract.steps[instance.currentStepIndex]
    if (!step || step.kind !== 'complete-missions') continue
    if (step.missionType !== 'asteroid') continue
    if (step.specialMissionId !== undefined) continue
    if (step.giverPlanetId !== undefined && step.giverPlanetId !== planetId) continue
    if (step.giverId === undefined && step.objectiveType === undefined) continue
    return {
      giverId: step.giverId,
      objectiveType: step.objectiveType,
    }
  }
  return null
}
