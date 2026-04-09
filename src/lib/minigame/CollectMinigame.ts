import * as THREE from 'three'
import type { MiniGame, MiniGameContext, MiniGameEvents, MiniGameStatus, MiniGameStep } from './MiniGame'
import type { ConcreteObjective } from '@/lib/missions/types'
import type { Heightmap } from '@/lib/terrain/heightmap'
import { TERMINAL_INTERACT_RANGE } from '@/three/TerminalModel'

const CRATE_WIDTH = 3.2
const CRATE_HEIGHT = 2.2
const CRATE_DEPTH = 2.2
const CRATE_BASE = 0x12303a
const CRATE_TRIM = 0x5ce7ff

export class CollectMinigame implements MiniGame, MiniGameEvents {
  readonly objectiveIndex: number

  private _status: MiniGameStatus = 'idle'
  private _isPlayerNear = false
  private readonly _steps: MiniGameStep[] = [
    { label: 'Locate the package', complete: false, active: true },
    { label: 'Collect the package', complete: false, active: false },
  ]

  private readonly scene: THREE.Scene
  private readonly crateGroup = new THREE.Group()
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

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(CRATE_WIDTH, CRATE_HEIGHT, CRATE_DEPTH),
      new THREE.MeshStandardMaterial({
        color: CRATE_BASE,
        metalness: 0.55,
        roughness: 0.42,
      }),
    )
    body.position.y = CRATE_HEIGHT / 2
    body.castShadow = true
    body.receiveShadow = true
    this.crateGroup.add(body)

    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(CRATE_WIDTH + 0.08, 0.16, CRATE_DEPTH + 0.08),
      new THREE.MeshStandardMaterial({
        color: CRATE_TRIM,
        emissive: CRATE_TRIM,
        emissiveIntensity: 0.8,
      }),
    )
    trim.position.y = CRATE_HEIGHT - 0.25
    this.crateGroup.add(trim)

    const groundY = heightmap.heightAt(objective.x, objective.z)
    this.crateGroup.position.set(objective.x, groundY, objective.z)
    scene.add(this.crateGroup)
  }

  tick(_dt: number, ctx: MiniGameContext): void {
    if (this._status === 'completed') return

    this._isPlayerNear = false
    if (ctx.levelState !== 'eva' || !ctx.playerPosition) return

    const dx = ctx.playerPosition.x - this.crateGroup.position.x
    const dz = ctx.playerPosition.z - this.crateGroup.position.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist > TERMINAL_INTERACT_RANGE) return

    this._isPlayerNear = true
    this.completeStep(0)
    this.onPrompt?.(this.objective.interactionLabel ?? '[E] COLLECT PACKAGE')

    if (!ctx.terminalInteractPressed) return

    this.completeStep(1)
    this._status = 'completed'
    this.onPrompt?.(null)
    this.crateGroup.visible = false
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
    this.scene.remove(this.crateGroup)
    this.crateGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          for (const material of child.material) material.dispose()
        } else {
          child.material.dispose()
        }
      }
    })
  }
}
