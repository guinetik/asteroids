/**
 * Mineral analysis minigame.
 *
 * The objective starts at a surface terminal, counts distinct SCI-prospected
 * rocks, then requests a mined sample from one of the analyzed mineral types.
 *
 * @author guinetik
 * @date 2026-05-04
 * @spec docs/superpowers/specs/2026-05-04-mineral-analysis-mission-design.md
 */
import * as THREE from 'three'
import type {
  MiniGame,
  MiniGameContext,
  MiniGameEvents,
  MiniGameStatus,
  MiniGameStep,
} from './MiniGame'
import type { ConcreteObjective } from '@/lib/missions/types'
import type { Heightmap } from '@/lib/terrain/heightmap'
import type { RockYieldSystem } from '@/lib/mining/rockYieldSystem'
import { getItemDefinition } from '@/lib/inventory/catalog'
import { TerminalModel, TERMINAL_INTERACT_RANGE } from '@/three/TerminalModel'

const DEFAULT_ANALYSIS_ROCK_COUNT = 2
const DEFAULT_SAMPLE_KG = 20
const TERMINAL_READY_COLOR = 0x00ffcc
const TERMINAL_SAMPLE_COLOR = 0xffc857
const TERMINAL_COMPLETE_COLOR = 0x55ff88

/** Construction options for {@link MineralAnalysisMinigame}. */
export interface MineralAnalysisMinigameOptions {
  /** Objective index in the current mission objective array. */
  objectiveIndex: number
  /** Concrete mission objective carrying analysis and sample targets. */
  objective: ConcreteObjective
  /** Three.js scene that owns the surface terminal. */
  scene: THREE.Scene
  /** Terrain heightmap used to place the terminal at the objective site. */
  heightmap: Heightmap
  /** Shared rock yield system that emits SCI prospecting and mining events. */
  rockYieldSystem: RockYieldSystem
  /** Random source used to select the sample mineral after report delivery. */
  sampleSelectionRandom?: () => number
}

/** Terminal-driven SCI analysis objective for surface minerals. */
export class MineralAnalysisMinigame implements MiniGame, MiniGameEvents {
  readonly objectiveIndex: number

  private _status: MiniGameStatus = 'idle'
  private _isPlayerNear = false
  private _selectedSampleItemId: string | null = null
  private _sampleKgMined = 0
  private readonly objective: ConcreteObjective
  private readonly scene: THREE.Scene
  private readonly terminal: TerminalModel
  private readonly rockYieldSystem: RockYieldSystem
  private readonly sampleSelectionRandom: () => number
  private readonly analyzedRockIds = new Set<number>()
  private readonly analyzedItemIds = new Set<string>()
  private readonly analysisTarget: number
  private readonly sampleTargetKg: number
  private readonly _steps: MiniGameStep[]
  private readonly previousProspected: RockYieldSystem['onRockProspected']
  private readonly previousExtracted: RockYieldSystem['onMineralExtracted']
  private readonly prospectedListener: NonNullable<RockYieldSystem['onRockProspected']>
  private readonly extractedListener: NonNullable<RockYieldSystem['onMineralExtracted']>
  private readonly prospectedWrapper: NonNullable<RockYieldSystem['onRockProspected']>
  private readonly extractedWrapper: NonNullable<RockYieldSystem['onMineralExtracted']>
  private disposed = false

  onPrompt: ((text: string | null) => void) | null = null
  onComplete: ((objectiveIndex: number) => void) | null = null
  onStepChange: ((objectiveIndex: number, steps: readonly MiniGameStep[]) => void) | null = null

  get status(): MiniGameStatus {
    return this._status
  }

  get isPlayerNearInteraction(): boolean {
    return this._isPlayerNear
  }

  get timeRemaining(): number | null {
    return null
  }

  get progressCurrent(): number | null {
    if (this._selectedSampleItemId) return this._sampleKgMined
    return this.analyzedRockIds.size
  }

