import { describe, expect, it, vi } from 'vitest'
import type { GeneratedAsteroidMission } from '@/lib/missions/types'
import type { Heightmap } from '@/lib/terrain/heightmap'
import type { ProjectileSystem } from '@/lib/fps/projectileSystem'
import type { RockYieldSystem } from '@/lib/mining/rockYieldSystem'
import type { Scene } from 'three'

interface MockBasicMinigame {
  objectiveIndex: number
  status: 'idle'
  isPlayerNearInteraction: boolean
  timeRemaining: null
  progressCurrent: null
  progressTotal: null
  steps: []
  tick: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
  onPrompt: unknown
  onComplete: unknown
  onStepChange: unknown
}

interface MockSurveyMinigame extends MockBasicMinigame {
  onRefuel: unknown
  onRegisterTickable: unknown
  onUnregisterTickable: unknown
  onProbeCollect: unknown
}

interface MockPhotometryMinigame extends MockSurveyMinigame {
  onScanAudioState: unknown
}

interface MockCombatMinigame extends MockBasicMinigame {
  onDamagePlayer: unknown
  onKillPlayer: unknown
  onDestroyLander: null | (() => void)
  onExplosion: null | ((position: { x: number; y: number; z: number }) => void)
  installEnemySpawnObserver: ReturnType<typeof vi.fn>
}

interface MockRescueMinigame extends MockCombatMinigame {
  onFail: unknown
}

const stores = vi.hoisted(() => ({
  surveys: [] as MockSurveyMinigame[],
  photometries: [] as MockPhotometryMinigame[],
  exterminates: [] as MockCombatMinigame[],
  rescues: [] as MockRescueMinigame[],
  collects: [] as MockBasicMinigame[],
  gathers: [] as MockBasicMinigame[],
}))
vi.mock('@/lib/minigame/SurveyMinigame', () => ({
  SurveyMinigame: class {
    onRefuel = null
    onRegisterTickable = null
    onUnregisterTickable = null
    onProbeCollect = null
    onScanAudioState = null
    onPrompt = null
    onComplete = null
    onStepChange = null
    objectiveIndex: number
    status = 'idle' as const
    isPlayerNearInteraction = false
    timeRemaining = null
    progressCurrent = null
    progressTotal = null
    steps: [] = []
    worldColliders = [{ id: 'survey-terminal', kind: 'aabb' as const }]
    tick = vi.fn()
    dispose = vi.fn()

    constructor(objectiveIndex: number) {
      this.objectiveIndex = objectiveIndex
      stores.surveys.push(this)
    }
  },
}))

vi.mock('@/lib/minigame/PhotometryMinigame', () => ({
  PhotometryMinigame: class {
    onRefuel = null
    onRegisterTickable = null
    onUnregisterTickable = null
    onProbeCollect = null
    onScanAudioState = null
    onPrompt = null
    onComplete = null
    onStepChange = null
    objectiveIndex: number
    status = 'idle' as const
    isPlayerNearInteraction = false
    timeRemaining = null
    progressCurrent = null
    progressTotal = null
    steps: [] = []
    worldColliders = [{ id: 'photometry-terminal', kind: 'aabb' as const }]
    tick = vi.fn()
    dispose = vi.fn()

    constructor(objectiveIndex: number) {
      this.objectiveIndex = objectiveIndex
      stores.photometries.push(this)
    }
  },
}))

vi.mock('@/lib/minigame/ExterminateMinigame', () => ({
  ExterminateMinigame: class {
    onDamagePlayer = null
    onKillPlayer = null
    onDestroyLander = null
    onExplosion = null
    onPrompt = null
    onComplete = null
    onStepChange = null
    objectiveIndex: number
    status = 'idle' as const
    isPlayerNearInteraction = false
    timeRemaining = null
    progressCurrent = null
    progressTotal = null
    steps: [] = []
    tick = vi.fn()
    dispose = vi.fn()
    installEnemySpawnObserver = vi.fn()

    constructor(objectiveIndex: number) {
      this.objectiveIndex = objectiveIndex
      stores.exterminates.push(this)
    }

    static async create(objectiveIndex: number) {
      return new this(objectiveIndex)
    }
  },
}))

