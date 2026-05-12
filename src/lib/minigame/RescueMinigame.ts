/**
 * Rescue minigame — land at the outbreak, keep survivors alive, then purge the virus.
 *
 * A floating virus infestation hovers over the objective site. Landing the lander inside
 * the flat zone releases hostages and spawns a local enemy response. The player must keep
 * at least one hostage alive, eliminate the attackers, heal the survivors to full, then
 * arm charges on the virus and evacuate the blast radius.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/asteroid-lander-gdd.md
 */
import * as THREE from 'three'
import type {
  MiniGame,
  MiniGameContext,
  MiniGameEvents,
  MiniGameMapMarker,
  MiniGameStatus,
  MiniGameStep,
} from './MiniGame'
import type { ConcreteObjective } from '@/lib/missions/types'
import { clearActiveMission } from '@/lib/missions/missionStorage'
import { Timer, type TimerHandle } from '@/lib/Timer'
import type { Heightmap } from '@/lib/terrain/heightmap'
import { FLAT_ZONE_RADIUS } from '@/lib/terrain/terrainGenerator'
import type { ProjectileSystem } from '@/lib/fps/projectileSystem'
import type { Hostage } from '@/lib/fps/hostage'
import { EnemyDirector, type EnemyHandle } from '@/lib/fps/enemyDirector'
import { EnemyProjectileSystem } from '@/lib/fps/enemyProjectileSystem'
import { EnemyTiltCache } from '@/lib/fps/enemyTiltCache'
import { EnemyLodApplier } from '@/lib/fps/enemyLodHelper'
import { spawnChimeraProjectileBurst } from '@/lib/fps/chimeraProjectileBurst'
import { VirusModel } from '@/three/VirusModel'
import { FpsHostageController } from '@/three/FpsHostageController'
import { HostageModel } from '@/three/HostageModel'
import { type BacteriophageController, PHAGE_HIT_CENTER_Y } from '@/three/BacteriophageController'
import { type SpireController, SPIRE_HIT_CENTER_Y } from '@/three/SpireController'
import {
  type ChimeraWalkerController,
  CHIMERA_HIT_CENTER_Y,
} from '@/three/ChimeraWalkerController'
import type { EnemyControllerPool } from '@/three/EnemyControllerPool'
import { EnemyProjectileMeshPool } from '@/three/EnemyProjectileMeshPool'
import { enemyVisualTierForDifficulty, type EnemyVisualTier } from '@/three/enemyVisualPalette'
import type { Enemy } from '@/lib/fps/enemy'

const VIRUS_SCALE = 600
const VIRUS_FLOAT_HEIGHT = 200
const VIRUS_BOB_AMPLITUDE = 1.2
const VIRUS_BOB_SPEED = 1.5
const VIRUS_ROTATION_SPEED = 0.4
const VIRUS_INTERACT_RANGE = 18
const LANDING_SITE_RADIUS = FLAT_ZONE_RADIUS * 0.88
const HOSTAGE_RING_MIN_RADIUS = 24
const HOSTAGE_RING_MAX_RADIUS = FLAT_ZONE_RADIUS * 0.82 * 0.72

/**
 * Maximum heightmap slope at which a hostage may spawn or that the path back to
 * the objective may cross. Mirrors `LEVEL_OBJECTIVE_CONFIG.maxSlope` so survivors
 * are always on terrain the objective placement system already trusts as walkable.
 */
const HOSTAGE_MAX_TERRAIN_SLOPE = 0.6

/**
 * Maximum vertical delta (world units) between a hostage and the rescue objective.
 * Rejects spawns sitting on plateaus or in pits the survivor could never traverse
 * back to the lander even with a flat path.
 */
const HOSTAGE_MAX_ELEVATION_DELTA = 18

/** Number of intermediate terrain samples taken between hostage and objective. */
const HOSTAGE_PATH_SAMPLES = 4

/** Random samples attempted at each ring radius before shrinking the band. */
const HOSTAGE_SAMPLES_PER_RING = 6

/** Number of times the outer radius is shrunk when no candidate is reachable. */
const HOSTAGE_RING_SHRINK_STEPS = 4

/** Multiplier applied to the outer radius each shrink step (0..1). */
const HOSTAGE_RING_SHRINK_FACTOR = 0.78

/**
 * Player-only enemy damage multiplier, banded to match the visual tier ramp
 * (default → medium → hard). Hostages always take base damage so survivors are
 * not massacred before the player can engage.
 */
const PLAYER_DAMAGE_MULTIPLIER_DEFAULT = 1
const PLAYER_DAMAGE_MULTIPLIER_MEDIUM = 1.5
const PLAYER_DAMAGE_MULTIPLIER_HARD = 2

/**
 * Resolve the player damage multiplier for the given visual tier. Mirrors the
 * enemy palette banding so yellow/medium enemies hit harder and magenta/hard
 * enemies hit hardest, matching the visual cue.
 *
 * @param tier - Visual tier resolved from mission difficulty.
 */
function playerDamageMultiplierForTier(tier: EnemyVisualTier): number {
  if (tier === 'hard') return PLAYER_DAMAGE_MULTIPLIER_HARD
  if (tier === 'medium') return PLAYER_DAMAGE_MULTIPLIER_MEDIUM
  return PLAYER_DAMAGE_MULTIPLIER_DEFAULT
}
const CONTAINED_HOSTAGE_RADIUS = 26
const CONTAINED_HOSTAGE_BOB_AMPLITUDE = 5
const CONTAINED_HOSTAGE_BOB_SPEED = 1.1
const CONTAINED_HOSTAGE_SWIRL_SPEED = 0.35
const CONTAINED_HOSTAGE_VERTICAL_SPAN = 18
const GROUND_RELEASE_DELAY = 2
const COUNTDOWN_DURATION = 5
const BLAST_RADIUS = 24
const ENEMY_PLAYER_FAR_DISTANCE = 99999
const EXPLOSION_FLASH_DURATION = 0.45
const EXPLOSION_FLASH_MAX_SCALE = 36
const EXPLOSION_LIGHT_INTENSITY = 6.5
const EXPLOSION_LIGHT_DISTANCE = 88
/** XZ distance (m) within which a kneeling hostage is recruitable via E. */
const RECRUIT_PROXIMITY_RANGE = 8.0

/** How long the "LIFTOFF LOCKED" alert stays on screen per attempt (s). */
const LIFTOFF_LOCK_PROMPT_DURATION = 3.5

/** Seconds between dice rolls for spawning a chase enemy during step 3. */
const CHASE_ROLL_INTERVAL = 7.0

/** Probability per roll that a chase enemy actually spawns (0..1). */
const CHASE_SPAWN_PROBABILITY = 0.6

/** Distance behind a walker (m, opposite the lander direction) where the chaser spawns. */
const CHASE_SPAWN_DISTANCE = 18

/** Cap on simultaneously-alive chase enemies during extraction. */
const CHASE_MAX_ACTIVE = 2

/**
 * Seconds the FPS scene gets to warm up after the player exits the lander
 * before the first attacker pulse spawns. Without this delay, enemies are on
 * top of the player before the FPS overlay finishes loading.
 */
const ENCOUNTER_INITIAL_DELAY = 2

/** Number of enemies released per scheduled encounter pulse. */
const ENCOUNTER_PULSE_SIZE = 3

/** Minimum total seconds across which the encounter roster is dribbled in. */
const ENCOUNTER_MIN_DURATION = 8

/** Maximum total seconds across which the encounter roster is dribbled in. */
const ENCOUNTER_MAX_DURATION = 40

/**
 * Seconds added to the encounter dribble window for every queued enemy. Larger
 * rosters spread over longer windows so high-difficulty levels don't dump the
 * whole pool on the player at once.
 */
const ENCOUNTER_SECONDS_PER_ENEMY = 3

/** How long the "VIROID HIVE RESISTS" alert stays on screen (s). */
const CHASE_ALERT_DURATION = 4.0

/** Yamada VIP patient suit color — visually distinct from standard rescue operators. */
const YAMADA_VIP_SUIT_COLOR = 0xf2c14b

/** Sentinel value meaning "no VIP" — treat as non-Yamada patient-rescue run. */
const NO_VIP_OPERATOR_INDEX = -1

const explosionFlashMat = new THREE.MeshBasicMaterial({
  color: 0x66ffcc,
  transparent: true,
  opacity: 0.72,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})