  get progressTotal(): number | null {
    if (this._selectedSampleItemId) return this.sampleTargetKg
    return this.analysisTarget
  }

  get steps(): readonly MiniGameStep[] {
    return this._steps
  }

  /** Mineral item id selected by the terminal after report delivery. */
  get selectedSampleItemId(): string | null {
    return this._selectedSampleItemId
  }

  /** Kilograms mined toward the selected sample quota. */
  get sampleKgMined(): number {
    return this._sampleKgMined
  }

  constructor(options: MineralAnalysisMinigameOptions) {
    this.objectiveIndex = options.objectiveIndex
    this.objective = options.objective
    this.scene = options.scene
    this.rockYieldSystem = options.rockYieldSystem
    this.sampleSelectionRandom = options.sampleSelectionRandom ?? Math.random
    this.analysisTarget = Math.max(
      1,
      Math.round(options.objective.analysisRockCount ?? DEFAULT_ANALYSIS_ROCK_COUNT),
    )
    this.sampleTargetKg = Math.max(1, Math.round(options.objective.sampleKg ?? DEFAULT_SAMPLE_KG))
    this._steps = [
      { label: 'Start mineral analysis terminal', complete: false, active: true },
      {
        label: 'Analyze rocks with SCIENCE',
        complete: false,
        active: false,
        progress: { current: 0, target: this.analysisTarget, unit: 'rocks' },
      },
      { label: 'Deliver analysis report', complete: false, active: false },
      {
        label: 'Mine requested sample',
        complete: false,
        active: false,
        progress: { current: 0, target: this.sampleTargetKg, unit: 'kg' },
      },
      { label: 'Deliver sample to terminal', complete: false, active: false },
    ]

    this.terminal = new TerminalModel()
    this.terminal.setScreenEmissive(TERMINAL_READY_COLOR)
    const groundY = options.heightmap.heightAt(options.objective.x, options.objective.z)
    this.terminal.placeAt(options.objective.x, groundY, options.objective.z)
    this.scene.add(this.terminal.group)

    this.previousProspected = this.rockYieldSystem.onRockProspected
    this.previousExtracted = this.rockYieldSystem.onMineralExtracted
    this.prospectedListener = (spawnIndex, itemId) => this.handleRockProspected(spawnIndex, itemId)
    this.extractedListener = (itemId, kg) => this.handleMineralExtracted(itemId, kg)

    this.prospectedWrapper = (spawnIndex, itemId) => {
      this.previousProspected?.(spawnIndex, itemId)
      this.prospectedListener(spawnIndex, itemId)
    }
    this.extractedWrapper = (itemId, kg, spawnIndex) => {
      this.previousExtracted?.(itemId, kg, spawnIndex)
      this.extractedListener(itemId, kg, spawnIndex)
    }
    this.rockYieldSystem.onRockProspected = this.prospectedWrapper
    this.rockYieldSystem.onMineralExtracted = this.extractedWrapper
  }

  tick(_dt: number, ctx: MiniGameContext): void {
    if (this._status === 'completed') return

    this._isPlayerNear = false
    if (ctx.levelState !== 'eva' || !ctx.playerPosition) return

    const dx = ctx.playerPosition.x - this.terminal.group.position.x
    const dz = ctx.playerPosition.z - this.terminal.group.position.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist > TERMINAL_INTERACT_RANGE) return

    this._isPlayerNear = true
    this.onPrompt?.(this.promptText())
    if (!ctx.terminalInteractPressed) return

    if (this._status === 'idle') {
      this._status = 'active'
      this.completeStep(0)
      this.activateStep(1)
      this.onPrompt?.(null)
      return
    }

    if (!this._steps[1]!.complete) return

    if (!this._steps[2]!.complete) {
      this.selectSampleMineral()
      this.completeStep(2)
      this.activateStep(3)
      this.onPrompt?.(null)
      return
    }

