/**
 * DAN runtime encounter minigame.
 *
 * Land at a real crater, interact with the terminal to start a 45-second
 * neutron scan, capture neutron returns with the SCI multitool while LASER
 * defends the parked lander from viroid pressure, then walk back to the
 * terminal to deliver telemetry. Mirrors {@link PhotometryMinigame}'s
 * "deliver to terminal" pattern with partial-credit rewards interpolated
 * by capture quality.
 *
 * @author guinetik
 * @date 2026-04-28
 * @spec docs/superpowers/specs/2026-04-27-dan-mission-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type {
  MiniGame,
  MiniGameStatus,
  MiniGameContext,
  MiniGameEvents,
  MiniGameStep,
} from './MiniGame'
import type { ConcreteObjective, DanPressureTier } from '@/lib/missions/types'
import type { Heightmap } from '@/lib/terrain/heightmap'
import type { ProjectileSystem } from '@/lib/fps/projectileSystem'
import type { WorldCollider } from '@/lib/physics/worldCollision'
import type { DanCraterPlacement } from '@/lib/level/danCraterPlacement'
import { TerminalModel, TERMINAL_INTERACT_RANGE } from '@/three/TerminalModel'
import { DanScanController } from '@/three/DanScanController'
import { EnemyDirector, type EnemyHandle } from '@/lib/fps/enemyDirector'
import { BacteriophageController, PHAGE_HIT_CENTER_Y } from '@/three/BacteriophageController'
import type { EnemyControllerPool } from '@/three/EnemyControllerPool'
import type { EnemyLightPool } from '@/three/EnemyLightPool'

/** Default DAN scan duration when the objective omits it. Seconds. */
const DEFAULT_DAN_SCAN_DURATION_SECONDS = 45

/**
 * Default required particle hits when the objective omits it. Halved from
 * the original 50 because SCI bolts cost RTG, and 50 captures inside a
 * 45-second window left almost no margin for missed shots — playtest
 * showed the score basically required full meter cap with optimal aim.
 * 25 keeps the scan tense without forcing perfect play.
 */
const DEFAULT_DAN_REQUIRED_PARTICLE_HITS = 25

/** Default grace seconds before viroid pressure begins after scan activation. */
const DEFAULT_DAN_ENEMY_GRACE_SECONDS = 9

/**
 * Minimum capture ratio (0–1) for a DAN delivery to count as completion.
 * Below this floor the scan fails with `'no-data-captured'` and the player
 * can retry from the terminal — preserves a quality floor so a no-fire
 * walk-back does not award the rewardMin floor.
 */
export const DAN_MIN_QUALITY_FOR_COMPLETION = 0.05

/**
 * Maximum XZ distance from the lander to the terminal at which the player
 * can press [E] to start the scan. Mirrors the rescue-mission landing
 * discipline — players must commit to parking at the crater before they
 * can EVA out and trigger the encounter, otherwise nothing prevents them
 * from cheesing the scan from a safer parking spot far from the bowl.
 *
 * Sized for the default crater layout: lander parks at the crater center
 * and the terminal is `TERMINAL_OFFSET_X` units away. 50 units gives the
 * pilot a comfortable margin around the natural park spot — enough to
 * forgive a sloppy touchdown without letting the player set up shop on
 * the rim and EVA in.
 */
export const DAN_LANDER_TO_TERMINAL_MAX_DISTANCE = 50

/** HUD prompt shown at the terminal when the lander is parked too far away. */
const DAN_INSTRUCTION_PARK_LANDER = 'PARK LANDER NEAR DAN TERMINAL'

/**
 * Flair message flashed on the DAN HUD when a viroid spawns. The DAN scan
 * fires neutrons that read across the asteroid surface as albedo — the
 * lore hook is that this signal attracts viroid attention. Reads to the
 * player as "something just happened, look up".
 */
const DAN_INSTRUCTION_VIROID_ALERT = 'THE ALBEDO OF NEUTRONS ATTRACTS A NEARBY VIROID'

/** Seconds the viroid-alert flair stays on the HUD before reverting to the scan instruction. */
const DAN_VIROID_ALERT_DURATION_SECONDS = 3

/**
 * Per-tier viroid spawn budget. The DAN scan attracts a small number of
 * viroids over the course of the window — atmosphere/pressure rather than
 * a full combat encounter. `zeroChance` lets some scans resolve clean
 * (no spawns at all) so the tension feels rolled rather than scripted.
 */
interface DanSpawnBudget {
  /** Min/max enemies rolled when a non-zero spawn budget hits. */
  countRange: [number, number]
  /** Probability the encounter rolls a flat zero (no viroids). */
  zeroChance: number
}

