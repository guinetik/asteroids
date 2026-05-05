/**
 * One-liner objective summary for a contract step (e.g. "Complete 1 asteroid
 * mission for jovian-society from jupiter"). Shared by the briefing card, the
 * mail reader, and the solar-map contract HUD so the same wording surfaces in
 * every place the player reads a step.
 *
 * @author guinetik
 * @date 2026-05-04
 * @spec docs/superpowers/specs/2026-04-20-contracts-design.md
 */
import type { ContractStep } from './contractTypes'

/**
 * Returns a human-readable imperative summary of `step` (e.g. "Buy 5 zeppelin-fuel at venus").
 *
 * @param step - Any contract step variant.
 * @returns Single-line action sentence; never empty.
 */
export function formatContractStepLabel(step: ContractStep): string {
  // Authored flavor label takes precedence so contracts can hide
  // planet/mission ids from the player when the storyline depends on
  // discovery (e.g. the Finch detective arc).
  if ('briefingLabel' in step && typeof step.briefingLabel === 'string' && step.briefingLabel) {
    return step.briefingLabel
  }
  if (step.kind === 'complete-missions') {
    const filterBits: string[] = []
    filterBits.push(step.missionType ? `${step.missionType} mission` : 'mission')
    if (step.giverId) filterBits.push(`for ${step.giverId}`)
    if (step.giverPlanetId) filterBits.push(`from ${step.giverPlanetId}`)
    const filterLabel = filterBits.join(' ')
    return `Complete ${step.count} ${filterLabel}${step.count === 1 ? '' : 's'}`
  }
  if (step.kind === 'install-upgrade') {
    return `Install ${step.upgradeId} (Lvl ${step.minLevel}+)`
  }
  if (step.kind === 'visit-planet') {
    return `Enter orbit at ${step.planetId}`
  }
  if (step.kind === 'trade-goods') {
    const action = step.action === 'buy' ? 'Buy' : 'Sell'
    return `${action} ${step.count} ${step.itemId} at ${step.planetId}`
  }
  if (step.kind === 'collect-drops') {
    return `Collect ${step.count} ${step.itemId}`
  }
  if (step.kind === 'deliver-items') {
    return `Deliver ${step.count} ${step.itemId} to ${step.planetId}`
  }
  if (step.kind === 'launch-from-body') {
    return `Launch from ${step.planetId}`
  }
  if (step.kind === 'choice-mission') {
    return `Complete Mission: ${step.missionId}`
  }
  if (step.kind === 'pickup-from-asset') {
    return `Take package at ${step.assetRef}`
  }
  if (step.kind === 'deliver-to-asset') {
    return `Deliver at ${step.assetRef}`
  }
  const orbitalBits: string[] = []
  if (step.giverPlanetId) orbitalBits.push(`from ${step.giverPlanetId}`)
  if (step.targetPlanetId) orbitalBits.push(`at ${step.targetPlanetId}`)
  const suffix = orbitalBits.length > 0 ? ` ${orbitalBits.join(' ')}` : ''
  return `Complete an orbital mission${suffix}`
}
