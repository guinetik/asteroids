/**
 * Builds read-only HUD rows for active contracts on the solar map.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-20-contracts-design.md
 */
import type { Contract, ContractInstance } from './contractTypes'
import { contractStepRequiredCount } from './contractStepProgress'
import { formatContractStepLabel } from './contractStepLabel'

/**
 * One active contract summarized for the solar-map contract HUD panel.
 */
export interface ActiveContractHudRow {
  /** Contract folder id / persistence key. */
  contractId: string
  /** Mail sidebar label (e.g. sender org name). */
  inboxName: string
  /** Live step index matching {@link ContractInstance.currentStepIndex}. */
  currentStepIndex: number
  /** Authored subject line for the current step flavor message. */
  objectiveSubject: string
  /**
   * Imperative one-liner action label for the current step (e.g.
   * "Complete 1 asteroid mission for jovian-society from jupiter"). Same
   * wording the briefing card lists per step — mirrored here so the HUD and
   * mail reader can show it without re-formatting from the step union.
   */
  objectiveSummary: string
  /** Progress numerator clamped to the step threshold. */
  progressCurrent: number
  /** Progress denominator from {@link contractStepRequiredCount}. */
  progressRequired: number
}

/**
 * Lists every accepted (`active`) contract that still has a defined current step,
 * sorted by `contractId` for stable HUD ordering.
 *
 * @param instances - Typically {@link ContractSystem.listInstances}.
 * @param getContract - Resolver for definitions (orphan instances are skipped).
 * @returns Rows suitable for Vue bindings; empty when none qualify.
 */
export function buildActiveContractHudRows(
  instances: readonly ContractInstance[],
  getContract: (id: string) => Contract | null,
): ActiveContractHudRow[] {
  const rows: ActiveContractHudRow[] = []
  for (const instance of instances) {
    if (instance.status !== 'active') continue
    const contract = getContract(instance.contractId)
    if (!contract) continue
    const step = contract.steps[instance.currentStepIndex]
    if (!step) continue
    const idx = instance.currentStepIndex
    const progressRequired = contractStepRequiredCount(step)
    const raw = instance.stepCounters[idx] ?? 0
    const progressCurrent = Math.min(progressRequired, Math.max(0, raw))
    rows.push({
      contractId: contract.id,
      inboxName: contract.inboxName,
      currentStepIndex: idx,
      objectiveSubject: step.subject,
      objectiveSummary: formatContractStepLabel(step),
      progressCurrent,
      progressRequired,
    })
  }
  rows.sort((a, b) => a.contractId.localeCompare(b.contractId))
  return rows
}
