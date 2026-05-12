/**
 * Level-scoped runtime orchestration for objective minigame sessions.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */

import type { Enemy } from '@/lib/fps/enemy'
import type { ProjectileSystem } from '@/lib/fps/projectileSystem'
import type { GeneratedAsteroidMission } from '@/lib/missions/types'
import type { MineralEntry } from '@/lib/asteroids/types'
import type { Heightmap } from '@/lib/terrain/heightmap'
import type { MiniGame, MiniGameContext } from '@/lib/minigame/MiniGame'
import type { MiniGameStep } from '@/lib/minigame/MiniGame'
import type { WorldCollider } from '@/lib/physics/worldCollision'
import { SurveyMinigame } from '@/lib/minigame/SurveyMinigame'
import {
  PhotometryMinigame,
  type PhotometryScanAudioState,
} from '@/lib/minigame/PhotometryMinigame'
import { DanMinigame, type DanScanAudioState } from '@/lib/minigame/DanMinigame'
import type { DanCraterPlacement } from '@/lib/level/danCraterPlacement'
import { ExterminateMinigame } from '@/lib/minigame/ExterminateMinigame'
import { RescueMinigame } from '@/lib/minigame/RescueMinigame'
import { BunkerMinigame } from '@/lib/minigame/BunkerMinigame'
import { CollectMinigame } from '@/lib/minigame/CollectMinigame'
import { GatherMinigame } from '@/lib/minigame/GatherMinigame'
import { MineralAnalysisMinigame } from '@/lib/minigame/MineralAnalysisMinigame'
import type { Tickable } from '@/lib/Tickable'
import type { RockYieldSystem } from '@/lib/mining/rockYieldSystem'
import type { Object3D, Scene } from 'three'
import { tintForGiver } from '@/lib/level/bunkerFactionTint'

/**
 * Flat world position snapshot passed into the minigame facade each frame.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export interface LevelMinigamePosition {
  /** World X coordinate. */
  x: number
  /** World Y coordinate. */
  y: number
  /** World Z coordinate. */
  z: number
}

/**
 * Controller-owned runtime state needed to build the shared minigame frame context.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export interface LevelMinigameTickState {
  /** Current level state machine state. */
  levelState: string
  /** Lander world position, if available. */
  landerPosition: LevelMinigamePosition | null
  /** Lander forward direction in world space, if available. */
  landerForward?: LevelMinigamePosition | null
  /** Lander up direction in world space, if available. */
  landerUp?: LevelMinigamePosition | null
  /** Whether the lander is currently grounded. */
  landerGrounded: boolean
  /** EVA player world position, if available. */
  playerPosition: LevelMinigamePosition | null
  /** EVA player camera-forward direction in world space, if available. */
  playerForward?: LevelMinigamePosition | null
  /** Whether the interact action fired this frame. */
  interactPressed: boolean
  /** Whether the terminal interact action fired this frame. */
  terminalInteractPressed: boolean
  /**
   * Whether the terminal-interact action is currently held this frame
   * (level-triggered). Use for held-E mechanics like the Yamada dispense beat.
   * Defaults to `false` when omitted.
   */
  terminalInteractHeld?: boolean
}