vi.mock('@/lib/minigame/RescueMinigame', () => ({
  RescueMinigame: class {
    onDamagePlayer = null
    onKillPlayer = null
    onDestroyLander = null
    onExplosion = null
    onFail = null
    onPrompt = null
    onComplete = null
    onStepChange = null
    objectiveIndex: number
    status = 'idle' as const
    isPlayerNearInteraction = false
    timeRemaining = null
    progressCurrent = null
    progressTotal = null
    steps: [] = []
    tick = vi.fn()
    dispose = vi.fn()
    installEnemySpawnObserver = vi.fn()

    constructor(objectiveIndex: number) {
      this.objectiveIndex = objectiveIndex
      stores.rescues.push(this)
    }

    static async create(objectiveIndex: number) {
      return new this(objectiveIndex)
    }
  },
}))

vi.mock('@/lib/minigame/CollectMinigame', () => ({
  CollectMinigame: class {
    onPrompt = null
    onComplete = null
    onStepChange = null
    objectiveIndex: number
    status = 'idle' as const
    isPlayerNearInteraction = false
    timeRemaining = null
    progressCurrent = null
    progressTotal = null
    steps: [] = []
    tick = vi.fn()
    dispose = vi.fn()

    constructor(objectiveIndex: number) {
      this.objectiveIndex = objectiveIndex
      stores.collects.push(this)
    }
  },
}))

vi.mock('@/lib/minigame/GatherMinigame', () => ({
  GatherMinigame: class {
    onPrompt = null
    onComplete = null
    onStepChange = null
    objectiveIndex: number
    status = 'idle' as const
    isPlayerNearInteraction = false
    timeRemaining = null
    progressCurrent = null
    progressTotal = null
    steps: [] = []
    tick = vi.fn()
    dispose = vi.fn()

    constructor(options: { objectiveIndex: number }) {
      this.objectiveIndex = options.objectiveIndex
      stores.gathers.push(this)
    }
  },
}))

import { LevelMinigameFacade } from '@/lib/level/LevelMinigameFacade'