const explosionFlashGeo = new THREE.SphereGeometry(1, 16, 12)

/** One hostage prop orbiting the rescue capsule with simple bob animation. */
interface ContainedHostageVisual {
  model: HostageModel
  angleOffset: number
  verticalOffset: number
  bobPhase: number
}

/** FPS-style outbreak rescue — waves, healing beam, and virus core objective. */
export class RescueMinigame implements MiniGame, MiniGameEvents {
  readonly objectiveIndex: number

  private _status: MiniGameStatus = 'active'
  private _isPlayerNear = false

  private readonly _steps: MiniGameStep[] = [
    { label: 'Land in the outbreak zone', complete: false, active: true },
    { label: 'Defend the Hostages', complete: false, active: false },
    { label: 'Heal the survivors', complete: false, active: false },
    { label: 'Release the hostages', complete: false, active: false },
    { label: 'Destroy the virus infestation', complete: false, active: false },
  ]

  private readonly objective: ConcreteObjective
  private readonly scene: THREE.Scene
  private readonly heightmap: Heightmap
  private readonly projectileSystem: ProjectileSystem
  private readonly missionDifficulty: number
  private readonly enemyVisualTier: EnemyVisualTier
  private readonly enemyControllerPool: EnemyControllerPool
  private readonly virus: VirusModel
  private readonly virusPosition = new THREE.Vector3()
  private readonly enemyDirector = new EnemyDirector()

  /** Live enemy count for the debug HUD. Read-only. */
  get enemyCount(): number {
    return this.enemyDirector.enemies.length
  }

  /**
   * Subscribe an observer to every enemy this minigame spawns. Used by the
   * level VC to wire the loot drop system without exposing the director.
   *
   * @param listener - Receives each freshly created {@link EnemyHandle}.
   * @returns Unsubscribe function.
   */
  installEnemySpawnObserver(listener: (handle: EnemyHandle) => void): () => void {
    return this.enemyDirector.addSpawnListener(listener)
  }
  private readonly enemyProjectileSystem = new EnemyProjectileSystem()
  private readonly hostages: FpsHostageController
  private readonly groundControllers = new Map<number, BacteriophageController>()
  private readonly spireControllers = new Map<number, SpireController>()
  private readonly chimeraControllers = new Map<number, ChimeraWalkerController>()
  private readonly chimeraLaserOriginScratch = new THREE.Vector3()
  private readonly enemyProjectileMeshPool: EnemyProjectileMeshPool
  private readonly enemyTiltCache: EnemyTiltCache
  private readonly enemyLodApplier = new EnemyLodApplier()
  private readonly enemyByHandleId = new Map<number, Enemy>()
  private readonly encounterEnemies: Enemy[] = []
  /** Total enemies the encounter plans to spawn — set by `spawnEncounter`. */
  private encounterTotalPlanned = 0
  /** Pending pulse roster — front is the next slice to spawn. */
  private readonly pendingPulses: Array<ReadonlyArray<'bacteriophage' | 'chimera' | 'spire'>> = []
  /** Max delay (s) between consecutive pulses when the player doesn't clear early. */
  private encounterPulseInterval = 0
  /** Timer handle for the next scheduled pulse; cancelled when fired early or on dispose/fail. */
  private encounterSpawnTimer: TimerHandle | null = null
  private readonly containedHostages: ContainedHostageVisual[] = []
  private readonly explosionFlash = new THREE.Mesh(explosionFlashGeo, explosionFlashMat)
  private readonly explosionLight = new THREE.PointLight(0x66ffcc, 0, EXPLOSION_LIGHT_DISTANCE)
  private readonly previousHostageBoltHandler: ProjectileSystem['onHostageBolt']

  private activated = false
  private activationPending = false
  private hostagesReleased = false
  private encounterStarted = false
  private armed = false
  private releaseTimerHandle: TimerHandle | null = null
  /**
   * 0-based spawn index of the Yamada VIP operator. {@link NO_VIP_OPERATOR_INDEX}
   * means this is not a patient-rescue run — the VIP death branch is a no-op.
   */
  private readonly vipOperatorIndex: number
  private countdownRemaining = COUNTDOWN_DURATION
  private explosionFlashTimer = 0
  private virusBaseY = 0
  private virusAnimTime = 0
  private readonly lastLanderPosition = new THREE.Vector3()
  /**
   * Generic alert timer used by both the liftoff-lock prompt and the chase
   * alert. While > 0, `updateExtractInteraction` skips its prompt so the
   * alert isn't clobbered by the recruit reticle text.
   */
  private alertTimer = 0
  /** Seconds until the next chase dice roll (only ticks when a walker exists). */
  private chaseRollTimer = CHASE_ROLL_INTERVAL
  /** Snapshot of total hostages released, captured inside `releaseHostagesToGround`. */
  private _totalSurvivorsSnapshot = 0

  /**
   * Called when the player should take direct damage.
   *
   * @param damage  - HP to deduct.
   * @param sourceX - World X of the damage source.
   * @param sourceZ - World Z of the damage source.
   * @param source  - What dealt the damage. `'projectile'` for ranged hits
   *                  fired by enemies, `'contact'` for melee/touch damage.
   *                  Lets the controller pick the right impact SFX.
   */
  onDamagePlayer:
    | ((
        damage: number,
        sourceX: number,
        sourceZ: number,
        source?: 'projectile' | 'contact',
      ) => void)
    | null = null
  onKillPlayer: (() => void) | null = null
  onDestroyLander: (() => void) | null = null
  onExplosion: ((position: THREE.Vector3) => void) | null = null
  onFail: ((objectiveIndex: number, cause: string) => void) | null = null

  onPrompt: ((text: string | null) => void) | null = null
  onComplete: ((objectiveIndex: number) => void) | null = null
  onStepChange: ((objectiveIndex: number, steps: readonly MiniGameStep[]) => void) | null = null