/**
 * Controller-owned side effects and integrations needed by objective minigame setup.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export interface LevelMinigameBindings {
  /** Prompt sink used by EVA terminal interactions. */
  onPrompt: ((text: string | null) => void) | null
  /** Objective completion sink. */
  onComplete: ((objectiveIndex: number) => void) | null
  /** Tracker/HUD step update sink. */
  onStepChange: ((objectiveIndex: number, steps: readonly MiniGameStep[]) => void) | null
  /** Refill the lander when a survey begins. */
  onSurveyRefuel: (() => void) | null
  /** Register a transient tickable owned by a minigame. */
  onRegisterTickable: ((tickable: Tickable) => void) | null
  /** Unregister a transient tickable owned by a minigame. */
  onUnregisterTickable: ((tickable: Tickable) => void) | null
  /** Resource pickup cue used when a survey probe is collected. Receives probes collected so far and total. */
  onSurveyProbeCollect: ((collected: number, total: number) => void) | null
  /** Photometry scan audio state sink used while the X-ray beam is active. */
  onPhotometryScanAudioState: ((state: PhotometryScanAudioState) => void) | null
  /** DAN scan audio state sink used while the neutron scan beam is active. */
  onDanScanAudioState: ((state: DanScanAudioState) => void) | null
  /** DAN particle capture cue — short click + spark when SCI bolt registers a hit. */
  onDanParticleHit: (() => void) | null
  /** DAN completion pulse cue fired when telemetry delivery succeeds. */
  onDanCompletionPulse: (() => void) | null
  /** Route combat/hazard damage back into the level presentation layer. */
  onDamagePlayer:
    | ((
        damage: number,
        sourceX: number,
        sourceZ: number,
        source?: 'projectile' | 'contact' | 'hazard',
      ) => void)
    | null
  /** Instantly kill the player using controller-owned presentation. */
  onKillPlayer: (() => void) | null
  /** Blow up / fail the lander run from a combat minigame. */
  onDestroyLander: ((cause: 'exterminate' | 'rescue' | 'bunker') => void) | null
  /** Shared objective explosion presentation hook. */
  onExplosion: ((kind: 'exterminate' | 'rescue', x: number, y: number, z: number) => void) | null
  /** Rescue-specific fail overlay hook. */
  onRescueFail: ((objectiveIndex: number, cause: string) => void) | null
  /** Fired by RescueMinigame when a hostage dies (combat or extraction). */
  onSurvivorLost: ((aliveRemaining: number) => void) | null
  /** Fired by RescueMinigame when a recruited walker boards the lander. */
  onSurvivorAboard: ((aboardCount: number) => void) | null
  /**
   * Fired by RescueMinigame when an incapacitated hostage is revived by a SCI
   * heal bolt. Argument: alive-not-aboard count after the revive.
   */
  onSurvivorRevived: ((aliveRemaining: number) => void) | null
  /** Install the combat loot/drop observer on a newly created combat minigame. */
  onInstallCombatDropObserver:
    | ((minigame: ExterminateMinigame | RescueMinigame | BunkerMinigame) => void)
    | null
  /** Attempt to open a loot chest based on bunker tier. Returns true if granted. */
  onLootChest: ((tier: string) => boolean) | null
  /** Register static objective prop colliders after minigames create their scene props. */
  onRegisterObjectiveColliders: ((colliders: readonly WorldCollider[]) => void) | null
  /**
   * Fired once when the Yamada organ dispense beat completes in a bunker-extract mission.
   * Task 5.2 wires the real handler (inventory grant + mission flag). `null` or omitted
   * for non-Yamada bunker runs.
   */
  onOrganDispensed?: (() => void) | null
}

/**
 * Dependencies required to create all objective minigames for a mission.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export interface LevelMinigameInitParams {
  /** Resolved mission whose objectives should spawn minigames. */
  mission: GeneratedAsteroidMission
  /** Shared level scene that owns minigame props/controllers. */
  scene: Scene
  /** Asteroid render root used by science minigame scan effects. */
  asteroidRoot?: Object3D | null
  /** Heightmap used by objective props and AI placement. */
  heightmap: Heightmap
  /** Player projectile system, required by combat rescue/exterminate logic. */
  projectileSystem: ProjectileSystem
  /** Optional rock yield system for gather objectives. */
  rockYieldSystem: RockYieldSystem | null
  /** Asteroid mineral composition for gather objectives. */
  composition: readonly MineralEntry[]
  /** Deterministic mission seed used by survey/gather setup. */
  missionSeed: number
  /**
   * Crater placement chosen at level boot for the DAN objective, when one is
   * present. Required to construct {@link DanMinigame}. Null when the mission
   * has no DAN objective.
   */
  danCraterPlacement?: DanCraterPlacement | null
  /**
   * Shared enemy point-light pool from {@link LevelViewController}. Threaded
   * to combat minigames so spawned enemies borrow pre-allocated slots and
   * never grow scene-wide `NUM_POINT_LIGHTS` (which would recompile every
   * lit material in the scene). Optional — minigames that have not been
   * migrated fall back to per-enemy lights.
   */
  enemyLightPool?: import('@/three/EnemyLightPool').EnemyLightPool | null
  /**
   * Shared enemy controller pool owned by {@link LevelViewController}. Combat
   * minigames borrow Bacteriophage/Spire/Chimera controllers from this pool
   * instead of allocating fresh ones — the pool is prewarmed during the level
   * precompile pass so the first enemy of the run never hitches.
   */
  enemyControllerPool: import('@/three/EnemyControllerPool').EnemyControllerPool
  /** Controller-owned callback bindings. */
  bindings: LevelMinigameBindings
}