    if (!this._steps[3]!.complete) return

    this.completeStep(4)
    this._status = 'completed'
    this.terminal.setScreenEmissive(TERMINAL_COMPLETE_COLOR)
    this.onPrompt?.(null)
    this.onComplete?.(this.objectiveIndex)
  }

  dispose(): void {
    this.disposed = true
    if (this.rockYieldSystem.onRockProspected === this.prospectedWrapper) {
      this.rockYieldSystem.onRockProspected = this.previousProspected
    }
    if (this.rockYieldSystem.onMineralExtracted === this.extractedWrapper) {
      this.rockYieldSystem.onMineralExtracted = this.previousExtracted
    }
    this.scene.remove(this.terminal.group)
    this.terminal.dispose()
  }

  private handleRockProspected(spawnIndex: number, itemId: string): void {
    if (this.disposed || this._status !== 'active') return
    if (this._steps[1]!.complete) return
    if (this.analyzedRockIds.has(spawnIndex)) return

    this.analyzedRockIds.add(spawnIndex)
    this.analyzedItemIds.add(itemId)
    const analysisStep = this._steps[1]!
    if (analysisStep.progress) {
      analysisStep.progress.current = Math.min(this.analyzedRockIds.size, this.analysisTarget)
    }
    if (this.analyzedRockIds.size >= this.analysisTarget) {
      this.completeStep(1)
      this.activateStep(2)
    } else {
      this.onStepChange?.(this.objectiveIndex, this._steps)
    }
  }

  private handleMineralExtracted(itemId: string, kg: number): void {
    if (this.disposed || this._status !== 'active') return
    if (this._selectedSampleItemId !== itemId) return
    if (this._steps[3]!.complete) return

    this._sampleKgMined = Math.min(this.sampleTargetKg, this._sampleKgMined + kg)
    const sampleStep = this._steps[3]!
    sampleStep.label = `Mine ${this.sampleLabel()} sample`
    if (sampleStep.progress) {
      sampleStep.progress.current = Math.round(this._sampleKgMined)
    }
    if (this._sampleKgMined >= this.sampleTargetKg) {
      this.completeStep(3)
      this.activateStep(4)
    } else {
      this.onStepChange?.(this.objectiveIndex, this._steps)
    }
  }

  private selectSampleMineral(): void {
    const candidates = [...this.analyzedItemIds]
    const index = Math.min(
      candidates.length - 1,
      Math.floor(this.sampleSelectionRandom() * candidates.length),
    )
    this._selectedSampleItemId = candidates[Math.max(0, index)] ?? null
    this.terminal.setScreenEmissive(TERMINAL_SAMPLE_COLOR)
    this._steps[3]!.label = `Mine ${this.sampleLabel()} sample`
  }

  private promptText(): string {
    if (this._status === 'idle') return this.objective.interactionLabel ?? '[E] START ANALYSIS'
    if (!this._steps[1]!.complete) return 'ANALYZE ROCKS WITH SCIENCE MODE'
    if (!this._steps[2]!.complete) return '[E] DELIVER ANALYSIS REPORT'
    if (!this._steps[3]!.complete) return `MINE ${this.sampleLabel().toUpperCase()} SAMPLE`
    return '[E] DELIVER MINERAL SAMPLE'
  }

  private sampleLabel(): string {
    const itemId = this._selectedSampleItemId
    if (!itemId) return 'selected mineral'
    return getItemDefinition(itemId)?.label ?? itemId
  }

  private completeStep(index: number): void {
    const step = this._steps[index]
    if (!step || step.complete) return
    step.complete = true
    step.active = false
    this.onStepChange?.(this.objectiveIndex, this._steps)
  }

  private activateStep(index: number): void {
    for (const step of this._steps) step.active = false
    const next = this._steps[index]
    if (next && !next.complete) next.active = true
    this.onStepChange?.(this.objectiveIndex, this._steps)
  }
}