/** Spawn budget presets keyed on the objective's enemyTier. */
const DAN_SPAWN_BUDGET_BY_TIER: Record<DanPressureTier, DanSpawnBudget> = {
  low: { countRange: [1, 2], zeroChance: 0.4 },
  medium: { countRange: [2, 3], zeroChance: 0.25 },
  high: { countRange: [3, 4], zeroChance: 0.1 },
}

/**
 * Multiplier applied to crater radius when picking a viroid spawn point on
 * the rim. Slightly outside the bowl so viroids descend toward the player
 * rather than spawning right on top of them.
 */
const DAN_VIROID_RIM_RADIUS_MULTIPLIER = 1.05

/** Earliest fraction of the scan window where viroid spawns can begin (after grace). */
const DAN_VIROID_SPAWN_WINDOW_START_FRACTION = 0.25

/**
 * Latest fraction of the scan window where viroid spawns can end. Late
 * spawns are unfair — leaves no time to engage before the timer closes.
 */
const DAN_VIROID_SPAWN_WINDOW_END_FRACTION = 0.85

/** Terminal X offset from the crater center, matching photometry's footprint. */
const TERMINAL_OFFSET_X = 14

/** EVA terminal prompt shown when standing at the terminal pre-scan. */
const DAN_INSTRUCTION_PRESCAN = '[E] START DAN SCAN'

/** Lander/EVA HUD instruction shown before the scan starts. */
const DAN_INSTRUCTION_LOCATE_TERMINAL = 'EVA TO DAN TERMINAL TO START SCAN'

/**
 * Lander/EVA HUD instruction shown while the scan window is active. Tells the
 * player exactly which tool they need — SCI bolts capture neutrons, all other
 * multitool modes pass through them.
 */
const DAN_INSTRUCTION_SCAN_RUNNING = 'SHOOT NEUTRONS WITH SCI MULTITOOL'

/** Lander/EVA HUD instruction shown after the scan window closes, before delivery. */
const DAN_INSTRUCTION_RETURN_TELEMETRY = 'RETURN DAN TELEMETRY TO TERMINAL'

/** EVA terminal prompt shown when ready to deliver. */
const DAN_INSTRUCTION_DELIVER = '[E] DELIVER DAN TELEMETRY'

/** EVA terminal prompt shown after a failure that permits a retry. */
const DAN_INSTRUCTION_RETRY = '[E] RETRY DAN SCAN'

/** Lander/EVA HUD instruction shown after a no-data failure, on the way back to the terminal. */
const DAN_INSTRUCTION_RETRY_HUD = 'RETRY DAN SCAN AT TERMINAL'

/** Failure cause exposed by the minigame. */
export type DanFailureReason = 'lander-destroyed' | 'player-died' | 'no-data-captured'

/**
 * Internal phase tracking inside `DanMinigame`. Public `MiniGameStatus`
 * collapses `scanning` and `awaiting-delivery` into `'active'` because the
 * shared base interface does not model the post-window walk-back.
 */
type DanPhase = 'idle' | 'scanning' | 'awaiting-delivery' | 'completed' | 'failed'

/**
 * Audio frame emitted by {@link DanMinigame.onScanAudioState} so the level
 * audio director can drive the scan hum and pulse cues.
 *
 * @author guinetik
 * @date 2026-04-28
 */
export interface DanScanAudioState {
  /** True while the scan beam is rendered (active or fading out). */
  visible: boolean
  /** Capture progress fraction in `[0, 1]`. */
  intensity: number
  /** Estimated particle spawn rate in particles per second. */
  particleSpawnRate: number
}

/**
 * Tuning bundle for one DAN pressure tier. Drives particle pacing in the
 * scan controller and enemy spawn pacing in the level director.
 *
 * @author guinetik
 * @date 2026-04-28
 */
export interface DanTierTuning {
  /** Probability per tick interval that a single particle spawns. `[0, 1]`. */
  particleSpawnProbability: number
  /** Independent probability per tick that an extra burst (2 particles) spawns. `[0, 1]`. */
  particleBurstChance: number
  /** Lower bound of particle initial speed in world units/sec. */
  particleSpeedMin: number
  /** Upper bound of particle initial speed in world units/sec. */
  particleSpeedMax: number
  /** Lower bound of particle lifetime in seconds. */
  particleLifetimeMin: number
  /** Upper bound of particle lifetime in seconds. */
  particleLifetimeMax: number
  /** Tick cadence for spawn rolls, in seconds. */
  tickIntervalSeconds: number
  /** Probability per enemy roll interval that a viroid spawns (after grace). `[0, 1]`. */
  enemySpawnProbability: number
}