/**
 * Thin facade around level minigame session bookkeeping.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export class LevelMinigameFacade {
  private readonly minigames: MiniGame[] = []

  /**
   * Create and register all objective minigames for a resolved mission.
   *
   * This owns the objective-type switch and the repetitive callback wiring,
   * while the host controller retains ownership of the actual side effects
   * triggered by those callbacks.
   *
   * @param params - Mission dependencies and controller bindings.
   */
  async initializeObjectives(params: LevelMinigameInitParams): Promise<void> {
    this.dispose()

    const {
      mission,
      scene,
      asteroidRoot,
      heightmap,
      projectileSystem,
      rockYieldSystem,
      composition,
      missionSeed,
      danCraterPlacement,
      enemyLightPool,
      enemyControllerPool,
      bindings,
    } = params
    const objectiveColliders: WorldCollider[] = []

    for (let i = 0; i < mission.objectives.length; i++) {
      const objective = mission.objectives[i]!

      if (objective.type === 'survey') {
        const minigame = new SurveyMinigame(i, objective, scene, heightmap, missionSeed)
        this.applySharedBindings(minigame, bindings)
        minigame.onRefuel = bindings.onSurveyRefuel
        minigame.onRegisterTickable = bindings.onRegisterTickable
        minigame.onUnregisterTickable = bindings.onUnregisterTickable
        minigame.onProbeCollect = bindings.onSurveyProbeCollect
        objectiveColliders.push(...(minigame.worldColliders ?? []))
        this.add(minigame)
      } else if (objective.type === 'photometry') {
        const minigame = new PhotometryMinigame(
          i,
          objective,
          scene,
          heightmap,
          missionSeed,
          asteroidRoot ?? null,
        )
        this.applySharedBindings(minigame, bindings)
        minigame.onRefuel = bindings.onSurveyRefuel
        minigame.onRegisterTickable = bindings.onRegisterTickable
        minigame.onUnregisterTickable = bindings.onUnregisterTickable
        minigame.onProbeCollect = bindings.onSurveyProbeCollect
        minigame.onScanAudioState = bindings.onPhotometryScanAudioState
        objectiveColliders.push(...(minigame.worldColliders ?? []))
        this.add(minigame)
      } else if (objective.type === 'dan') {
        if (!danCraterPlacement) {
          throw new Error(
            '[LevelMinigameFacade] dan objective requires danCraterPlacement on init params',
          )
        }
        const minigame = new DanMinigame({
          objectiveIndex: i,
          objective,
          scene,
          heightmap,
          craterPlacement: danCraterPlacement,
          projectileSystem,
          seed: missionSeed,
          lightPool: enemyLightPool ?? null,
          enemyControllerPool,
        })
        this.applySharedBindings(minigame, bindings)
        minigame.onRefuel = bindings.onSurveyRefuel
        minigame.onRegisterTickable = bindings.onRegisterTickable
        minigame.onUnregisterTickable = bindings.onUnregisterTickable
        minigame.onScanAudioState = bindings.onDanScanAudioState
        minigame.onParticleHit = bindings.onDanParticleHit
        minigame.onCompletionPulse = bindings.onDanCompletionPulse
        // Viroid contact damage flows through the standard combat damage pipe
        // so the lander HUD's red flash + knockback feedback fires.
        minigame.onDamagePlayer = bindings.onDamagePlayer
        objectiveColliders.push(...(minigame.worldColliders ?? []))
        this.add(minigame)
      } else if (objective.type === 'exterminate') {
        const minigame = await ExterminateMinigame.create(
          i,
          objective,
          scene,
          heightmap,
          projectileSystem,
          mission.difficulty,
        )
        this.applySharedBindings(minigame, bindings)
        minigame.onDamagePlayer = bindings.onDamagePlayer
        minigame.onKillPlayer = bindings.onKillPlayer
        minigame.onDestroyLander = () => bindings.onDestroyLander?.('exterminate')
        minigame.onExplosion = (position) =>
          bindings.onExplosion?.('exterminate', position.x, position.y, position.z)
        bindings.onInstallCombatDropObserver?.(minigame)
        this.add(minigame)
      } else if (objective.type === 'rescue') {
        const minigame = await RescueMinigame.create(
          i,
          objective,
          scene,
          heightmap,
          projectileSystem,
          mission.difficulty,
          enemyControllerPool,
        )
        this.applySharedBindings(minigame, bindings)
        minigame.onDamagePlayer = bindings.onDamagePlayer
        minigame.onKillPlayer = bindings.onKillPlayer
        minigame.onDestroyLander = () => bindings.onDestroyLander?.('rescue')
        minigame.onExplosion = (position) =>
          bindings.onExplosion?.('rescue', position.x, position.y, position.z)
        minigame.onFail = bindings.onRescueFail
        minigame.onSurvivorLost = bindings.onSurvivorLost
        minigame.onSurvivorAboard = bindings.onSurvivorAboard
        minigame.onSurvivorRevived = bindings.onSurvivorRevived
        bindings.onInstallCombatDropObserver?.(minigame)
        this.add(minigame)
      } else if (objective.type === 'bunker') {
        const minigame = await BunkerMinigame.create({
          objectiveIndex: i,
          objective,
          missionId: mission.id,
          factionTint: tintForGiver(mission.giverId),
          threeScene: scene,
          projectileSystem,
          difficulty: mission.difficulty,
          lightPool: enemyLightPool ?? null,
          missionArchetype: mission.yamada?.archetype,
        })
        this.applySharedBindings(minigame, bindings)
        minigame.onDamagePlayer = bindings.onDamagePlayer
        minigame.onKillPlayer = bindings.onKillPlayer
        minigame.onDestroyLander = () => bindings.onDestroyLander?.('bunker')
        minigame.onFail = bindings.onRescueFail // reuse rescue's fail pipeline
        minigame.onLootChest = bindings.onLootChest
        // Task 5.2 will register the real handler; stub is a no-op for now.
        minigame.onOrganDispensed = bindings.onOrganDispensed ?? undefined
        bindings.onInstallCombatDropObserver?.(minigame)
        this.add(minigame)
      } else if (objective.type === 'collect') {
        const minigame = new CollectMinigame(i, objective, scene, heightmap)
        this.applySharedBindings(minigame, bindings)
        this.add(minigame)
      } else if (objective.type === 'gather' && rockYieldSystem) {
        const minigame = new GatherMinigame({
          objectiveIndex: i,
          objective,
          scene,
          heightmap,
          composition,
          difficulty: mission.difficulty,
          seed: missionSeed,
          rockYieldSystem,
        })
        this.applySharedBindings(minigame, bindings)
        this.add(minigame)
      } else if (objective.type === 'mineral-analysis' && rockYieldSystem) {
        const minigame = new MineralAnalysisMinigame({
          objectiveIndex: i,
          objective,
          scene,
          heightmap,
          rockYieldSystem,
        })
        this.applySharedBindings(minigame, bindings)
        this.add(minigame)
      }
    }
    bindings.onRegisterObjectiveColliders?.(objectiveColliders)
  }

  /**
   * Register a freshly created objective minigame with the active level run.
   *
   * @param minigame - Objective minigame instance.
   */
  add(minigame: MiniGame): void {
    this.minigames.push(minigame)
  }

  /**
   * Look up a minigame by objective index.
   *
   * @param objectiveIndex - Mission objective index.
   * @returns Matching minigame, if one exists.
   */
  getByObjectiveIndex(objectiveIndex: number): MiniGame | undefined {
    return this.minigames.find((minigame) => minigame.objectiveIndex === objectiveIndex)
  }

  /**
   * Get the first active minigame for shared HUD telemetry.
   *
   * @returns Active minigame, if any.
   */
  getActive(): MiniGame | undefined {
    return this.minigames.find((minigame) => minigame.status === 'active')
  }

  /**
   * Live enemy count summed across every registered minigame. Returns 0 when
   * no combat minigame is active. Used by the debug HUD aggregator.
   *
   * @returns Sum of `enemyCount` across all registered minigames.
   */
  get enemyCount(): number {
    let total = 0
    for (const minigame of this.minigames) {
      total += minigame.enemyCount ?? 0
    }
    return total
  }

  /**
   * Whether every registered objective minigame has completed.
   *
   * Returns false when no minigames were registered so the level cannot
   * accidentally auto-complete a mission with zero objective sessions.
   *
   * @returns True when all minigames are complete.
   */
  areAllComplete(): boolean {
    if (this.minigames.length === 0) return false
    return this.minigames.every((minigame) => minigame.status === 'completed')
  }

  /**
   * Notify every minigame that one of its enemies may have been hit.
   *
   * Minigames that do not own enemies can ignore the signal by leaving
   * `notifyEnemyHit` undefined.
   *
   * @param enemy - Enemy instance that was hit.
   */
  notifyEnemyHit(enemy: Enemy): void {
    for (const minigame of this.minigames) {
      minigame.notifyEnemyHit?.(enemy)
    }
  }

  /**
   * Run one minigame frame for every registered session.
   *
   * Also clears the terminal prompt when the player is in EVA but no
   * minigame reports an interaction in range.
   *
   * @param dt - Frame delta time in seconds.
   * @param state - Controller snapshot for this frame.
   * @param onTerminalPrompt - Prompt sink used by the level HUD.
   */
  tick(
    dt: number,
    state: LevelMinigameTickState,
    onTerminalPrompt: ((text: string | null) => void) | null,
  ): void {
    const context = this.buildContext(state)
    for (const minigame of this.minigames) {
      minigame.tick(dt, context)
    }

    if (
      (context.levelState === 'eva' || context.levelState === 'bunker-interior') &&
      !this.minigames.some((minigame) => minigame.isPlayerNearInteraction)
    ) {
      onTerminalPrompt?.(null)
    }
  }

  /**
   * Dispose every registered minigame and clear the active run state.
   */
  dispose(): void {
    for (const minigame of this.minigames) {
      minigame.dispose()
    }
    this.minigames.length = 0
  }

  /**
   * Build the shared minigame frame context from controller-owned runtime state.
   *
   * @param state - Current level/frame snapshot.
   * @returns Context object consumed by all minigame implementations.
   */
  private buildContext(state: LevelMinigameTickState): MiniGameContext {
    return {
      levelState: state.levelState,
      landerPosition: state.landerPosition,
      landerForward: state.landerForward,
      landerUp: state.landerUp,
      landerGrounded: state.landerGrounded,
      playerPosition: state.playerPosition,
      playerForward: state.playerForward,
      interactPressed: state.interactPressed,
      terminalInteractPressed: state.terminalInteractPressed,
      terminalInteractHeld: state.terminalInteractHeld,
    }
  }

  /**
   * Apply the shared prompt/completion/tracker bindings common to every minigame.
   *
   * @param minigame - Newly created objective minigame.
   * @param bindings - Controller-owned callback bindings.
   */
  private applySharedBindings(
    minigame: Pick<MiniGame, 'objectiveIndex'> & {
      onPrompt: ((text: string | null) => void) | null
      onComplete: ((objectiveIndex: number) => void) | null
      onStepChange: ((objectiveIndex: number, steps: readonly MiniGameStep[]) => void) | null
    },
    bindings: LevelMinigameBindings,
  ): void {
    minigame.onPrompt = bindings.onPrompt
    minigame.onComplete = bindings.onComplete
    minigame.onStepChange = bindings.onStepChange
  }
}
