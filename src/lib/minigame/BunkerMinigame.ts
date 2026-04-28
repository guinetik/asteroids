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
import type { BunkerHatchModel } from '@/three/bunker/BunkerHatchModel'
import type { EnemyHandle } from '@/lib/fps/enemyDirector'
import { BunkerSceneState, type BunkerSubState } from '@/lib/bunker/bunkerSceneState'
import {
  difficultyToTier,
  rollWave,
  totalWavesForTier,
  type BunkerWaveTier,
} from '@/lib/bunker/bunkerWaveSchedule'

/** XZ distance threshold (world units) for surface-hatch interaction prompt. */
const SURFACE_HATCH_INTERACT_RANGE = 2.5
/** XZ distance threshold (world units) for the antechamber arena door. */
const ARENA_DOOR_INTERACT_RANGE = 2.5
/** XZ distance threshold (world units) for the antechamber exit hatch. */
const EXIT_HATCH_INTERACT_RANGE = 2.5

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
  private surfaceHatch: BunkerHatchModel | null = null
  private surfaceHatchPos: { x: number; z: number } | null = null

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
   * Player pressed E on the surface hatch within range. The level view runs
   * the descent flow (fade, hide asteroid, place player at antechamber spawn,
   * fire `enterBunker`) and then calls {@link notifyDescended} once the swap
   * is complete.
   */
  onDescend: (() => void) | null = null
  /**
   * Player pressed E on the antechamber exit hatch while in `exit-prompt`.
   * The level view runs the extract flow (fade, deactivate bunker scene,
   * restore asteroid, place player back at the surface hatch, fire
   * `exitBunker`).
   */
  onExit: (() => void) | null = null

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

  /**
   * World-space player spawn point inside the antechamber. Returns `null`
   * when the minigame has no scene (test seam). Read by the level view to
   * teleport the FPS controller after the descent fade-to-black.
   */
  get playerSpawn(): THREE.Vector3 | null {
    return this.scene?.playerSpawn ?? null
  }

  /**
   * Y-coordinate of the bunker antechamber's floor in world space. Used by
   * the level controller to clamp the player's foot position while inside
   * `bunker-interior` — the asteroid heightmap doesn't model the bunker
   * floor, so without this clamp the player would sink or float at the
   * heightfield value for the bunker's world XZ. Returns `null` in test
   * seams without a scene.
   */
  get bunkerFloorY(): number | null {
    return this.scene?.floorY ?? null
  }

  /** Currently-active wave index (zero-based) — for HUD. */
  get currentWaveIndex(): number {
    return this.state.currentWaveIndex
  }

  /**
   * Live alive-enemy count read off the bunker scene's enemy director.
   * Returns 0 when the minigame has no scene (test seam) or no enemies have
   * been spawned yet. Used by the bunker wave HUD to render the hostile
   * counter row during `wave-active`.
   */
  get hostiles(): number {
    if (!this.scene) return 0
    return this.scene.enemyDirector.enemies.filter((h) => h.enemy.alive).length
  }

  /**
   * Current sub-FSM state of the bunker interior. Mirrors
   * {@link BunkerSceneState.current} so the level view can gate the wave HUD
   * and interaction prompts without reaching into the minigame's private
   * state machine reference.
   */
  get bunkerPhase(): BunkerSubState {
    return this.state.current
  }

  /** @inheritdoc */
  tick(dt: number, ctx: MiniGameContext): void {
    if (this._status !== 'active') return
    this.state.tick(dt)
    this.scene?.tick(dt)
    this.scene?.enemyDirector.tick(dt)

    this.updateInteractionPrompts(ctx)

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

  /**
   * Register a listener fired for every enemy spawned by the bunker director.
   * Delegates to {@link BunkerSceneController.installEnemySpawnObserver} so the
   * level-side loot drop pipeline can attach death listeners to bunker mobs the
   * same way it does for rescue and exterminate minigames.
   *
   * @param listener - Fired with the enemy handle on every spawn
   * @returns Unsubscribe function (no-op when the minigame has no scene, e.g. tests)
   */
  installEnemySpawnObserver(listener: (handle: EnemyHandle) => void): () => void {
    return this.scene?.installEnemySpawnObserver(listener) ?? (() => {})
  }

  /**
   * Wire the level-side surface hatch prop and its world XZ position so the
   * minigame can drive the descent prompt + interaction. Called once after
   * the level view spawns the surface hatch.
   *
   * @param hatch - Surface hatch model (animated when descent fires)
   * @param position - World XZ of the hatch (used for proximity tests)
   */
  setSurfaceHatch(hatch: BunkerHatchModel, position: { x: number; z: number }): void {
    this.surfaceHatch = hatch
    this.surfaceHatchPos = { x: position.x, z: position.z }
  }

  /**
   * Drive the surface-hatch / arena-door / exit-hatch prompts and trigger the
   * matching action callbacks on press. Run at the end of every tick.
   *
   * @param ctx - Per-frame minigame context (player position, key edges)
   */
  private updateInteractionPrompts(ctx: MiniGameContext): void {
    this._isPlayerNear = false

    // Surface hatch — only relevant before the player has descended.
    if (
      this.state.current === 'entering' &&
      this.surfaceHatch &&
      this.surfaceHatchPos &&
      ctx.playerPosition &&
      ctx.levelState === 'eva'
    ) {
      const dx = ctx.playerPosition.x - this.surfaceHatchPos.x
      const dz = ctx.playerPosition.z - this.surfaceHatchPos.z
      const inRange = dx * dx + dz * dz <= SURFACE_HATCH_INTERACT_RANGE * SURFACE_HATCH_INTERACT_RANGE
      this.surfaceHatch.active = inRange
      if (inRange) {
        this._isPlayerNear = true
        this.onPrompt?.('[E] DESCEND')
        if (ctx.terminalInteractPressed) {
          this.surfaceHatch.setOpen(true)
          this.onDescend?.()
        }
      }
      return
    }

    // Inside the bunker — door and exit hatch prompts.
    if (!this.scene || ctx.levelState !== 'bunker-interior' || !ctx.playerPosition) {
      return
    }
    const px = ctx.playerPosition.x
    const pz = ctx.playerPosition.z

    if (this.state.current === 'antechamber-idle') {
      const dp = this.scene.doorPosition
      const dx = px - dp.x
      const dz = pz - dp.z
      if (dx * dx + dz * dz <= ARENA_DOOR_INTERACT_RANGE * ARENA_DOOR_INTERACT_RANGE) {
        this._isPlayerNear = true
        this.onPrompt?.('[E] OPEN DOOR')
        if (ctx.terminalInteractPressed) {
          this.scene.door.setOpen(true)
          this.notifyArenaDoorInteract()
        }
      }
      return
    }

    if (this.state.current === 'exit-prompt') {
      const hp = this.scene.hatchPosition
      const dx = px - hp.x
      const dz = pz - hp.z
      if (dx * dx + dz * dz <= EXIT_HATCH_INTERACT_RANGE * EXIT_HATCH_INTERACT_RANGE) {
        this._isPlayerNear = true
        this.onPrompt?.('[E] EXIT BUNKER')
        if (ctx.terminalInteractPressed) {
          this.onExit?.()
        }
      }
    }
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