/**
 * Fixed tier presets for DAN particle + enemy pressure. Speeds are tuned
 * for the ~zero asteroid gravity in {@link DanScanController}: particles
 * launch from the bowl floor and travel outward to space rather than
 * arcing back. Lifetimes are sized so the player has time to track each
 * neutron with the SCI multitool before it drifts out of reach.
 */
export const DAN_TIER_TUNING: Record<DanPressureTier, DanTierTuning> = {
  low: {
    particleSpawnProbability: 0.45,
    particleBurstChance: 0.1,
    particleSpeedMin: 4,
    particleSpeedMax: 7,
    particleLifetimeMin: 9,
    particleLifetimeMax: 13,
    tickIntervalSeconds: 0.3,
    enemySpawnProbability: 0.15,
  },
  medium: {
    particleSpawnProbability: 0.65,
    particleBurstChance: 0.18,
    particleSpeedMin: 5,
    particleSpeedMax: 9,
    particleLifetimeMin: 8,
    particleLifetimeMax: 12,
    tickIntervalSeconds: 0.25,
    enemySpawnProbability: 0.28,
  },
  high: {
    particleSpawnProbability: 0.85,
    particleBurstChance: 0.32,
    particleSpeedMin: 6,
    particleSpeedMax: 11,
    particleLifetimeMin: 7,
    particleLifetimeMax: 10,
    tickIntervalSeconds: 0.2,
    enemySpawnProbability: 0.45,
  },
}

/**
 * Constructor parameters for {@link DanMinigame}. Mirrors photometry but
 * threads the crater placement chosen at level boot so the encounter knows
 * where to anchor the terminal, scan beam, and particle bowl.
 *
 * @author guinetik
 * @date 2026-04-28
 */
export interface DanMinigameInitParams {
  /** Mission objective index in the parent mission. */
  objectiveIndex: number
  /** Concrete DAN objective (must have `type === 'dan'`). */
  objective: ConcreteObjective
  /** Three.js scene receiving the terminal and scan visuals. */
  scene: THREE.Scene
  /** Heightmap used to ground the terminal and sample the bowl floor. */
  heightmap: Heightmap
  /** Crater placement chosen by `chooseDanCraterPlacement` at level boot. */
  craterPlacement: DanCraterPlacement
  /** Player projectile system used by particle hit registration. */
  projectileSystem: ProjectileSystem
  /** Deterministic mission seed for spawn jitter. */
  seed: number
  /**
   * Optional shared enemy point-light pool. When supplied, spawned viroids
   * borrow point-light slots from the level pool instead of allocating new
   * lights — keeping `NUM_POINT_LIGHTS` pinned and avoiding the lit-material
   * recompile stall that otherwise hits on every viroid spawn.
   */
  lightPool?: EnemyLightPool | null
  /**
   * Shared enemy controller pool. DAN borrows pre-warmed `BacteriophageController`
   * instances from this pool — allocating fresh controllers at spawn time would
   * hit driver-side VAO/program first-use stalls (~hundreds of ms) every time
   * a viroid appears during the scan.
   */
  enemyControllerPool: EnemyControllerPool
}

/**
 * DAN runtime encounter state machine.
 *
 * Phases: `idle → active → awaitingDelivery → completed`, with `failed`
 * branches off `active`/`awaitingDelivery`. Failure permits retry from the
 * terminal mirroring photometry's `[E] RETRY` flow.
 *
 * @author guinetik
 * @date 2026-04-28
 */
export class DanMinigame implements MiniGame, MiniGameEvents {
  readonly objectiveIndex: number

  private _phase: DanPhase = 'idle'
  private _timeRemaining: number
  private _isPlayerNear = false
  private particleHits = 0
  private readonly requiredHits: number
  private readonly scanDuration: number
  private readonly graceSeconds: number
  private graceRemaining = 0
  private failureReason: DanFailureReason | null = null
  private readonly _steps: MiniGameStep[] = [
    { label: 'Locate the DAN terminal', complete: false, active: true },
    { label: 'Press [E] to start the DAN scan', complete: false, active: false },
    { label: 'Shoot neutrons with the SCI multitool', complete: false, active: false },
    { label: 'Return DAN telemetry to the terminal', complete: false, active: false },
  ]

  private readonly objective: ConcreteObjective
  private readonly scene: THREE.Scene
  private readonly heightmap: Heightmap
  private readonly projectileSystem: ProjectileSystem
  private readonly seed: number
  private readonly placement: DanCraterPlacement
  private readonly tuning: DanTierTuning
  private readonly terminal: TerminalModel
  /**
   * Shared point-light pool spawned viroids borrow from. `null` falls back
   * to per-enemy lights — preserves backward compatibility for callers that
   * have not threaded the level pool through.
   */
  private readonly lightPool: EnemyLightPool | null
  private readonly enemyControllerPool: EnemyControllerPool
  /** Static collision volumes owned by this DAN objective. */
  readonly worldColliders: readonly WorldCollider[]

