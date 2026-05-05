/**
 * Walkthrough tests for the ceres-institute-eternal-biology contract: schema
 * parses, end-to-end walkability with stub events for both arms, and per-outcome
 * reward dispatch.
 *
 * @author guinetik
 * @date 2026-05-04
 * @spec docs/superpowers/specs/2026-05-04-ceres-institute-contract-design.md
 */
import { describe, expect, it } from 'vitest'
import { MessageSystem } from '@/lib/messages/messageSystem'
import ceresRaw from '@/data/contracts/ceres-institute-eternal-biology.json'
import ceresArchiveBunker from '@/data/missions/ceres-institute-archive-bunker.json'
import { ContractSystem } from '../ContractSystem'
import { emptyContractSnapshot } from '../contractStorage'
import type {
  ChoiceMissionStep,
  Contract,
  ContractStoreSnapshot,
  MissionCompletedEvent,
  RewardEffect,
} from '../contractTypes'

const ceres = ceresRaw as Contract

function emptyMessageStore() {
  return { load: () => ({}), save: () => undefined }
}

function inMemoryPersistence(): {
  load: () => ContractStoreSnapshot
  save: (snap: ContractStoreSnapshot) => void
} {
  let snap = emptyContractSnapshot()
  return { load: () => snap, save: (next) => (snap = next) }
}

const earthSupplyEvent: MissionCompletedEvent = {
  kind: 'shuttle',
  giverPlanetId: 'ceres',
  giverId: 'ceres-institute',
  targetPlanetId: 'earth',
  objectiveType: '',
  specialMissionId: 'ceres-institute-earth-supplies',
}

const rescue1Event: MissionCompletedEvent = {
  kind: 'asteroid',
  giverPlanetId: 'ceres',
  giverId: 'ceres-institute',
  targetPlanetId: null,
  objectiveType: 'rescue',
  specialMissionId: 'ceres-institute-rescue-1',
}

const mineralEvent: MissionCompletedEvent = {
  kind: 'asteroid',
  giverPlanetId: 'ceres',
  giverId: 'ceres-institute',
  targetPlanetId: null,
  objectiveType: 'mineral-analysis',
  specialMissionId: 'ceres-institute-mineral-analysis',
}

const danEvent: MissionCompletedEvent = {
  kind: 'asteroid',
  giverPlanetId: 'ceres',
  giverId: 'ceres-institute',
  targetPlanetId: null,
  objectiveType: 'dan',
  specialMissionId: 'ceres-institute-dan',
}

const rescue2Event: MissionCompletedEvent = {
  kind: 'asteroid',
  giverPlanetId: 'ceres',
  giverId: 'ceres-institute',
  targetPlanetId: null,
  objectiveType: 'rescue',
  specialMissionId: 'ceres-institute-rescue-2',
}

describe('ceres-institute-eternal-biology schema', () => {
  it('parses with 6 steps, completionByOutcome, pinnedAssets, requiredUpgrades', () => {
    expect(ceres.id).toBe('ceres-institute-eternal-biology')
    expect(ceres.steps.length).toBe(6) // TODO(plan): becomes 10 in Task 11
    expect(ceres.completionByOutcome).toBeTruthy()
    expect(ceres.completionByOutcome?.transmit).toBeTruthy()
    expect(ceres.completionByOutcome?.sabotage).toBeTruthy()
    expect(ceres.pinnedAssets?.[0]?.assetRef).toBe('ceres-archive-site')
    expect(ceres.offerWhenPrerequisites?.requiredUpgrades?.length).toBe(2)
    expect(ceres.homePlanet).toBe('ceres')
  })

  it('step 6 is a choice-mission with transmit/sabotage outcomes', () => {
    const step = ceres.steps[5] as ChoiceMissionStep
    expect(step.kind).toBe('choice-mission')
    expect(step.outcomes.map((o) => o.outcomeId)).toEqual(['transmit', 'sabotage'])
    expect(step.specialMissionId).toBe('ceres-institute-archive-bunker')
  })

  it('step credits sum to 33,000 across the five non-choice steps (46,000 total includes the 13,000 outcome)', () => {
    const sum = ceres.steps
      .slice(0, 5)
      .reduce((acc, step) => acc + ('creditsReward' in step ? (step.creditsReward ?? 0) : 0), 0)
    expect(sum).toBe(33_000)
  })

  it('lists gravitySurfing and orbitalSurfing as required upgrades', () => {
    const ids = ceres.offerWhenPrerequisites?.requiredUpgrades?.map((u) => u.upgradeId)
    expect(ids).toEqual(['gravitySurfing', 'orbitalSurfing'])
  })
})

