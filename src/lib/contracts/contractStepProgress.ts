/**
 * Shared contract step counting helpers used by {@link ContractSystem} and HUD builders.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-20-contracts-design.md
 */
import type { ContractStep } from './contractTypes'

/**
 * Required completion threshold for the active step counter (`complete-missions`,
 * `trade-goods`, and `collect-drops` use authored counts; everything else is `1`).
 *
 * @param step - Contract step definition at `instance.currentStepIndex`.
 * @returns Units needed before {@link ContractSystem.advanceStep} completes the step.
 */
export function contractStepRequiredCount(step: ContractStep): number {
  if (step.kind === 'complete-missions') return step.count
  if (step.kind === 'trade-goods') return step.count
  if (step.kind === 'collect-drops') return step.count
  return 1
}