  private scanController: DanScanController | null = null
  private readonly enemyDirector = new EnemyDirector()
  private readonly viroidControllers = new Map<number, BacteriophageController>()
  /** Sorted seconds-into-scan when the next viroid spawn fires. */
  private spawnSchedule: number[] = []
  /** Seconds remaining on the viroid-alert flair message; 0 = not flashing. */
  private viroidAlertRemaining = 0
  /** Mulberry32 state — seeded from mission seed so spawn rolls stay deterministic per run. */
  private rngState: number

  /** Refuel callback — called when the scan starts, mirrors photometry. */
  onRefuel: (() => void) | null = null

  /** Damage routing — fires when a viroid contacts the EVA player. */
  onDamagePlayer:
    | ((
        damage: number,
        sourceX: number,
        sourceZ: number,
        source?: 'projectile' | 'contact' | 'hazard',
      ) => void)
    | null = null

  /** Register a transient tickable owned by this minigame (the scan controller). */
  onRegisterTickable: ((tickable: Tickable) => void) | null = null

  /** Unregister the scan controller tickable when scanning ends. */
  onUnregisterTickable: ((tickable: Tickable) => void) | null = null

  /** Audio sink for the procedural DAN scan hum. */
  onScanAudioState: ((state: DanScanAudioState) => void) | null = null

  /** One-shot cue fired each time SCI bolts capture a neutron particle. */
  onParticleHit: (() => void) | null = null

  /** One-shot cue fired when delivery succeeds and the completion pulse triggers. */
  onCompletionPulse: (() => void) | null = null

  // ── MiniGameEvents ──────────────────────────────────────────
  onPrompt: ((text: string | null) => void) | null = null
  onComplete: ((objectiveIndex: number) => void) | null = null
  onStepChange: ((objectiveIndex: number, steps: readonly MiniGameStep[]) => void) | null = null

  /**
   * Construct a DAN encounter for one objective.
   *
   * @param params - Mission objective + scene + crater context.
   */
  constructor(params: DanMinigameInitParams) {
    this.objectiveIndex = params.objectiveIndex
    this.objective = params.objective
    this.scene = params.scene
    this.heightmap = params.heightmap
    this.placement = params.craterPlacement
    this.projectileSystem = params.projectileSystem
    this.seed = params.seed
    this.lightPool = params.lightPool ?? null
    this.enemyControllerPool = params.enemyControllerPool
    const particleTier: DanPressureTier = params.objective.particleTier ?? 'medium'
    this.tuning = DAN_TIER_TUNING[particleTier]
    this.scanDuration = params.objective.scanDurationSeconds ?? DEFAULT_DAN_SCAN_DURATION_SECONDS
    this.requiredHits = params.objective.requiredParticleHits ?? DEFAULT_DAN_REQUIRED_PARTICLE_HITS
    this.graceSeconds = params.objective.enemyGraceSeconds ?? DEFAULT_DAN_ENEMY_GRACE_SECONDS
    this._timeRemaining = this.scanDuration

    // Place the terminal a short walk from the crater center so the player has
    // a clear sightline to the bowl while interacting.
    const craterX = params.craterPlacement.crater.x
    const craterZ = params.craterPlacement.crater.z
    const terminalX = craterX + TERMINAL_OFFSET_X
    const terminalY = params.heightmap.heightAt(terminalX, craterZ)
    this.terminal = new TerminalModel()
    this.terminal.placeAt(terminalX, terminalY, craterZ)
    this.worldColliders = [
      this.terminal.createWorldCollider(`dan-terminal-${params.objectiveIndex}`),
    ]
    this.scene.add(this.terminal.group)

    this.rngState = Math.max(1, Math.floor(params.seed + params.objectiveIndex) | 0)

    // Viroid contact damage routes through the standard combat damage pipe so
    // the level controller's existing red-flash + knockback feedback fires.
    this.enemyDirector.onContactDamage = (handle, damage) => {
      if (!handle.enemy.alive) return
      this.onDamagePlayer?.(damage, handle.enemy.position.x, handle.enemy.position.z, 'contact')
    }
  }

  /** Current minigame status — collapses scan + awaiting-delivery into `'active'`. */
  get status(): MiniGameStatus {
    if (this._phase === 'idle') return 'idle'
    if (this._phase === 'completed') return 'completed'
    if (this._phase === 'failed') return 'failed'
    return 'active'
  }

