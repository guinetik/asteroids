/**
 * Bunker minigame — descend through the hatch, clear authored waves in the
 * arena, walk back out.
 *
 * Mirrors {@link RescueMinigame}'s shape: 6-step list, status flag,
 * scene-and-director ownership, callback bag for the level facade. The
 * interior scene is owned by {@link BunkerSceneController}; this class
 * drives the FSM ({@link BunkerSceneState}) and the wave scheduler.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
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
import { BunkerSceneController } from '@/three/bunker/BunkerSceneController'
import { BunkerSceneState, type BunkerSubState } from '@/lib/bunker/bunkerSceneState'
import {
  difficultyToTier,
  rollWave,
  totalWavesForTier,
  type BunkerWaveTier,
} from '@/lib/bunker/bunkerWaveSchedule'

/** Test seam — internal options for {@link BunkerMinigame.createForTest}. */
export interface BunkerMinigameTestOptions {
  /** Index of this minigame's objective in the parent mission. */
  objectiveIndex: number
  /** The bunker objective with waveCount stamped by the generator. */
  objective: ConcreteObjective
  /** Stable mission instance id, used as wave-roster RNG seed. */
  missionId: string
  /** Faction tint hex passed to the scene controller. */
  factionTint: number
  /** Rolled mission difficulty (1-10) — used to pick the bunker tier. */
  difficulty: number
}

/** Production constructor params for {@link BunkerMinigame.create}. */
export interface BunkerMinigameCreateOptions {
  /** Index of this minigame's objective in the parent mission. */
  objectiveIndex: number
  /** The bunker objective with waveCount stamped by the generator. */
  objective: ConcreteObjective
  /** Stable mission instance id, used as wave-roster RNG seed. */
  missionId: string
  /** Faction tint hex passed to the scene controller. */
  factionTint: number
  /** Parent THREE scene the bunker root attaches to on `activate`. */
  threeScene: THREE.Scene
  /** Rolled mission difficulty (1-10) — used to pick the bunker tier. */
  difficulty: number
}

/** Bunker minigame implementation. */
export class BunkerMinigame implements MiniGame, MiniGameEvents {
  readonly objectiveIndex: number
  private readonly objective: ConcreteObjective
  private readonly missionId: string
  private readonly tier: BunkerWaveTier
  private readonly totalWaves: number
  private readonly state: BunkerSceneState
  private readonly scene: BunkerSceneController | null
  private wavesCleared = 0
  private spawnedWaveIndex = -1
  private _status: MiniGameStatus = 'active'
  private _isPlayerNear = false

  private readonly _steps: MiniGameStep[] = [
    { label: 'Travel to the asteroid', complete: false, active: true },
    { label: 'Land in the bunker zone', complete: false, active: false },
    { label: 'Enter the bunker', complete: false, active: false },
    { label: 'Clear the waves', complete: false, active: false },
    { label: 'Extract from the bunker', complete: false, active: false },
    { label: 'Return to the giver planet', complete: false, active: false },
  ]

  // --- MiniGameEvents ---
  /** @inheritdoc */
  onPrompt: ((text: string | null) => void) | null = null
  /** @inheritdoc */
  onComplete: ((objectiveIndex: number) => void) | null = null
  /** @inheritdoc */
  onStepChange: ((objectiveIndex: number, steps: readonly MiniGameStep[]) => void) | null = null
  /** Fired when the mission can no longer be completed. */
  onFail: ((objectiveIndex: number, cause: string) => void) | null = null
  /** Player took damage from a bunker enemy. */
  onDamagePlayer:
    | ((
        damage: number,
        sourceX: number,
        sourceZ: number,
        source?: 'projectile' | 'contact',
      ) => void)
    | null = null
  /** Player HP reached zero. Default handler marks this minigame failed. */
  onKillPlayer: (() => void) | null = () => {
    this.fail('Operator KIA')
  }
  /** Lander was destroyed (for parity with rescue; bunker doesn't currently fire it). */
  onDestroyLander: (() => void) | null = null
  /** Forwarded explosion VFX hook (parity with rescue facade plumbing). */
  onExplosion: ((position: THREE.Vector3) => void) | null = null

  /**
   * Build a minigame with a real scene controller. Used by `LevelMinigameFacade`.
   *
   * @param params - Scene + objective metadata
   */
  static create(params: BunkerMinigameCreateOptions): BunkerMinigame {
    const scene = new BunkerSceneController({
      tint: params.factionTint,
      scene: params.threeScene,
    })
    return new BunkerMinigame(
      params.objectiveIndex,
      params.objective,
      params.missionId,
      scene,
      params.difficulty,
    )
  }

  /**
   * Build a minigame without a scene — for tests only.
   *
   * @param opts - Test seam args
   */
  static createForTest(opts: BunkerMinigameTestOptions): BunkerMinigame {
    return new BunkerMinigame(
      opts.objectiveIndex,
      opts.objective,
      opts.missionId,
      null,
      opts.difficulty,
    )
  }