describe('ceres-institute-archive-bunker mission JSON drift guard', () => {
  it('carries enemyVariant: astronaut-chimera on the bunker objective', () => {
    const bunker = ceresArchiveBunker as {
      objectives: ReadonlyArray<{ type: string; enemyVariant?: string }>
    }
    const bunkerObjective = bunker.objectives.find((o) => o.type === 'bunker')
    expect(bunkerObjective).toBeDefined()
    expect(bunkerObjective?.enemyVariant).toBe('astronaut-chimera')
  })

  it('references the ceres-archive-site asteroid and ceres-institute giver', () => {
    const mission = ceresArchiveBunker as { asteroidId: string; giverId: string }
    expect(mission.asteroidId).toBe('ceres-archive-site')
    expect(mission.giverId).toBe('ceres-institute')
  })
})

describe('ceres-institute-eternal-biology walkability', () => {
  function buildSystem() {
    const messages = new MessageSystem([], emptyMessageStore())
    const granted: RewardEffect[] = []
    const completed: string[] = []
    const credits: number[] = []
    const contracts = new ContractSystem([ceres], messages, inMemoryPersistence(), {
      onRewardGranted: (effect) => granted.push(effect),
      onContractCompleted: (id) => completed.push(id),
      onChoiceOutcomeResolved: (p) => credits.push(p.creditsReward),
      hasOrbitedPlanet: () => true,
    })
    contracts.resetForTests()
    contracts.offerForTests(ceres.id)
    contracts.acceptContract(ceres.id)
    return { contracts, granted, completed, credits }
  }

  function driveToChoice(contracts: ContractSystem) {
    contracts.notifyMissionCompleted(earthSupplyEvent)
    contracts.notifyMissionCompleted(rescue1Event)
    contracts.notifyMissionCompleted(mineralEvent)
    contracts.notifyMissionCompleted(danEvent)
    contracts.notifyMissionCompleted(rescue2Event)
  }

  it('drives transmit arm end-to-end', () => {
    const { contracts, granted, completed, credits } = buildSystem()
    driveToChoice(contracts)
    const inst = contracts.getInstance(ceres.id)
    expect(inst?.currentStepIndex).toBe(5)
    const step = ceres.steps[5] as ChoiceMissionStep
    const ok = contracts.notifyChoiceResolved(step.missionId, 'transmit')
    expect(ok).toBe(true)
    expect(contracts.getInstance(ceres.id)?.status).toBe('completed')
    expect(contracts.getInstance(ceres.id)?.resolvedOutcomeId).toBe('transmit')
    expect(completed).toContain(ceres.id)
    expect(credits).toEqual([13_000])
    const types = granted.map((e) => e.type)
    expect(types).toContain('fast-travel')
    expect(types).toContain('mission-pay-multiplier')
    expect(types).toContain('set-story-flag')
    expect(types).not.toContain('disable-giver')
    const flags = granted
      .filter((e) => e.type === 'set-story-flag')
      .map((e) => (e as { flag: string }).flag)
    expect(flags).toEqual(['ceres-archive-transmitted'])
  })

  it('drives sabotage arm end-to-end with disable-giver and exposed flag', () => {
    const { contracts, granted, credits } = buildSystem()
    driveToChoice(contracts)
    const step = ceres.steps[5] as ChoiceMissionStep
    contracts.notifyChoiceResolved(step.missionId, 'sabotage')
    expect(contracts.getInstance(ceres.id)?.resolvedOutcomeId).toBe('sabotage')
    expect(credits).toEqual([13_000])
    const types = granted.map((e) => e.type)
    expect(types).toContain('disable-giver')
    expect(types).toContain('fast-travel')
    expect(granted.filter((e) => e.type === 'set-story-flag').length).toBe(2)
    expect(types).not.toContain('mission-pay-multiplier')
    const flags = granted
      .filter((e) => e.type === 'set-story-flag')
      .map((e) => (e as { flag: string }).flag)
    expect(flags).toEqual(
      expect.arrayContaining(['ceres-archive-sabotaged', 'ceres-cult-exposed']),
    )
  })
})