  /** Internal phase, exposed for tests and the level controller. */
  get phase(): DanPhase {
    return this._phase
  }

  /** Whether the post-window walk-back is in progress. */
  get isAwaitingDelivery(): boolean {
    return this._phase === 'awaiting-delivery'
  }

  /**
   * True while the EVA player is within terminal interaction range, or a
   * viroid-alert flair is currently flashing. The flair branch keeps the
   * shared facade from clearing the bottom terminal prompt mid-flash —
   * the alert reads on the same UI element as the [E] interact prompts,
   * so it must survive even when the player is far from the terminal.
   */
  get isPlayerNearInteraction(): boolean {
    return this._isPlayerNear || this.viroidAlertRemaining > 0
  }

  /**
   * Time remaining in the active scan window, in seconds. Returns `0` (not
   * null) during `awaiting-delivery` so the lander HUD stays mounted with
   * its mission instruction visible while the player walks back to the
   * terminal — the survey HUD gates on `timeRemaining !== null`, and a null
   * here would hide both the timer and the deliver-telemetry instruction.
   */
  get timeRemaining(): number | null {
    if (this._phase === 'scanning') return this._timeRemaining
    if (this._phase === 'awaiting-delivery') return 0
    return null
  }

  /** Particle capture count, exposed via the shared `survey*` HUD field. */
  get progressCurrent(): number | null {
    if (this._phase === 'idle' || this._phase === 'completed') return null
    return this.particleHits
  }

  /** Required particle hits, exposed via the shared `survey*` HUD field. */
  get progressTotal(): number | null {
    if (this._phase === 'idle' || this._phase === 'completed') return null
    return this.requiredHits
  }

  /** Ordered tracker steps. */
  get steps(): readonly MiniGameStep[] {
    return this._steps
  }

  /**
   * Short instruction shown in the lander/EVA HUD across every encounter
   * phase so the player always knows the next action. The text is short
   * and imperative: it names the tool (SCI) and the target (NEUTRONS) so
   * a fresh player can read once and play.
   */
  get missionInstruction(): string | null {
    if (this._phase === 'completed') return null
    if (this._phase === 'idle') return DAN_INSTRUCTION_LOCATE_TERMINAL
    if (this._phase === 'failed') {
      return this.failureReason === 'no-data-captured' ? DAN_INSTRUCTION_RETRY_HUD : null
    }
    if (this._phase === 'scanning') return DAN_INSTRUCTION_SCAN_RUNNING
    return DAN_INSTRUCTION_RETURN_TELEMETRY
  }

  /** Retrieve the recorded failure reason, or `null` if none. */
  get failure(): DanFailureReason | null {
    return this.failureReason
  }

  /**
   * True while viroid pressure should be active — after the grace window has
   * expired and before the scan window closes. The level controller polls
   * this each frame to drive the enemy director.
   */
  get shouldSpawnEnemies(): boolean {
    return this._phase === 'scanning' && this.graceRemaining <= 0
  }

  /** Grace time remaining before viroid spawns can begin. */
  get enemyGraceRemaining(): number {
    return this.graceRemaining
  }

  /** Underlying scan controller — exposed so the level controller can wire callbacks. */
  get controller(): DanScanController | null {
    return this.scanController
  }

  /**
   * Per-frame update.
   *
   * @param dt - Delta time in seconds.
   * @param ctx - Shared minigame frame context from the level controller.
   */
  tick(dt: number, ctx: MiniGameContext): void {
    this.terminal.tick(dt)

    if (this._phase === 'scanning') {
      this.tickActive(dt, ctx)
    }

    this.tickTerminal(ctx)

    // Viroid alert flair overrides whatever tickTerminal just emitted —
    // shows on the bottom terminal-prompt UI for a few seconds after each
    // spawn so the player gets a diegetic heads-up regardless of whether
    // they happen to be standing next to the terminal at the moment.
    if (this.viroidAlertRemaining > 0) {
      this.onPrompt?.(DAN_INSTRUCTION_VIROID_ALERT)
    }
  }

