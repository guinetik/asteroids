/**
 * Collect minigame — single glowing crate, walk up and press [E].
 *
 * Spawns a {@link DepositCrateModel} at the objective waypoint. As soon
 * as the player is within {@link TERMINAL_INTERACT_RANGE} the prompt
 * lights up; pressing the terminal interact key hides the crate and
 * marks the objective complete.
 *
 * @author guinetik
 * @date 2026-04-07
 */
import * as THREE from 'three'
import type { MiniGame, MiniGameContext, MiniGameEvents, MiniGameStatus, MiniGameStep } from './MiniGame'
import type { ConcreteObjective } from '@/lib/missions/types'
import type { Heightmap } from '@/lib/terrain/heightmap'
import { TERMINAL_INTERACT_RANGE } from '@/three/TerminalModel'
import { DepositCrateModel } from '@/three/DepositCrateModel'

export class CollectMinigame implements MiniGame, MiniGameEvents {
  readonly objectiveIndex: number

  private _status: MiniGameStatus = 'idle'
  private _isPlayerNear = false
  private readonly _steps: MiniGameStep[] = [
    { label: 'Locate the package', complete: false, active: true },
    { label: 'Collect the package', complete: false, active: false },
  ]

  private readonly scene: THREE.Scene
  private readonly crate: DepositCrateModel
  private readonly objective: ConcreteObjective

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
    return null
  }

  get progressTotal(): number | null {
    return null
  }

  get steps(): readonly MiniGameStep[] {
    return this._steps
  }

  constructor(
    objectiveIndex: number,
    objective: ConcreteObjective,
    scene: THREE.Scene,
    heightmap: Heightmap,
  ) {
    this.objectiveIndex = objectiveIndex
    this.objective = objective
    this.scene = scene

    this.crate = new DepositCrateModel()
    const groundY = heightmap.heightAt(objective.x, objective.z)
    this.crate.placeAt(objective.x, objective.z, groundY)
    scene.add(this.crate.group)
  }

  tick(_dt: number, ctx: MiniGameContext): void {
    if (this._status === 'completed') return

    this._isPlayerNear = false
    if (ctx.levelState !== 'eva' || !ctx.playerPosition) return

    const dx = ctx.playerPosition.x - this.crate.group.position.x
    const dz = ctx.playerPosition.z - this.crate.group.position.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist > TERMINAL_INTERACT_RANGE) return

    this._isPlayerNear = true
    this.completeStep(0)
    this.onPrompt?.(this.objective.interactionLabel ?? '[E] COLLECT PACKAGE')

    if (!ctx.terminalInteractPressed) return

    this.completeStep(1)
    this._status = 'completed'
    this.onPrompt?.(null)
    this.crate.setVisible(false)
    this.onComplete?.(this.objectiveIndex)
  }

  private completeStep(index: number): void {
    const step = this._steps[index]
    if (!step || step.complete) return
    step.complete = true
    step.active = false
    const next = this._steps.find((candidate) => !candidate.complete)
    if (next) next.active = true
    this.onStepChange?.(this.objectiveIndex, this._steps)
  }

  dispose(): void {
    this.scene.remove(this.crate.group)
    this.crate.dispose()
  }
}
