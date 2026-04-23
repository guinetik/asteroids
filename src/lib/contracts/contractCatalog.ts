/**
 * Static catalog of all authored contracts.
 *
 * Loads JSON contract definitions from `src/data/contracts/*.json` and exports them as
 * a flat array. New contracts only require a JSON file and an entry below.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-contracts-design.md
 */
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
]