  /** Begin or restart the DAN scan window. */
  start(): void {
    if (this._phase === 'scanning' || this._phase === 'awaiting-delivery') return
    this.cleanupScanController()
    this.resetSteps()
    this.advanceStep(0)
    this.advanceStep(1)
    this._phase = 'scanning'
    this._timeRemaining = this.scanDuration
    this.particleHits = 0
    this.graceRemaining = this.graceSeconds
    this.failureReason = null
    this.viroidAlertRemaining = 0
    this.objective.actualReward = undefined
    this.onRefuel?.()

    this.scanController = new DanScanController({
      scene: this.scene,
      craterX: this.placement.crater.x,
      craterY: this.heightmap.heightAt(this.placement.crater.x, this.placement.crater.z),
      craterZ: this.placement.crater.z,
      craterRadius: this.placement.crater.radius,
      craterDepth: this.placement.crater.depth,
      // Beam fires diagonally from the lander beacon roof down to the terminal
      // ground — looks like the lander is scanning the terminal site rather
      // than a vertical thruster column.
      beamTargetX: this.terminal.position.x,
      beamTargetY: this.terminal.position.y,
      beamTargetZ: this.terminal.position.z,
      particleTuning: this.tuning,
      projectileSystem: this.projectileSystem,
      onParticleHit: () => this.recordParticleHit(),
      seed: this.seed + this.objectiveIndex,
    })
    this.scanController.beginScan()
    this.onRegisterTickable?.(this.scanController)
    this.scheduleViroidSpawns()
    this.emitScanAudio(true)
  }

  /**
   * Roll a viroid spawn budget for this scan and distribute spawn times across
   * the back ~60% of the window. Some scans roll zero — keeps the encounter
   * tense without scripting every run identically.
   */
  private scheduleViroidSpawns(): void {
    this.spawnSchedule = []
    const enemyTier: DanPressureTier = this.objective.enemyTier ?? 'medium'
    const budget = DAN_SPAWN_BUDGET_BY_TIER[enemyTier]
    if (this.rng() < budget.zeroChance) return

    const [minCount, maxCount] = budget.countRange
    const count = minCount + Math.floor(this.rng() * (maxCount - minCount + 1))
    if (count <= 0) return

    const windowStart = Math.max(
      this.graceSeconds,
      this.scanDuration * DAN_VIROID_SPAWN_WINDOW_START_FRACTION,
    )
    const windowEnd = this.scanDuration * DAN_VIROID_SPAWN_WINDOW_END_FRACTION
    if (windowEnd <= windowStart) return

    for (let i = 0; i < count; i++) {
      this.spawnSchedule.push(windowStart + this.rng() * (windowEnd - windowStart))
    }
    this.spawnSchedule.sort((a, b) => a - b)
  }

  /**
   * Record one captured neutron particle. Called when a SCI projectile passes
   * through a registered DAN particle. No-op outside the active phase so a
   * stray bolt fired during awaitingDelivery cannot inflate capture quality.
   */
  recordParticleHit(): void {
    if (this._phase !== 'scanning') return
    this.particleHits++
    this.onParticleHit?.()
    this.emitScanAudio(true)
  }

  /**
   * Deliver telemetry at the terminal after the scan window closes. Computes
   * capture quality, stamps the partial-credit `actualReward`, and fires the
   * completion pulse.
   */
  deliver(): void {
    if (this._phase !== 'awaiting-delivery') return
    const quality = this.requiredHits > 0 ? Math.min(1, this.particleHits / this.requiredHits) : 0
    if (quality < DAN_MIN_QUALITY_FOR_COMPLETION) {
      this.failWithReason('no-data-captured')
      return
    }

    const rewardMax = this.objective.reward
    const rewardMin = this.objective.rewardMin ?? rewardMax
    const interpolated = rewardMin + (rewardMax - rewardMin) * quality
    this.objective.actualReward = Math.round(interpolated)

    this.advanceStep(3)
    this._phase = 'completed'
    this.scanController?.triggerCompletionPulse()
    this.onCompletionPulse?.()
    this.cleanupScanController()
    this.emitScanAudio(false)
    this.onPrompt?.(null)
    this.onComplete?.(this.objectiveIndex)
  }

  /**
   * Mark the scan as failed because the parked lander hull reached zero. The
   * level controller routes the existing fail UX; the player can retry the
   * scan from the terminal once the run has been recovered.
   */
  notifyLanderDestroyed(): void {
    if (this._phase !== 'scanning' && this._phase !== 'awaiting-delivery') return
    this.failWithReason('lander-destroyed')
  }

  /** Mark the scan as failed because the EVA suit reached zero HP. */
  notifyPlayerDied(): void {
    if (this._phase !== 'scanning' && this._phase !== 'awaiting-delivery') return
    this.failWithReason('player-died')
  }

  /** Tear down all 3D resources and clear callbacks. */
  dispose(): void {
    this.cleanupScanController()
    this.terminal.dispose()
    this.scene.remove(this.terminal.group)
  }