  /** Fired whenever a hostage dies (combat or extraction). Argument: alive-not-aboard count. */
  onSurvivorLost: ((aliveRemaining: number) => void) | null = null
  /** Fired when a recruited walker boards the lander. Argument: cumulative aboard count. */
  onSurvivorAboard: ((aboardCount: number) => void) | null = null
  /**
   * Fired when an incapacitated hostage is revived by a SCI bolt heal.
   * Argument: alive-not-aboard count after revive — HUD survivor counters can
   * re-render. The minigame also auto-recruits the revived survivor (sends them
   * walking to the lander) so the player isn't forced through the kneel +
   * [E] release flow a second time; the count reported here is post-revive
   * but pre-board, so it briefly bumps before the walker fires its board event.
   */
  onSurvivorRevived: ((aliveRemaining: number) => void) | null = null

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
    if (!this.activated) return 0
    if (this.encounterEnemies.length === 0) return 0
    return this.encounterEnemies.length - this.liveEnemyCount()
  }

  get progressTotal(): number | null {
    if (this.encounterTotalPlanned > 0) return this.encounterTotalPlanned
    return this.encounterEnemies.length
  }

  /**
   * Total survivors released onto the ground in step 0. Snapshotted inside
   * `releaseHostagesToGround` so it stays stable even after instances are
   * spliced out of the controller post-board-fade. The HUD's `TOTAL` field.
   */
  get totalSurvivors(): number {
    return this._totalSurvivorsSnapshot
  }

  /** Currently-alive survivors that have not yet boarded the lander. */
  get aliveSurvivors(): number {
    return this.hostages.aliveCountNotAboard
  }

  /** Survivors who have walked into the lander. Monotonic. */
  get aboardSurvivors(): number {
    return this.hostages.aboardCount
  }

  /**
   * Live POI markers exposed to the HUD compass + tactical map so the player
   * can find survivors on broken terrain. One marker per active (alive, not
   * yet aboard) hostage, tagged with the rescue color.
   */
  get compassMarkers(): readonly MiniGameMapMarker[] {
    const anchors = this.hostages.getHostageMarkers()
    const out: MiniGameMapMarker[] = []
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i]!
      out.push({ id: `rescue-hostage-${i}`, x: a.x, z: a.z, type: 'rescue', label: 'SURVIVOR' })
    }
    return out
  }

  /**
   * True while the extract step is active and there are still survivors who
   * have not boarded. Drives a thrust gate on `LanderController`.
   * Also gated on `_status === 'active'` so a `'failed'` mission never reports
   * locked.
   */
  get isLiftoffLocked(): boolean {
    return this._status === 'active' && this._steps[3]?.active === true && this.aliveSurvivors > 0
  }

  get steps(): readonly MiniGameStep[] {
    return this._steps
  }

  private constructor(
    objectiveIndex: number,
    objective: ConcreteObjective,
    scene: THREE.Scene,
    heightmap: Heightmap,
    projectileSystem: ProjectileSystem,
    missionDifficulty: number,
    virus: VirusModel,
    enemyControllerPool: EnemyControllerPool,
    vipOperatorIndex: number,
  ) {
    this.objectiveIndex = objectiveIndex
    this.objective = objective
    this.scene = scene
    this.heightmap = heightmap
    this.projectileSystem = projectileSystem
    this.missionDifficulty = missionDifficulty
    this.enemyControllerPool = enemyControllerPool
    this.vipOperatorIndex = vipOperatorIndex
    this.enemyVisualTier = enemyVisualTierForDifficulty(missionDifficulty)
    const playerDamageMultiplier = playerDamageMultiplierForTier(this.enemyVisualTier)
    this.enemyDirector.setPlayerDamageMultiplier(playerDamageMultiplier)
    this.enemyProjectileSystem.setPlayerDamageMultiplier(playerDamageMultiplier)
    this.virus = virus
    this.previousHostageBoltHandler = projectileSystem.onHostageBolt
    this.hostages = new FpsHostageController(scene, heightmap)
    this.hostages.setProjectileSystem(projectileSystem)
    this.hostages.setEnemyProjectileSystem(this.enemyProjectileSystem)
    this.enemyProjectileMeshPool = new EnemyProjectileMeshPool(scene)
    this.enemyProjectileMeshPool.prewarm()
    this.enemyTiltCache = new EnemyTiltCache(heightmap)

    const groundY = heightmap.heightAt(objective.x, objective.z)
    this.virusBaseY = groundY + VIRUS_FLOAT_HEIGHT
    this.virusPosition.set(objective.x, groundY, objective.z)
    this.virus.placeAt(objective.x, this.virusBaseY, objective.z)
    this.virus.setYaw(Math.random() * Math.PI * 2)
    this.scene.add(this.virus.group)

    this.buildExplosionFlash()
    this.wireCallbacks()
  }

  static async create(
    objectiveIndex: number,
    objective: ConcreteObjective,
    scene: THREE.Scene,
    heightmap: Heightmap,
    projectileSystem: ProjectileSystem,
    missionDifficulty: number,
    enemyControllerPool: EnemyControllerPool,
    vipOperatorIndex = NO_VIP_OPERATOR_INDEX,
  ): Promise<RescueMinigame> {
    await HostageModel.preload()
    const virus = await VirusModel.create({ scale: VIRUS_SCALE })
    const minigame = new RescueMinigame(
      objectiveIndex,
      objective,
      scene,
      heightmap,
      projectileSystem,
      missionDifficulty,
      virus,
      enemyControllerPool,
      vipOperatorIndex,
    )
    await minigame.createContainedHostageVisuals()
    return minigame
  }

  tick(dt: number, ctx: MiniGameContext): void {
    // _isPlayerNear gates whether `LevelMinigameFacade` keeps our prompt on
    // screen. While an alert is up, force it true regardless of physical
    // proximity, otherwise the facade's "no interaction in range → clear
    // prompt" sweep wipes the alert one frame after fireAlert sets it.
    this._isPlayerNear = this.armed || this.alertTimer > 0
    this.hostages.tick(dt)
    this.syncVirusVisual(dt)
    this.syncEnemySimulation(dt, ctx)
    this.syncExplosionFlash(dt)

    if (ctx.landerPosition) {
      this.lastLanderPosition.set(ctx.landerPosition.x, ctx.landerPosition.y, ctx.landerPosition.z)
    }
    if (this.alertTimer > 0) {
      this.alertTimer = Math.max(0, this.alertTimer - dt)
    }
    this.tickChaseRoll(dt)

    if (this._status === 'completed' || this._status === 'failed') {
      return
    }

    if (!this.activated) {
      this.updateLandingStep(ctx)
      return
    }

    if (this.activationPending) {
      return
    }

    if (!this.encounterStarted) {
      this.updatePreEncounterPrompt(ctx)
      if (ctx.levelState === 'eva') {
        this.startEnemyEncounter()
      }
      return
    }

    // Losing every survivor no longer ends the run — the player can still
    // clear the enemies, arm the virus, and evacuate. The heal/extract gates
    // below short-circuit vacuously when `aliveSurvivors === 0`.
    //
    // Step 1 ("Defend the Hostages") only completes once the FULL planned
    // roster has spawned AND every spawned enemy is dead. The encounter
    // dribbles enemies in pulses (see `scheduleEncounterPulses`), so an early
    // `liveEnemyCount() === 0` check would advance the step in the gap before
    // the first pulse fires.
    // Player paced the wave — fire the next pulse early instead of waiting
    // out the scheduled interval. No-op when there's still a live enemy or no
    // pending pulses, so this is cheap to call every frame.
    this.tryAdvancePulseIfClear()

    const allEnemiesSpawned = this.encounterEnemies.length >= this.encounterTotalPlanned
    const allEnemiesDead = allEnemiesSpawned && this.liveEnemyCount() === 0
    if (allEnemiesDead) {
      this.advanceStep(1)
    }

    // Combat prompt while the initial Defend phase is still resolving — both
    // while enemies are still spawning and while any are alive. Once step 1
    // has completed, chase enemies spawned during extraction are alive but the
    // player should still see the recruit reticle / chase alert — not the
    // generic "PROTECT THE SURVIVORS" combat text every frame.
    if (!allEnemiesDead && this._steps[1]?.complete !== true) {
      this.updateCombatPrompt(ctx)
      return
    }

    // Once the heal step is complete, never re-run the heal gate. Otherwise
    // the moment the last survivor boards (counted === 0 → areAllTracked
    // returns false), the early return below would fire forever and step 3 →
    // step 4 would never advance.
    //
    // Gate uses `areAllTrackedHostagesAtFullHealth` (NOT `areAllLiving…`) so
    // the player has to revive every incapacitated hostage with the SCI bolt
    // before the step auto-completes. Otherwise the heal step would skip past
    // unconscious bodies and the player would land on the extract step with
    // corpses they can no longer (per design) leave behind.
    const healStepAlreadyDone = this._steps[2]?.complete === true
    const survivorsStable =
      healStepAlreadyDone ||
      this.totalSurvivors === 0 ||
      this.hostages.areAllTrackedHostagesAtFullHealth()
    if (!survivorsStable) {
      this.updateHealPrompt(ctx)
      return
    }
    this.advanceStep(2)

    // Step 3: Extract. Player aims at a kneeling hostage and presses E to send
    // them walking to the lander. Step completes when no alive non-aboard
    // survivors remain.
    if (this.aliveSurvivors > 0) {
      this.updateExtractInteraction(ctx)
      return
    }
    this.advanceStep(3)

    if (!this.armed) {
      this.updateVirusInteraction(ctx)
      return
    }

    this.countdownRemaining = Math.max(0, this.countdownRemaining - dt)
    const countdownText = Math.max(1, Math.ceil(this.countdownRemaining))
    this.onPrompt?.(`EVACUATE. DETONATION IN ${countdownText}`)

    if (this.countdownRemaining <= 0) {
      this.detonate(ctx)
    }
  }

  /**
   * Flash the visual controller for an enemy that just took a projectile hit.
   * Called by the level controller from `projectileSystem.onEnemyHit`. Silently
   * ignores enemies that don't belong to this minigame.
   *
   * @param enemy - Enemy domain instance that was hit by a player projectile.
   */
  notifyEnemyHit(enemy: Enemy): void {
    for (const [, ctrl] of this.groundControllers) {
      if (ctrl.enemy === enemy) {
        ctrl.flash()
        return
      }
    }
    for (const [, ctrl] of this.chimeraControllers) {
      if (ctrl.enemy === enemy) {
        ctrl.flash()
        return
      }
    }
    for (const [, ctrl] of this.spireControllers) {
      if (ctrl.enemy === enemy) {
        ctrl.flash()
        return
      }
    }
  }

  /**
   * Called by the level VC when the player tries to lift off while the rescue
   * lock is active. Rate-limited internally to one prompt per
   * {@link LIFTOFF_LOCK_PROMPT_DURATION} so holding the throttle doesn't spam.
   */
  notifyLiftoffAttemptBlocked(): void {
    if (this.alertTimer > 0) return
    this.fireAlert('LIFTOFF LOCKED — RELEASE ALL HOSTAGES', LIFTOFF_LOCK_PROMPT_DURATION)
  }

  /**
   * Show a transient alert prompt for `duration` seconds. While the alert is
   * up, `updateExtractInteraction` skips its own prompt update so the alert
   * is not clobbered by the recruit reticle text.
   *
   * @param text     - Prompt text (uppercase reads best in this HUD)
   * @param duration - Lifetime in seconds
   */
  private fireAlert(text: string, duration: number): void {
    this.alertTimer = duration
    // Same reason as the tick-top _isPlayerNear assignment: without this, the
    // facade clears the prompt the same frame the alert fires.
    this._isPlayerNear = true
    this.onPrompt?.(text)
  }

  /**
   * Once per `CHASE_ROLL_INTERVAL` (only while at least one hostage is walking
   * mid-extraction), roll the dice. On success, spawn a chase enemy a few
   * meters behind a random walker and fire the chase alert. The cap on
   * simultaneously-alive chasers is enforced via {@link liveEnemyCount}, which
   * is zero by step 3 unless we just spawned chasers ourselves.
   *
   * @param dt - Frame delta time in seconds
   */
  private tickChaseRoll(dt: number): void {
    if (this._status !== 'active') return
    if (this._steps[3]?.active !== true) return
    const walkers = this.hostages.getWalkingHostages()
    if (walkers.length === 0) return

    this.chaseRollTimer = Math.max(0, this.chaseRollTimer - dt)
    if (this.chaseRollTimer > 0) return
    this.chaseRollTimer = CHASE_ROLL_INTERVAL

    if (this.liveEnemyCount() >= CHASE_MAX_ACTIVE) return
    if (Math.random() >= CHASE_SPAWN_PROBABILITY) return

    this.spawnChaser(walkers)
  }

  /**
   * Spawn one bacteriophage `CHASE_SPAWN_DISTANCE` meters behind a random
   * walking hostage (opposite the lander direction), then fire the alert.
   * The bacteriophage's existing AI takes over from there — the
   * `EnemyDirector` already has the walker registered as a hostage target.
   *
   * @param walkers - Snapshot of currently-walking hostages (non-empty)
   */
  private spawnChaser(walkers: readonly Hostage[]): void {
    const target = walkers[Math.floor(Math.random() * walkers.length)]
    if (!target) return
    const tx = target.position.x
    const tz = target.position.z

    const dx = this.lastLanderPosition.x - tx
    const dz = this.lastLanderPosition.z - tz
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist < 0.01) return

    const spawnX = tx - (dx / dist) * CHASE_SPAWN_DISTANCE
    const spawnZ = tz - (dz / dist) * CHASE_SPAWN_DISTANCE

    this.spawnEnemiesOfType('bacteriophage', 1, spawnX, spawnZ)
    this.fireAlert('THE VIROID HIVE RESISTS YOUR RESCUE', CHASE_ALERT_DURATION)
  }

  dispose(): void {
    if (this.releaseTimerHandle !== null) {
      Timer.cancel(this.releaseTimerHandle)
      this.releaseTimerHandle = null
    }
    this.cancelEncounterSpawnTimer()
    this.clearEncounter()
    this.clearEnemyProjectiles()
    this.clearContainedHostageVisuals()
    this.hostages.dispose()
    this.scene.remove(this.virus.group)
    this.virus.dispose()
    this.explosionFlash.removeFromParent()
    this.explosionLight.removeFromParent()
  }

  private buildExplosionFlash(): void {
    this.explosionFlash.visible = false
    // Pin the point light visible — flipping `.visible` per blast would
    // bump `NUM_POINT_LIGHTS` and force every lit material in the scene to
    // recompile. Modulate intensity instead.
    this.explosionLight.visible = true
    this.explosionLight.intensity = 0
    this.scene.add(this.explosionFlash)
    this.scene.add(this.explosionLight)
  }

  private wireCallbacks(): void {
    this.enemyDirector.onContactDamage = (handle, damage) => {
      const enemy = this.enemyByHandleId.get(handle.id)
      if (!enemy || !enemy.alive) return
      this.onDamagePlayer?.(damage, enemy.position.x, enemy.position.z, 'contact')
    }

    this.enemyDirector.onHostageContactDamage = (_handle, hostage) => {
      this.hostages.notifyDamaged(hostage)
    }

    this.enemyProjectileSystem.onPlayerHit = (damage, sourceX, sourceZ) => {
      this.onDamagePlayer?.(damage, sourceX, sourceZ, 'projectile')
    }

    this.enemyProjectileSystem.onHostageHit = (hostage) => {
      this.hostages.notifyDamaged(hostage)
    }

    this.projectileSystem.onHostageBolt = (hostage, pos, effect) => {
      this.previousHostageBoltHandler?.(hostage, pos, effect)
      if (!this.ownsHostage(hostage)) return
      if (effect === 'heal') {
        this.hostages.notifyHealed(hostage)
      } else {
        this.hostages.notifyDamaged(hostage)
      }
    }

    this.enemyProjectileSystem.onProjectileMove = this.enemyProjectileMeshPool.acquire
    this.enemyProjectileSystem.onProjectileRemoved = this.enemyProjectileMeshPool.release

    this.hostages.onSurvivorLost = (aliveRemaining) => {
      this.onSurvivorLost?.(aliveRemaining)
    }
    this.hostages.onSurvivorAboard = (aboardCount) => {
      this.onSurvivorAboard?.(aboardCount)
    }
    this.hostages.onSurvivorRevived = (hostage, aliveRemaining) => {
      // Auto-recruit the revived survivor — dead → walking, no praying loop,
      // no [E] release prompt. The walker reads `lastLanderPosition` every tick
      // so the survivor tracks the lander even if it shifts before they board.
      const captured = this.lastLanderPosition.clone()
      this.hostages.recruit(hostage, () => {
        captured.copy(this.lastLanderPosition)
        return captured
      })
      this.onSurvivorRevived?.(aliveRemaining)
    }
  }

  private syncVirusVisual(dt: number): void {
    this.virusAnimTime += dt
    const virusY =
      this.virusBaseY + Math.sin(this.virusAnimTime * VIRUS_BOB_SPEED) * VIRUS_BOB_AMPLITUDE
    this.virus.group.position.set(this.virusPosition.x, virusY, this.virusPosition.z)
    this.virus.group.rotation.y += dt * VIRUS_ROTATION_SPEED

    for (const visual of this.containedHostages) {
      const orbit = this.virusAnimTime * CONTAINED_HOSTAGE_SWIRL_SPEED + visual.angleOffset
      const bob = Math.sin(this.virusAnimTime * CONTAINED_HOSTAGE_BOB_SPEED + visual.bobPhase)
      visual.model.group.position.set(
        this.virusPosition.x + Math.cos(orbit) * CONTAINED_HOSTAGE_RADIUS,
        virusY + visual.verticalOffset + bob * CONTAINED_HOSTAGE_BOB_AMPLITUDE,
        this.virusPosition.z + Math.sin(orbit) * CONTAINED_HOSTAGE_RADIUS,
      )
      visual.model.group.rotation.y = -orbit + Math.PI
    }
  }

  private updateLandingStep(ctx: MiniGameContext): void {
    if (ctx.levelState === 'lander' && ctx.landerPosition && this.isLanderInsideSite(ctx)) {
      this.onPrompt?.('LAND TO RELEASE THE SURVIVORS')
      if (ctx.landerGrounded) {
        void this.activateEncounter()
      }
      return
    }

    if (ctx.levelState === 'eva' && ctx.playerPosition) {
      const dist = this.distanceToVirus(ctx.playerPosition.x, ctx.playerPosition.z)
      if (dist <= LANDING_SITE_RADIUS) {
        this._isPlayerNear = true
        this.onPrompt?.('LAND THE LANDER INSIDE THE OUTBREAK ZONE')
      } else {
        this.onPrompt?.(null)
      }
      return
    }

    this.onPrompt?.(null)
  }

  private async activateEncounter(): Promise<void> {
    if (this.activated || this._status !== 'active') return
    this.activationPending = true
    this.activated = true
    this.advanceStep(0)
    try {
      this.hideContainedHostageVisuals()
      this.onPrompt?.('RELEASING SURVIVORS')
      this.releaseTimerHandle = Timer.after(GROUND_RELEASE_DELAY, () => {
        this.releaseTimerHandle = null
        void this.releaseHostagesToGround()
      })
    } finally {
      this.activationPending = false
    }
  }

  private startEnemyEncounter(): void {
    if (!this.hostagesReleased || this.encounterStarted || this._status !== 'active') return
    this.encounterStarted = true
    this.spawnEncounter()
    this.enemyDirector.setHostageTargets(this.hostages.getHostageEntitiesForDirector())
    this.onPrompt?.('HOSTILES INBOUND. PROTECT THE SURVIVORS')
  }

  private async releaseHostagesToGround(): Promise<void> {
    if (this._status !== 'active' || this.hostagesReleased) return
    await this.spawnHostages()
    this._totalSurvivorsSnapshot = this.hostages.getTotalCount()
    this.hostagesReleased = true
    this.onPrompt?.('SURVIVORS RELEASED. EXIT THE LANDER')
  }

  private async spawnHostages(): Promise<void> {
    const colonistCount = Math.max(
      2,
      this.objective.colonistCount ?? Math.min(6, 2 + Math.floor(this.missionDifficulty / 2)),
    )
    const objY = this.heightmap.heightAt(this.objective.x, this.objective.z)
    const positions: Array<{ x: number; z: number; yaw: number }> = []
    for (let i = 0; i < colonistCount; i++) {
      const baseAngle = (i / colonistCount) * Math.PI * 2
      const placement = this.sampleReachableHostagePosition(baseAngle, objY)
      const x = this.objective.x + Math.cos(placement.angle) * placement.radius
      const z = this.objective.z + Math.sin(placement.angle) * placement.radius
      positions.push({
        x,
        z,
        yaw: Math.atan2(this.objective.x - x, this.objective.z - z),
      })
    }
    await this.hostages.spawnAtPositions(positions)
    this.applyVipSuitIfNeeded(colonistCount)
  }

  /**
   * Apply the Yamada VIP yellow suit and wire the hard-fail death hook for the
   * designated VIP operator. No-op when:
   * - {@link vipOperatorIndex} is {@link NO_VIP_OPERATOR_INDEX} (non-Yamada run), or
   * - the index is out of range for the actual colonist count (degenerate roll guard).
   *
   * Called once, immediately after `spawnAtPositions` completes, so the
   * hostage entities are fully registered before we subscribe to `onDeath`.
   *
   * @param colonistCount - Total operators spawned this run.
   */
  private applyVipSuitIfNeeded(colonistCount: number): void {
    if (this.vipOperatorIndex < 0 || this.vipOperatorIndex >= colonistCount) return
    const vipHostage = this.hostages.getHostageByIndex(this.vipOperatorIndex)
    if (!vipHostage) return
    const vipInst = this.hostages.getInstanceFor(vipHostage)
    if (!vipInst) return

    vipInst.model.setSuitColor(YAMADA_VIP_SUIT_COLOR)

    const prevOnDeath = vipHostage.onDeath
    vipHostage.onDeath = () => {
      prevOnDeath?.()
      this.failPatientRescueOnVipDeath()
    }
  }

  /**
   * Hard-fail the Yamada patient-rescue mission when the VIP operator dies.
   * Clears the active mission from localStorage and reloads the page — the
   * same "immediate reload" pattern used by Phase 3.5 (bunker-protect lapse).
   * No banner or fade: the reload IS the fail.
   */
  private failPatientRescueOnVipDeath(): void {
    if (this._status !== 'active') return
    this._status = 'failed'
    clearActiveMission()
    window.location.reload()
  }

  /**
   * Pick a hostage spawn offset (angle + radius) that lies on walkable terrain
   * and has a passable path back to the objective. Tries the preferred outer
   * band first, then progressively shrinks the outer radius so survivors stay
   * relatively far from the lander on flat asteroids but tuck in close when
   * the local terrain rules out distant ground.
   *
   * @param baseAngle - Even-spacing angle for this colonist (radians).
   * @param objY - Heightmap height at the rescue objective.
   */
  private sampleReachableHostagePosition(
    baseAngle: number,
    objY: number,
  ): { angle: number; radius: number } {
    const minR = Math.min(HOSTAGE_RING_MIN_RADIUS, HOSTAGE_RING_MAX_RADIUS * 0.55)
    let outerR = HOSTAGE_RING_MAX_RADIUS
    let bestFallback: { angle: number; radius: number } | null = null

    for (let shrink = 0; shrink <= HOSTAGE_RING_SHRINK_STEPS; shrink++) {
      const span = Math.max(0.01, outerR - minR)
      for (let attempt = 0; attempt < HOSTAGE_SAMPLES_PER_RING; attempt++) {
        const angle = baseAngle + (Math.random() - 0.5) * 0.7
        const radius = minR + Math.sqrt(Math.random()) * span
        const x = this.objective.x + Math.cos(angle) * radius
        const z = this.objective.z + Math.sin(angle) * radius
        if (this.isHostageReachable(x, z, objY)) {
          return { angle, radius }
        }
        if (bestFallback === null) bestFallback = { angle, radius }
      }
      outerR *= HOSTAGE_RING_SHRINK_FACTOR
      if (outerR <= minR) break
    }

    return bestFallback ?? { angle: baseAngle, radius: minR }
  }

  /**
   * Whether a hostage spawned at `(x, z)` could realistically walk back to the
   * objective. Rejects spawns sitting off-map, on steep slopes, far above/below
   * the objective, or separated from it by a steep ridge.
   *
   * @param x    - Candidate world X.
   * @param z    - Candidate world Z.
   * @param objY - Heightmap height at the objective center.
   */
  private isHostageReachable(x: number, z: number, objY: number): boolean {
    if (!this.heightmap.isValidAt(x, z)) return false
    if (this.heightmap.slopeAt(x, z) > HOSTAGE_MAX_TERRAIN_SLOPE) return false
    const yHere = this.heightmap.heightAt(x, z)
    if (Math.abs(yHere - objY) > HOSTAGE_MAX_ELEVATION_DELTA) return false
    for (let s = 1; s < HOSTAGE_PATH_SAMPLES; s++) {
      const t = s / HOSTAGE_PATH_SAMPLES
      const sx = this.objective.x + (x - this.objective.x) * t
      const sz = this.objective.z + (z - this.objective.z) * t
      if (!this.heightmap.isValidAt(sx, sz)) return false
      if (this.heightmap.slopeAt(sx, sz) > HOSTAGE_MAX_TERRAIN_SLOPE) return false
      const sy = this.heightmap.heightAt(sx, sz)
      if (Math.abs(sy - objY) > HOSTAGE_MAX_ELEVATION_DELTA) return false
    }
    return true
  }

  private async createContainedHostageVisuals(): Promise<void> {
    const colonistCount = Math.max(
      2,
      this.objective.colonistCount ?? Math.min(6, 2 + Math.floor(this.missionDifficulty / 2)),
    )
    for (let i = 0; i < colonistCount; i++) {
      const model = await HostageModel.create({
        scale: 0.8,
        castShadow: false,
        receiveShadow: false,
      })
      this.scene.add(model.group)
      this.containedHostages.push({
        model,
        angleOffset: (i / colonistCount) * Math.PI * 2,
        verticalOffset:
          (i / Math.max(1, colonistCount - 1) - 0.5) * CONTAINED_HOSTAGE_VERTICAL_SPAN,
        bobPhase: Math.random() * Math.PI * 2,
      })
    }
  }

  private hideContainedHostageVisuals(): void {
    for (const visual of this.containedHostages) {
      visual.model.group.visible = false
    }
  }

  private clearContainedHostageVisuals(): void {
    for (const visual of this.containedHostages) {
      visual.model.group.removeFromParent()
      visual.model.dispose()
    }
    this.containedHostages.length = 0
  }

  private spawnEncounter(): void {
    const colonistCount = this.objective.colonistCount ?? this.hostages.getTotalCount()
    const guardedBonus = this.objective.isGuarded ? 1 : 0
    const spireCount = Math.min(
      2,
      Math.max(0, Math.floor((this.missionDifficulty - 3) / 3) + guardedBonus),
    )
    const chimeraCount = Math.min(2, Math.max(0, Math.floor((this.missionDifficulty - 4) / 3)))
    const phageCount = Math.max(
      3,
      Math.floor(this.missionDifficulty / 2) + Math.ceil(colonistCount / 2) + guardedBonus,
    )

    const queue = this.buildEncounterQueue(phageCount, chimeraCount, spireCount)
    this.encounterTotalPlanned = queue.length
    this.scheduleEncounterPulses(queue)
  }

  /**
   * Build the spawn queue by interleaving the three enemy archetypes so each
   * pulse mixes types when the roster includes more than one. Phage-heavy
   * rosters still front-load phages, but chimera and spires are sprinkled
   * through the list rather than dumped at the end.
   *
   * @param phages   - Number of bacteriophage enemies to queue.
   * @param chimeras - Number of chimera walkers to queue.
   * @param spires   - Number of spire enemies to queue.
   */
  private buildEncounterQueue(
    phages: number,
    chimeras: number,
    spires: number,
  ): Array<'bacteriophage' | 'chimera' | 'spire'> {
    const buckets: Array<{ type: 'bacteriophage' | 'chimera' | 'spire'; left: number }> = [
      { type: 'bacteriophage', left: phages },
      { type: 'chimera', left: chimeras },
      { type: 'spire', left: spires },
    ]
    const queue: Array<'bacteriophage' | 'chimera' | 'spire'> = []
    while (buckets.some((b) => b.left > 0)) {
      for (const bucket of buckets) {
        if (bucket.left <= 0) continue
        queue.push(bucket.type)
        bucket.left--
      }
    }
    return queue
  }

  /**
   * Schedule the encounter roster as paced pulses. Starts after
   * {@link ENCOUNTER_INITIAL_DELAY} so the FPS scene has a moment to load, then
   * fires one pulse of {@link ENCOUNTER_PULSE_SIZE} enemies at a time. The
   * inter-pulse interval is the upper bound — `tick()` calls
   * {@link tryAdvancePulseIfClear} every frame, so if the player wipes the
   * current wave fast the next pulse fires immediately rather than waiting
   * out the timer.
   *
   * @param queue - Ordered enemy types to spawn.
   */
  private scheduleEncounterPulses(
    queue: ReadonlyArray<'bacteriophage' | 'chimera' | 'spire'>,
  ): void {
    if (queue.length === 0) return
    const pulseCount = Math.ceil(queue.length / ENCOUNTER_PULSE_SIZE)
    const totalDuration = Math.max(
      ENCOUNTER_MIN_DURATION,
      Math.min(ENCOUNTER_MAX_DURATION, queue.length * ENCOUNTER_SECONDS_PER_ENEMY),
    )
    this.encounterPulseInterval = pulseCount > 1 ? totalDuration / (pulseCount - 1) : 0
    let cursor = 0
    for (let i = 0; i < pulseCount; i++) {
      const start = cursor
      const end = Math.min(queue.length, cursor + ENCOUNTER_PULSE_SIZE)
      this.pendingPulses.push(queue.slice(start, end))
      cursor = end
    }
    this.scheduleNextPulse(ENCOUNTER_INITIAL_DELAY)
  }

  /**
   * Arm the next pending pulse with a max-delay timer. The pulse may also fire
   * earlier via {@link tryAdvancePulseIfClear} when the live encounter is
   * cleared. Idempotent — if a timer is already armed it stays armed.
   *
   * @param delay - Seconds to wait before firing if not interrupted by an early-clear.
   */
  private scheduleNextPulse(delay: number): void {
    if (this.encounterSpawnTimer !== null) return
    if (this.pendingPulses.length === 0) return
    this.encounterSpawnTimer = Timer.after(delay, () => {
      this.encounterSpawnTimer = null
      this.fireNextPendingPulse()
    })
  }

  /**
   * Fire the next pending pulse if the live wave is already cleared. Lets the
   * player pace the encounter — clear the current pulse fast and the next one
   * arrives immediately rather than ticking out the scheduled interval.
   * Called from {@link tick} every frame while the encounter is active.
   */
  private tryAdvancePulseIfClear(): void {
    if (this.pendingPulses.length === 0) return
    if (this.encounterEnemies.length === 0) return // initial pulse hasn't fired yet — let the boot delay run
    if (this.liveEnemyCount() > 0) return
    if (this.encounterSpawnTimer !== null) {
      Timer.cancel(this.encounterSpawnTimer)
      this.encounterSpawnTimer = null
    }
    this.fireNextPendingPulse()
  }

  /**
   * Pop and fire the next queued pulse, then arm the timer for the one after.
   * Bails when the encounter has been torn down so a late call can't resurrect
   * enemies past failure / completion.
   */
  private fireNextPendingPulse(): void {
    if (this._status !== 'active' || !this.encounterStarted) return
    const slice = this.pendingPulses.shift()
    if (!slice) return
    this.firePulse(slice)
    if (this.pendingPulses.length > 0) {
      this.scheduleNextPulse(this.encounterPulseInterval)
    }
  }

  /**
   * Spawn one queued pulse if the encounter is still active. Bails when the
   * minigame has already failed or completed so a late-firing pulse doesn't
   * resurrect enemies after teardown.
   *
   * @param slice - Pulse roster to spawn.
   */
  private firePulse(slice: ReadonlyArray<'bacteriophage' | 'chimera' | 'spire'>): void {
    if (this._status !== 'active' || !this.encounterStarted) return
    const counts: Record<'bacteriophage' | 'chimera' | 'spire', number> = {
      bacteriophage: 0,
      chimera: 0,
      spire: 0,
    }
    for (const type of slice) counts[type]++
    if (counts.bacteriophage > 0) this.spawnEnemiesOfType('bacteriophage', counts.bacteriophage)
    if (counts.chimera > 0) this.spawnEnemiesOfType('chimera', counts.chimera)
    if (counts.spire > 0) this.spawnEnemiesOfType('spire', counts.spire)
    this.enemyDirector.setHostageTargets(this.hostages.getHostageEntitiesForDirector())
  }

  private spawnEnemiesOfType(
    type: 'bacteriophage' | 'chimera' | 'spire',
    count: number,
    spawnX = this.objective.x,
    spawnZ = this.objective.z,
  ): void {
    if (count <= 0) return
    for (let i = 0; i < count; i++) {
      const x = spawnX
      const z = spawnZ
      const groundY = this.heightmap.heightAt(x, z)
      const handle = this.enemyDirector.spawn(type, x, groundY, z)

      let attached = false
      if (type === 'bacteriophage') {
        const ctrl = this.enemyControllerPool.acquirePhage(handle.enemy)
        if (ctrl) {
          ctrl.group.position.set(x, groundY, z)
          this.groundControllers.set(handle.id, ctrl)
          attached = true
        }
      } else if (type === 'chimera') {
        const ctrl = this.enemyControllerPool.acquireChimera(handle.enemy)
        if (ctrl) {
          ctrl.group.position.set(x, groundY, z)
          this.chimeraControllers.set(handle.id, ctrl)
          attached = true
        }
      } else {
        const ctrl = this.enemyControllerPool.acquireSpire(handle.enemy)
        if (ctrl) {
          ctrl.group.position.set(x, groundY + handle.config.floatHeight, z)
          ctrl.targetPosition.set(x, groundY + handle.config.floatHeight, z)
          this.spireControllers.set(handle.id, ctrl)
          attached = true
        }
      }

      if (!attached) {
        // Pool exhaustion — bump capacity in EnemyControllerPool sizing rather
        // than falling back to a fresh allocation that would defeat warm-up.
        this.enemyDirector.despawn(handle)
        continue
      }

      this.enemyByHandleId.set(handle.id, handle.enemy)
      this.encounterEnemies.push(handle.enemy)
      this.projectileSystem.addEnemy(handle.enemy)
    }
  }

  private syncEnemySimulation(dt: number, ctx: MiniGameContext): void {
    if (!this.activated) return

    const player = ctx.playerPosition
    if (player) {
      this.enemyDirector.setPlayerPosition(player.x, player.y, player.z)
      this.enemyProjectileSystem.setPlayerPosition(player.x, player.y, player.z)
    } else {
      this.enemyDirector.setPlayerPosition(
        this.objective.x + ENEMY_PLAYER_FAR_DISTANCE,
        0,
        this.objective.z + ENEMY_PLAYER_FAR_DISTANCE,
      )
      this.enemyProjectileSystem.setPlayerPosition(
        this.objective.x + ENEMY_PLAYER_FAR_DISTANCE,
        0,
        this.objective.z + ENEMY_PLAYER_FAR_DISTANCE,
      )
    }

    this.enemyDirector.setHostageTargets(this.hostages.getHostageEntitiesForDirector())
    this.enemyDirector.tick(dt)
    this.enemyProjectileSystem.tick(dt)

    // Distance LOD + N-nearest light cap — must run before controller ticks
    // so `lodSkipGeometry` is observed by the rebake-throttled branches.
    // @see docs/superpowers/specs/2026-04-18-fps-perf-fixes-design.md (v5)
    const lodPlayerX = player?.x ?? this.objective.x + ENEMY_PLAYER_FAR_DISTANCE
    const lodPlayerZ = player?.z ?? this.objective.z + ENEMY_PLAYER_FAR_DISTANCE
    this.enemyLodApplier.begin(lodPlayerX, lodPlayerZ)
    for (const handle of this.enemyDirector.enemies) {
      this.enemyLodApplier.consider(handle, this.groundControllers.get(handle.id))
      this.enemyLodApplier.consider(handle, this.chimeraControllers.get(handle.id))
      this.enemyLodApplier.consider(handle, this.spireControllers.get(handle.id))
    }
    this.enemyLodApplier.commit()

    for (const handle of this.enemyDirector.enemies) {
      this.syncGroundController(
        this.groundControllers.get(handle.id),
        handle,
        dt,
        PHAGE_HIT_CENTER_Y,
      )
      this.syncGroundController(
        this.chimeraControllers.get(handle.id),
        handle,
        dt,
        CHIMERA_HIT_CENTER_Y,
      )
      this.syncSpireController(this.spireControllers.get(handle.id), handle, dt)
    }
  }

  private syncGroundController(
    ctrl: BacteriophageController | ChimeraWalkerController | undefined,
    handle: EnemyHandle,
    dt: number,
    hitCenterY: number,
  ): void {
    if (!ctrl) return

    if (ctrl.deathComplete) {
      if (handle.type === 'chimera') {
        this.enemyControllerPool.releaseChimera(ctrl as ChimeraWalkerController)
      } else {
        this.enemyControllerPool.releasePhage(ctrl as BacteriophageController)
      }
      this.projectileSystem.removeEnemy(handle.enemy)
      this.enemyDirector.despawn(handle)
      this.groundControllers.delete(handle.id)
      this.chimeraControllers.delete(handle.id)
      this.enemyTiltCache.release(handle.id)
      return
    }

    if (handle.enemy.alive) {
      ctrl.isMoving = handle.lastOutput.isMoving
      ctrl.isAgitated = handle.lastOutput.isAgitated
      ctrl.group.position.x = handle.enemy.position.x
      ctrl.group.position.z = handle.enemy.position.z

      const groundY = this.heightmap.heightAt(handle.enemy.position.x, handle.enemy.position.z)
      ctrl.group.position.y = groundY
      handle.enemy.position.y = groundY + hitCenterY

      this.enemyTiltCache.applyTilt(
        handle.id,
        handle.enemy.position.x,
        handle.enemy.position.z,
        ctrl.group,
      )

      if (handle.type === 'chimera' && handle.lastOutput.isChasing) {
        const ax = handle.lastOutput.aimTargetX
        const az = handle.lastOutput.aimTargetZ
        const adx = ax - handle.enemy.position.x
        const adz = az - handle.enemy.position.z
        ctrl.group.rotation.y = Math.atan2(adx, adz)
      } else if (handle.lastOutput.isMoving) {
        const dir = handle.lastOutput.moveDir
        ctrl.group.rotation.y = Math.atan2(dir.x, dir.z)
      }
    }

    ctrl.tick(dt)

    if (handle.type === 'chimera' && handle.enemy.alive && handle.lastOutput.wantsToFire) {
      const chim = ctrl as ChimeraWalkerController
      chim.group.updateMatrixWorld(true)
      const muzzle = this.chimeraLaserOriginScratch
      chim.getEyeLaserMuzzle(muzzle)
      const aimX = handle.lastOutput.aimTargetX
      const aimY = handle.lastOutput.aimTargetY
      const aimZ = handle.lastOutput.aimTargetZ
      const spawnedCount = spawnChimeraProjectileBurst({
        originX: muzzle.x,
        originY: muzzle.y,
        originZ: muzzle.z,
        targetX: aimX,
        targetY: aimY,
        targetZ: aimZ,
        projectileSpeed: handle.config.projectileSpeed,
        projectileDamage: handle.config.projectileDamage,
        spawnBurst: this.enemyProjectileSystem.spawnBurst.bind(this.enemyProjectileSystem),
      })
      if (spawnedCount > 0) {
        chim.pulseEyeLaser()
      }
    }
  }

  private syncSpireController(
    ctrl: SpireController | undefined,
    handle: EnemyHandle,
    dt: number,
  ): void {
    if (!ctrl) return

    if (ctrl.deathComplete) {
      this.enemyControllerPool.releaseSpire(ctrl)
      this.projectileSystem.removeEnemy(handle.enemy)
      this.enemyDirector.despawn(handle)
      this.spireControllers.delete(handle.id)
      return
    }

    if (handle.enemy.alive) {
      ctrl.isMoving = handle.lastOutput.isMoving
      ctrl.isAgitated = handle.lastOutput.isAgitated

      const groundY = this.heightmap.heightAt(handle.enemy.position.x, handle.enemy.position.z)
      ctrl.targetPosition.set(
        handle.enemy.position.x,
        groundY + handle.config.floatHeight,
        handle.enemy.position.z,
      )
      handle.enemy.position.y = ctrl.group.position.y + SPIRE_HIT_CENTER_Y

      const aimX = handle.lastOutput.aimTargetX
      const aimY = handle.lastOutput.aimTargetY
      const aimZ = handle.lastOutput.aimTargetZ

      if (handle.lastOutput.isChasing) {
        const dx = aimX - handle.enemy.position.x
        const dz = aimZ - handle.enemy.position.z
        ctrl.group.rotation.y = Math.atan2(dx, dz)
      }

      if (handle.lastOutput.wantsToFire) {
        const ep = handle.enemy.position
        const dx = aimX - ep.x
        const dy = aimY - ep.y
        const dz = aimZ - ep.z
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (dist > 0.01) {
          this.enemyProjectileSystem.spawn(
            ep.x,
            ep.y,
            ep.z,
            dx / dist,
            dy / dist,
            dz / dist,
            handle.config.projectileSpeed,
            handle.config.projectileDamage,
          )
          ctrl.fireFlash(aimX, aimZ)
        }
      }
    }

    ctrl.tick(dt)
  }

  private updateCombatPrompt(ctx: MiniGameContext): void {
    if (ctx.levelState !== 'eva' || !ctx.playerPosition) return

    const dist = this.distanceToVirus(ctx.playerPosition.x, ctx.playerPosition.z)
    if (dist <= VIRUS_INTERACT_RANGE) {
      this._isPlayerNear = true
      this.onPrompt?.('PROTECT THE SURVIVORS. ELIMINATE THE ATTACKERS')
    }
  }

  private updatePreEncounterPrompt(ctx: MiniGameContext): void {
    if (!this.hostagesReleased) return

    if (ctx.levelState === 'lander') {
      this.onPrompt?.('SURVIVORS RELEASED. EXIT THE LANDER')
      return
    }

    if (ctx.levelState === 'eva') {
      this.onPrompt?.('HOSTILES INBOUND')
      return
    }

    this.onPrompt?.(null)
  }

  private updateHealPrompt(ctx: MiniGameContext): void {
    if (ctx.levelState !== 'eva' || !ctx.playerPosition) {
      this.onPrompt?.(null)
      return
    }

    const dist = this.distanceToVirus(ctx.playerPosition.x, ctx.playerPosition.z)
    if (dist <= VIRUS_INTERACT_RANGE) {
      this._isPlayerNear = true
      this.onPrompt?.('HEAL THE SURVIVORS TO FULL HEALTH')
    } else {
      this.onPrompt?.(null)
    }
  }

  /**
   * Step-3 prompt + recruit handler. Raycasts from the player camera; if it hits
   * a kneeling hostage within {@link RESCUE_RAYCAST_RANGE}, prompt to press E
   * and recruit on press.
   */
  private updateExtractInteraction(ctx: MiniGameContext): void {
    // While a transient alert (liftoff lock or chase) is showing, don't
    // overwrite its prompt with the recruit text — the alert needs its full
    // duration on screen to register.
    if (this.alertTimer > 0) return

    if (ctx.levelState !== 'eva' || !ctx.playerPosition) {
      this.onPrompt?.(null)
      return
    }

    const hit = this.findExtractTarget(ctx)
    if (hit) {
      this._isPlayerNear = true
      this.onPrompt?.('[E] RELEASE HOSTAGE')
      if (ctx.terminalInteractPressed) {
        const captured = this.lastLanderPosition.clone()
        this.hostages.recruit(hit, () => {
          // Update the captured vector each tick to match the live lander pos.
          captured.copy(this.lastLanderPosition)
          return captured
        })
      }
      return
    }
    // Out of range: don't fire a prompt at all. Setting one without also
    // marking the player "near" would just be cleared by the facade sweep
    // (same mechanism that bit the chase/lock alerts before fireAlert was
    // taught to set _isPlayerNear). The HP bars over the kneeling hostages
    // are sufficient on-screen guidance to walk closer.
    this.onPrompt?.(null)
  }

  /**
   * Closest kneeling hostage within {@link RECRUIT_PROXIMITY_RANGE} of the
   * player on the XZ plane (Y ignored — slopes shouldn't punish the player for
   * being slightly above or below the survivor). Returns `null` when no
   * praying hostage is in range. Walkers, dying, and standing-up hostages are
   * never returned.
   */
  private findExtractTarget(ctx: MiniGameContext): Hostage | null {
    if (!ctx.playerPosition) return null
    const px = ctx.playerPosition.x
    const pz = ctx.playerPosition.z

    let bestDistSq = RECRUIT_PROXIMITY_RANGE * RECRUIT_PROXIMITY_RANGE
    let best: Hostage | null = null

    for (const hostage of this.hostages.getHostages()) {
      const inst = this.hostages.getInstanceFor(hostage)
      if (inst && inst.model.getState() !== 'praying') continue

      const dx = hostage.position.x - px
      const dz = hostage.position.z - pz
      const distSq = dx * dx + dz * dz
      if (distSq > bestDistSq) continue
      bestDistSq = distSq
      best = hostage
    }

    return best
  }

  private updateVirusInteraction(ctx: MiniGameContext): void {
    if (ctx.levelState !== 'eva' || !ctx.playerPosition) {
      this.onPrompt?.(null)
      return
    }

    const dist = this.distanceToVirus(ctx.playerPosition.x, ctx.playerPosition.z)
    if (dist > VIRUS_INTERACT_RANGE) {
      this.onPrompt?.(null)
      return
    }

    this._isPlayerNear = true
    this.onPrompt?.('[E] PLANT CHARGES ON THE VIRUS')
    if (ctx.terminalInteractPressed) {
      this.armCharges()
    }
  }

  private armCharges(): void {
    this.armed = true
    this.countdownRemaining = COUNTDOWN_DURATION
    this.advanceStep(4)
  }

  private detonate(ctx: MiniGameContext): void {
    this.armed = false
    this._isPlayerNear = false
    this.scene.remove(this.virus.group)
    this.virus.dispose()

    this.explosionFlashTimer = EXPLOSION_FLASH_DURATION
    this.explosionFlash.visible = true
    this.explosionFlash.position.set(
      this.virusPosition.x,
      this.virusBaseY - 6,
      this.virusPosition.z,
    )
    this.explosionFlash.scale.setScalar(1)
    this.explosionLight.position.set(
      this.virusPosition.x,
      this.virusBaseY - 4,
      this.virusPosition.z,
    )
    this.explosionLight.intensity = EXPLOSION_LIGHT_INTENSITY
    this.onExplosion?.(this.virusPosition.clone())

    const playerHit =
      !!ctx.playerPosition &&
      this.distanceToVirus(ctx.playerPosition.x, ctx.playerPosition.z) <= BLAST_RADIUS
    const landerHit =
      !!ctx.landerPosition &&
      this.distanceToVirus(ctx.landerPosition.x, ctx.landerPosition.z) <= BLAST_RADIUS

    if (playerHit) {
      this.onKillPlayer?.()
    }
    if (landerHit) {
      this.onDestroyLander?.()
    }
    if (playerHit || landerHit) {
      this._status = 'failed'
      this.onPrompt?.('BLAST RADIUS BREACHED')
      return
    }

    this._status = 'completed'
    this.onPrompt?.(null)
    this.clearEncounter()
    this.clearEnemyProjectiles()
    this.hostages.clear()
    this.onComplete?.(this.objectiveIndex)
  }

  private syncExplosionFlash(dt: number): void {
    if (this.explosionFlashTimer <= 0) return

    this.explosionFlashTimer = Math.max(0, this.explosionFlashTimer - dt)
    const t = 1 - this.explosionFlashTimer / EXPLOSION_FLASH_DURATION
    const scale = 1 + t * EXPLOSION_FLASH_MAX_SCALE
    this.explosionFlash.scale.setScalar(scale)
    const opacity = (1 - t) * 0.72
    ;(this.explosionFlash.material as THREE.MeshBasicMaterial).opacity = opacity
    this.explosionLight.intensity = (1 - t) * EXPLOSION_LIGHT_INTENSITY

    if (this.explosionFlashTimer <= 0) {
      this.explosionFlash.visible = false
      // Light stays in the scene with `.visible = true`; intensity 0 is the off state.
      this.explosionLight.intensity = 0
    }
  }

  private clearEncounter(): void {
    for (const enemy of this.encounterEnemies) {
      this.projectileSystem.removeEnemy(enemy)
    }
    this.encounterEnemies.length = 0

    // Return live controllers to the shared pool — never dispose them here.
    // The pool owns the GPU resources for the level lifetime.
    for (const ctrl of this.groundControllers.values()) {
      this.enemyControllerPool.releasePhage(ctrl)
    }
    this.groundControllers.clear()

    for (const ctrl of this.chimeraControllers.values()) {
      this.enemyControllerPool.releaseChimera(ctrl)
    }
    this.chimeraControllers.clear()

    for (const ctrl of this.spireControllers.values()) {
      this.enemyControllerPool.releaseSpire(ctrl)
    }
    this.spireControllers.clear()

    this.enemyDirector.despawnAll()
    this.enemyByHandleId.clear()
    this.enemyTiltCache.clear()
    this.enemyDirector.setHostageTargets([])
    this.encounterTotalPlanned = 0
  }

  /** Cancel any pending paced encounter spawn pulses, if scheduled. */
  private cancelEncounterSpawnTimer(): void {
    if (this.encounterSpawnTimer !== null) {
      Timer.cancel(this.encounterSpawnTimer)
      this.encounterSpawnTimer = null
    }
    this.pendingPulses.length = 0
  }

  private clearEnemyProjectiles(): void {
    this.enemyProjectileSystem.dispose()
    this.enemyProjectileMeshPool.disposeAll()
  }

  private fail(cause: string): void {
    if (this._status === 'failed' || this._status === 'completed') return
    this._status = 'failed'
    if (this.releaseTimerHandle !== null) {
      Timer.cancel(this.releaseTimerHandle)
      this.releaseTimerHandle = null
    }
    this.cancelEncounterSpawnTimer()
    this.onPrompt?.(cause.toUpperCase())
    this.clearEncounter()
    this.clearEnemyProjectiles()
    this.clearContainedHostageVisuals()
    this.hostages.clear()
    this.onFail?.(this.objectiveIndex, cause)
  }

  private advanceStep(index: number): void {
    const step = this._steps[index]
    if (!step || step.complete) return
    step.complete = true
    step.active = false

    const next = this._steps.find((candidate) => !candidate.complete)
    if (next) next.active = true
    this.onStepChange?.(this.objectiveIndex, this._steps)
  }

  private distanceToVirus(x: number, z: number): number {
    const dx = x - this.virusPosition.x
    const dz = z - this.virusPosition.z
    return Math.sqrt(dx * dx + dz * dz)
  }

  private isLanderInsideSite(ctx: MiniGameContext): boolean {
    if (!ctx.landerPosition) return false
    return this.distanceToVirus(ctx.landerPosition.x, ctx.landerPosition.z) <= LANDING_SITE_RADIUS
  }

  private ownsHostage(hostage: Hostage): boolean {
    return this.hostages.getHostageEntitiesForDirector().includes(hostage)
  }

  private liveEnemyCount(): number {
    let count = 0
    for (const handle of this.enemyDirector.enemies) {
      if (handle.enemy.alive) count++
    }
    return count
  }
}