  private constructor(
    objectiveIndex: number,
    objective: ConcreteObjective,
    missionId: string,
    scene: BunkerSceneController | null,
    difficulty: number,
  ) {
    this.objectiveIndex = objectiveIndex
    this.objective = objective
    this.missionId = missionId
    this.scene = scene
    this.tier = difficultyToTier(difficulty)
    this.totalWaves = totalWavesForTier(this.tier)
    this.state = new BunkerSceneState({ totalWaves: this.totalWaves })
  }

  /** @inheritdoc */
  get status(): MiniGameStatus {
    return this._status
  }

  /** @inheritdoc */
  get isPlayerNearInteraction(): boolean {
    return this._isPlayerNear
  }

  /** @inheritdoc */
  get timeRemaining(): number | null {
    return null
  }

  /** @inheritdoc */
  get progressCurrent(): number | null {
    return this.wavesCleared
  }

  /** @inheritdoc */
  get progressTotal(): number | null {
    return this.totalWaves
  }

  /** @inheritdoc */
  get steps(): readonly MiniGameStep[] {
    return this._steps
  }

  /** Bunker tier (slice 1: easy/medium/hard from rolled difficulty). */
  get bunkerTier(): BunkerWaveTier {
    return this.tier
  }

  /** Currently-active wave index (zero-based) — for HUD. */
  get currentWaveIndex(): number {
    return this.state.currentWaveIndex
  }

  /** @inheritdoc */
  tick(dt: number, _ctx: MiniGameContext): void {
    if (this._status !== 'active') return
    this.state.tick(dt)
    this.scene?.tick(dt)
    this.scene?.enemyDirector.tick(dt)

    // Spawn the wave roster once on entry to a fresh wave-active state. The
    // spawnedWaveIndex tracker prevents respawning every tick while enemies
    // are still alive.
    if (
      this.state.current === 'wave-active' &&
      this.scene &&
      this.spawnedWaveIndex !== this.state.currentWaveIndex
    ) {
      const roster = rollWave(this.tier, this.state.currentWaveIndex, this.missionId)
      this.scene.spawnWave(roster)
      this.spawnedWaveIndex = this.state.currentWaveIndex
    }

    // Wave is cleared when at least one enemy was spawned for it AND every
    // enemy is dead. The `spawnedWaveIndex` guard ensures we don't fire
    // wave-cleared on the same frame as the spawn.
    if (
      this.state.current === 'wave-active' &&
      this.scene &&
      this.spawnedWaveIndex === this.state.currentWaveIndex &&
      this.scene.enemyDirector.enemies.length > 0 &&
      this.scene.enemyDirector.enemies.every((h) => !h.enemy.alive)
    ) {
      this.wavesCleared += 1
      this.state.notifyWaveCleared()
      // Re-read the FSM state after `notifyWaveCleared()` mutates it. TS
      // carries the prior 'wave-active' narrowing through the getter call,
      // so we widen via `as BunkerSubState` to restore the full union.
      const after = this.state.current as BunkerSubState
      if (after === 'exit-prompt' || after === 'final-clear') {
        this.scene.hatch.active = true
        this.scene.hatch.setOpen(true)
      }
    }
  }

  /** @inheritdoc */
  dispose(): void {
    this.scene?.dispose()
  }

  // ----------------- Step driving (called by LevelView) -----------------

  /**
   * Advance step `index` if not yet complete. Marks it complete, deactivates
   * it, and activates the next not-yet-complete step. Fires `onStepChange`.
   *
   * @param index - Zero-based step index
   */
  advanceStep(index: number): void {
    const step = this._steps[index]
    if (!step || step.complete) return
    step.complete = true
    step.active = false
    const next = this._steps.find((c) => !c.complete)
    if (next) next.active = true
    this.onStepChange?.(this.objectiveIndex, this._steps)
  }

  /** Called when the player presses E on the surface hatch. Caller swaps scene. */
  notifyDescended(): void {
    this.advanceStep(2) // Enter the bunker
    this.scene?.activate()
    this.state.notifyActivated()
  }

  /** Called when the player presses E on the arena door. */
  notifyArenaDoorInteract(): void {
    this.state.notifyDoorInteracted()
  }

  /** Called when the player presses E on the antechamber exit hatch. */
  notifyExitInteract(): void {
    this.state.notifyHatchInteracted()
    if (this.state.current === 'exiting') {
      this.advanceStep(3) // Clear the waves
      this.advanceStep(4) // Extract
      this._status = 'completed'
      this.onComplete?.(this.objectiveIndex)
    }
  }

  /**
   * Mark mission failed; reuses Rescue's pattern.
   *
   * @param cause - Short label shown on the death prompt
   */
  fail(cause: string): void {
    if (this._status !== 'active') return
    this._status = 'failed'
    this.onFail?.(this.objectiveIndex, cause)
  }

  // ----------------- Test seams -----------------

  /** @internal used by tests only. */
  advanceStepForTest(index: number): void {
    this.advanceStep(index)
  }

  /** @internal used by tests only. */
  startWavesForTest(): void {
    this.state.notifyActivated()
    this.state.notifyDoorInteracted()
  }

  /** @internal used by tests only. */
  notifyWaveClearedForTest(): void {
    this.wavesCleared += 1
    this.state.notifyWaveCleared()
  }

  /** @internal used by tests only. */
  completeForTest(): void {
    this._status = 'completed'
  }
}