  /** Drive the timer and grace clock while the scan window is open. */
  private tickActive(dt: number, ctx: MiniGameContext): void {
    if (this._timeRemaining > 0) {
      this._timeRemaining = Math.max(0, this._timeRemaining - dt)
      this.graceRemaining = Math.max(0, this.graceRemaining - dt)
      if (this._timeRemaining <= 0) {
        // Window closes — particles stop, beam fades, viroid rolls stop. The
        // player still has to walk back to the terminal; this is NOT failure.
        this._phase = 'awaiting-delivery'
        this.scanController?.endScan()
        this.advanceStep(2)
        this.emitScanAudio(true) // beam still fading; audio handles its own fade
      }
    }

    if (ctx.landerPosition) {
      this.scanController?.setLanderAnchor(ctx.landerPosition, ctx.landerUp ?? null)
    }

    this.tickViroidSpawns(dt, ctx)
  }

  /** Fire any scheduled spawns whose time has come, then tick the director. */
  private tickViroidSpawns(dt: number, ctx: MiniGameContext): void {
    if (this.viroidAlertRemaining > 0) {
      this.viroidAlertRemaining = Math.max(0, this.viroidAlertRemaining - dt)
    }

    const elapsedScan = this.scanDuration - this._timeRemaining
    while (this.spawnSchedule.length > 0 && this.spawnSchedule[0]! <= elapsedScan) {
      this.spawnSchedule.shift()
      this.spawnViroidAtRim()
      this.viroidAlertRemaining = DAN_VIROID_ALERT_DURATION_SECONDS
    }

    if (ctx.playerPosition) {
      this.enemyDirector.setPlayerPosition(
        ctx.playerPosition.x,
        ctx.playerPosition.y,
        ctx.playerPosition.z,
      )
    }
    this.enemyDirector.tick(dt)

    for (const handle of this.enemyDirector.enemies) {
      this.syncViroidController(handle, dt)
    }
  }

  /** Spawn one bacteriophage viroid on the crater rim and wire it up. */
  private spawnViroidAtRim(): void {
    const angle = this.rng() * Math.PI * 2
    const r = this.placement.crater.radius * DAN_VIROID_RIM_RADIUS_MULTIPLIER
    const x = this.placement.crater.x + Math.cos(angle) * r
    const z = this.placement.crater.z + Math.sin(angle) * r
    const groundY = this.heightmap.heightAt(x, z)
    const handle = this.enemyDirector.spawn('bacteriophage', x, groundY, z)
    const ctrl = this.enemyControllerPool.acquirePhage(handle.enemy)
    if (!ctrl) {
      // Pool exhaustion — drop the spawn rather than allocating fresh (which
      // would pay the VAO + program first-use stall we're trying to avoid).
      // Capacity tuning lives on `LevelViewController.ENEMY_POOL_PHAGE_CAPACITY`.
      this.enemyDirector.despawn(handle)
      return
    }
    this.projectileSystem.addEnemy(handle.enemy)
    ctrl.group.position.set(x, groundY, z)
    this.viroidControllers.set(handle.id, ctrl)
  }

  /** Sync one viroid's visual controller to its director state; despawn on death. */
  private syncViroidController(handle: EnemyHandle, dt: number): void {
    const ctrl = this.viroidControllers.get(handle.id)
    if (!ctrl) return
    if (ctrl.deathComplete) {
      this.enemyControllerPool.releasePhage(ctrl)
      this.projectileSystem.removeEnemy(handle.enemy)
      this.enemyDirector.despawn(handle)
      this.viroidControllers.delete(handle.id)
      return
    }
    if (handle.enemy.alive) {
      ctrl.isMoving = handle.lastOutput.isMoving
      ctrl.isAgitated = handle.lastOutput.isAgitated
      ctrl.group.position.x = handle.enemy.position.x
      ctrl.group.position.z = handle.enemy.position.z
      const groundY = this.heightmap.heightAt(handle.enemy.position.x, handle.enemy.position.z)
      ctrl.group.position.y = groundY
      handle.enemy.position.y = groundY + PHAGE_HIT_CENTER_Y
      // Face the gait direction. Without this, the body translates but the
      // legs keep their fixed world-space angles — reads as "sliding" instead
      // of walking. Mirrors LevelDisturbanceDirector's phage sync.
      if (handle.lastOutput.isMoving) {
        const dir = handle.lastOutput.moveDir
        ctrl.group.rotation.y = Math.atan2(dir.x, dir.z)
      }
    }
    ctrl.tick(dt)
  }

  /** Drive the EVA terminal proximity prompt + interact handling. */
  private tickTerminal(ctx: MiniGameContext): void {
    this._isPlayerNear = false
    if (ctx.levelState !== 'eva' || !ctx.playerPosition) {
      if (this._phase === 'idle') this.onPrompt?.(null)
      return
    }

    const dx = ctx.playerPosition.x - this.terminal.position.x
    const dz = ctx.playerPosition.z - this.terminal.position.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist > TERMINAL_INTERACT_RANGE) {
      if (this._phase === 'idle') this.onPrompt?.(null)
      return
    }

