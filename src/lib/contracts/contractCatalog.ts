/**
 * Static catalog of all authored contracts.
 *
 * Loads JSON contract definitions from `src/data/contracts/*.json` and exports
 * them as a flat array. Validates at module-load time that each contract uses
 * exactly one of the legacy `completionSubject/completionBody/rewards` triple
 * or the `completionByOutcome` block (mutually exclusive).
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-contracts-design.md
 */
import jovianSocietyProspection from '@/data/contracts/jovian-society-prospection.json'
import martianMarineCorpsCohort from '@/data/contracts/martian-marine-corps-cohort.json'
import spaceCowboysMarsHq from '@/data/contracts/space-cowboys-mars-hq.json'
import theCinderline from '@/data/contracts/the-cinderline.json'
import uscVenusCertification from '@/data/contracts/usc-venus-certification.json'
import venusianZeppelinTradeLoop from '@/data/contracts/venusian-zeppelin-trade-loop.json'
import type { Contract } from './contractTypes'

/** All authored contracts shipped with the game. */
export const CONTRACT_CATALOG: Contract[] = [
  spaceCowboysMarsHq as Contract,
  uscVenusCertification as Contract,
  martianMarineCorpsCohort as Contract,
  venusianZeppelinTradeLoop as Contract,
  theCinderline as Contract,
  jovianSocietyProspection as Contract,
]

/**
 * Assert each contract uses exactly one completion shape (legacy triple OR
 * `completionByOutcome`, not both, not neither). Throws on misconfiguration so
 * the bug surfaces at module-load instead of at runtime.
 *
 * @param catalog - Catalog to validate.
 */
function validateCatalog(catalog: Contract[]): void {
  for (const contract of catalog) {
    const hasLegacy =
      contract.completionSubject !== undefined &&
      contract.completionBody !== undefined &&
      contract.rewards !== undefined
    const hasByOutcome = contract.completionByOutcome !== undefined
    if (hasLegacy === hasByOutcome) {
      throw new Error(
        `Contract '${contract.id}' must define exactly one of {completionSubject + completionBody + rewards} or {completionByOutcome}.`,
      )
    }
  }
}

validateCatalog(CONTRACT_CATALOG)