describe('LevelMinigameFacade initialization', () => {
  it('creates objective minigames and wires shared/controller callbacks', async () => {
    stores.surveys.length = 0
    stores.photometries.length = 0
    stores.exterminates.length = 0
    stores.rescues.length = 0
    stores.collects.length = 0
    stores.gathers.length = 0

    const facade = new LevelMinigameFacade()
    const onPrompt = vi.fn()
    const onComplete = vi.fn()
    const onStepChange = vi.fn()
    const onSurveyRefuel = vi.fn()
    const onRegisterTickable = vi.fn()
    const onUnregisterTickable = vi.fn()
    const onSurveyProbeCollect = vi.fn()
    const onPhotometryScanAudioState = vi.fn()
    const onDamagePlayer = vi.fn()
    const onKillPlayer = vi.fn()
    const onDestroyLander = vi.fn()
    const onExplosion = vi.fn()
    const onRescueFail = vi.fn()
    const onInstallCombatDropObserver = vi.fn()
    const onRegisterObjectiveColliders = vi.fn()

    await facade.initializeObjectives({
      mission: {
        difficulty: 3,
        objectives: [
          { type: 'survey' },
          { type: 'photometry' },
          { type: 'exterminate' },
          { type: 'rescue' },
          { type: 'collect' },
          { type: 'gather' },
        ],
      } as unknown as GeneratedAsteroidMission,
      scene: {} as unknown as Scene,
      heightmap: {} as unknown as Heightmap,
      projectileSystem: {} as unknown as ProjectileSystem,
      rockYieldSystem: {} as unknown as RockYieldSystem,
      composition: [],
      missionSeed: 123,
      bindings: {
        onPrompt,
        onComplete,
        onStepChange,
        onSurveyRefuel,
        onRegisterTickable,
        onUnregisterTickable,
        onSurveyProbeCollect,
        onPhotometryScanAudioState,
        onDamagePlayer,
        onKillPlayer,
        onDestroyLander,
        onExplosion,
        onRescueFail,
        onSurvivorLost: null,
        onSurvivorAboard: null,
        onInstallCombatDropObserver,
        onRegisterObjectiveColliders,
      },
    })

    expect(stores.surveys).toHaveLength(1)
    expect(stores.photometries).toHaveLength(1)
    expect(stores.exterminates).toHaveLength(1)
    expect(stores.rescues).toHaveLength(1)
    expect(stores.collects).toHaveLength(1)
    expect(stores.gathers).toHaveLength(1)

    const survey = stores.surveys[0]!
    const photometry = stores.photometries[0]!
    const exterminate = stores.exterminates[0]!
    const rescue = stores.rescues[0]!

    expect(survey.onPrompt).toBe(onPrompt)
    expect(survey.onComplete).toBe(onComplete)
    expect(survey.onStepChange).toBe(onStepChange)
    expect(survey.onRefuel).toBe(onSurveyRefuel)
    expect(survey.onRegisterTickable).toBe(onRegisterTickable)
    expect(survey.onUnregisterTickable).toBe(onUnregisterTickable)
    expect(survey.onProbeCollect).toBe(onSurveyProbeCollect)

    expect(photometry.onPrompt).toBe(onPrompt)
    expect(photometry.onComplete).toBe(onComplete)
    expect(photometry.onStepChange).toBe(onStepChange)
    expect(photometry.onRefuel).toBe(onSurveyRefuel)
    expect(photometry.onRegisterTickable).toBe(onRegisterTickable)
    expect(photometry.onUnregisterTickable).toBe(onUnregisterTickable)
    expect(photometry.onProbeCollect).toBe(onSurveyProbeCollect)
    expect(photometry.onScanAudioState).toBe(onPhotometryScanAudioState)

    expect(exterminate.onDamagePlayer).toBe(onDamagePlayer)
    expect(exterminate.onKillPlayer).toBe(onKillPlayer)
    expect(rescue.onDamagePlayer).toBe(onDamagePlayer)
    expect(rescue.onKillPlayer).toBe(onKillPlayer)
    expect(rescue.onFail).toBe(onRescueFail)
    expect(onInstallCombatDropObserver).toHaveBeenCalledTimes(2)
    expect(onRegisterObjectiveColliders).toHaveBeenCalledWith([
      { id: 'survey-terminal', kind: 'aabb' },
      { id: 'photometry-terminal', kind: 'aabb' },
    ])

    exterminate.onDestroyLander?.()
    rescue.onDestroyLander?.()
    exterminate.onExplosion?.({ x: 1, y: 2, z: 3 })
    rescue.onExplosion?.({ x: 4, y: 5, z: 6 })

    expect(onDestroyLander).toHaveBeenCalledWith('exterminate')
    expect(onDestroyLander).toHaveBeenCalledWith('rescue')
    expect(onExplosion).toHaveBeenCalledWith('exterminate', 1, 2, 3)
    expect(onExplosion).toHaveBeenCalledWith('rescue', 4, 5, 6)
  })

  it('skips gather objectives when no rock yield system is available', async () => {
    stores.gathers.length = 0
    const facade = new LevelMinigameFacade()

    await facade.initializeObjectives({
      mission: {
        difficulty: 1,
        objectives: [{ type: 'gather' }],
      } as unknown as GeneratedAsteroidMission,
      scene: {} as unknown as Scene,
      heightmap: {} as unknown as Heightmap,
      projectileSystem: {} as unknown as ProjectileSystem,
      rockYieldSystem: null,
      composition: [],
      missionSeed: 1,
      bindings: {
        onPrompt: null,
        onComplete: null,
        onStepChange: null,
        onSurveyRefuel: null,
        onRegisterTickable: null,
        onUnregisterTickable: null,
        onSurveyProbeCollect: null,
        onPhotometryScanAudioState: null,
        onDamagePlayer: null,
        onKillPlayer: null,
        onDestroyLander: null,
        onExplosion: null,
        onRescueFail: null,
        onSurvivorLost: null,
        onSurvivorAboard: null,
        onInstallCombatDropObserver: null,
        onRegisterObjectiveColliders: null,
      },
    })

    expect(stores.gathers).toHaveLength(0)
  })
})