    this._isPlayerNear = true
    this.advanceStep(0)

    if (this._phase === 'idle') {
      // Pre-scan also gates on the lander being parked nearby — players have
      // to commit to landing at the crater before they can EVA out and start
      // the scan, mirroring the rescue mission's landing discipline.
      if (!this.isLanderNearTerminal(ctx)) {
        this.onPrompt?.(DAN_INSTRUCTION_PARK_LANDER)
        return
      }
      this.onPrompt?.(DAN_INSTRUCTION_PRESCAN)
      if (ctx.terminalInteractPressed) this.start()
    } else if (this._phase === 'awaiting-delivery') {
      this.onPrompt?.(DAN_INSTRUCTION_DELIVER)
      if (ctx.terminalInteractPressed) this.deliver()
    } else if (this._phase === 'failed' && this.failureReason === 'no-data-captured') {
      if (!this.isLanderNearTerminal(ctx)) {
        this.onPrompt?.(DAN_INSTRUCTION_PARK_LANDER)
        return
      }
      this.onPrompt?.(DAN_INSTRUCTION_RETRY)
      if (ctx.terminalInteractPressed) this.start()
    }
  }

  /**
   * True while the lander is parked within {@link DAN_LANDER_TO_TERMINAL_MAX_DISTANCE}
   * of the DAN terminal on the XZ plane (vertical drift is ignored — the
   * encounter cares about parking footprint, not altitude). Falls back to
   * `false` when no lander telemetry is available so the gate fails closed.
   */
  private isLanderNearTerminal(ctx: MiniGameContext): boolean {
    if (!ctx.landerPosition) return false
    const dx = ctx.landerPosition.x - this.terminal.position.x
    const dz = ctx.landerPosition.z - this.terminal.position.z
    return Math.sqrt(dx * dx + dz * dz) <= DAN_LANDER_TO_TERMINAL_MAX_DISTANCE
  }

  /** Internal failure routing — preserves the first reason if multiple fire. */
  private failWithReason(reason: DanFailureReason): void {
    if (this.failureReason) return
    this.failureReason = reason
    this._phase = 'failed'
    this.objective.actualReward = 0
    this.cleanupScanController()
    this.emitScanAudio(false)
    this.onPrompt?.(null)
  }

  /** Mark a step complete and activate the next incomplete step. */
  private advanceStep(index: number): void {
    const step = this._steps[index]
    if (!step || step.complete) return
    step.complete = true
    step.active = false
    const next = this._steps.find((candidate) => !candidate.complete)
    if (next) next.active = true
    this.onStepChange?.(this.objectiveIndex, this._steps)
  }

  /** Reset all tracker steps for a retry. */
  private resetSteps(): void {
    for (const step of this._steps) {
      step.complete = false
      step.active = false
    }
    this._steps[0]!.active = true
  }

  /** Tear down the scan controller if one is active. */
  private cleanupScanController(): void {
    if (!this.scanController) return
    this.onUnregisterTickable?.(this.scanController)
    this.scanController.dispose()
    this.scanController = null
    this.cleanupViroids()
  }

  /** Despawn all viroids and dispose their controllers. */
  private cleanupViroids(): void {
    for (const ctrl of this.viroidControllers.values()) {
      this.enemyControllerPool.releasePhage(ctrl)
    }
    // Pull each enemy out of the projectile registry before the director
    // resets its handle list — `despawnAll` clears positions in place, so
    // walk a snapshot of enemy refs first.
    const enemyRefs = this.enemyDirector.enemies.map((handle) => handle.enemy)
    for (const enemy of enemyRefs) {
      this.projectileSystem.removeEnemy(enemy)
    }
    this.enemyDirector.despawnAll()
    this.viroidControllers.clear()
    this.spawnSchedule = []
  }

  /** Mulberry32 — small deterministic RNG seeded from the mission seed. */
  private rng(): number {
    let state = (this.rngState += 0x6d2b79f5)
    state = Math.imul(state ^ (state >>> 15), state | 1)
    state ^= state + Math.imul(state ^ (state >>> 7), state | 61)
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296
  }

  /** Emit a scan audio frame keyed on whether the beam should be audible. */
  private emitScanAudio(visible: boolean): void {
    const intensity = this.requiredHits > 0 ? Math.min(1, this.particleHits / this.requiredHits) : 0
    const spawnRate = visible
      ? this.tuning.particleSpawnProbability / this.tuning.tickIntervalSeconds
      : 0
    this.onScanAudioState?.({ visible, intensity, particleSpawnRate: spawnRate })
  }
}
