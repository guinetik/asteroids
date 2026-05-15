/**
 * Ceiling-mounted security turret — controller / FSM.
 *
 * Owns one {@link TurretModel}, one {@link Enemy} (so the player's bolts
 * can shoot it down via `ProjectileSystem.addEnemy`), and a state
 * machine that drives the model's animation phases in response to player
 * proximity:
 *
 * ```
 *   stowed --[player < DETECT]--> deploying --[anim done]--> armed
 *   armed  --[player < FIRE]----> firing  --[player > DETECT_HYS]--> retracting
 *   armed  --[player > DETECT_HYS]----------------------------------> retracting
 *   firing --[player > FIRE_HYS]-> armed
 *   retracting --[anim done]----> stowed
 * ```
 *
 * Firing is a burst-pause cycle: each burst spawns
 * {@link TURRET_BURST_SHOT_COUNT} laser-darts at
 * {@link TURRET_BURST_INTERVAL_SECONDS} cadence, aiming at the player's
 * position *latched at the moment of each shot* so the player can dodge
 * by sprinting after the muzzle flash. After a burst the turret waits
 * {@link TURRET_BURST_REST_SECONDS} before firing again.
 *
 * Death: when the player drains the turret's HP, the visual plays its
 * retract animation and the enemy is permanently disabled (still
 * present in the scene as a folded ceiling block).
 *
 * @author guinetik
 * @date 2026-05-15
 * @spec docs/space-station-update-gdd.md
 */
import * as THREE from 'three'
import { Enemy } from '@/lib/fps/enemy'
import type { EnemyProjectileSystem } from '@/lib/fps/enemyProjectileSystem'
import type { StationCollider } from '@/lib/station/StationCollider'
import { TurretModel } from '@/three/TurretModel'

/** Sample step (world metres) along the turret-to-player segment used
 * for line-of-sight checks. Smaller = more accurate but more work per
 * tick. 0.4 m gives ~20 samples across the longest expected sight
 * line and reliably catches a wall blocker (room walls are at least
 * 0.3 m thick after collider expansion). */
const TURRET_LOS_SAMPLE_STEP = 0.4

/**
 * Skip every LOS sample within this radius (world metres) of the
 * turret. The turret is mounted right at the doorway corner — its
 * XZ projection sits on or inside the wall blocker, so the first
 * couple of interior samples would read as "blocked" and the turret
 * would refuse to fire even when the player is in plain view. This
 * radius needs to be larger than the wall's collider thickness +
 * the corner-lateral-offset used at spawn time.
 */
const TURRET_LOS_NEAR_SKIP = 1.6

/** Distance (world metres) at which a stowed turret begins deploying. */
const TURRET_DETECT_RANGE = 8
/** Hysteresis pad: turret retracts only once the player crosses this distance. */
const TURRET_DETECT_RANGE_HYSTERESIS = 10
/** Distance at which an armed turret transitions to firing. */
const TURRET_FIRE_RANGE = 7
/** Hysteresis pad: a firing turret only stops firing past this distance. */
const TURRET_FIRE_RANGE_HYSTERESIS = 8.5

/** Maximum HP — tanky against stock LSR; ~8 hits at 1× damage. */
const TURRET_MAX_HP = 200
/** Collision radius for player bolts (loose box around the mount block). */
const TURRET_HIT_RADIUS = 0.9

/** Shots fired in one burst. */
const TURRET_BURST_SHOT_COUNT = 3
/** Delay between shots in one burst (seconds). */
const TURRET_BURST_INTERVAL_SECONDS = 0.18
/** Pause between consecutive bursts (seconds). */
const TURRET_BURST_REST_SECONDS = 4
/** Initial delay between transitioning to fire state and first shot. */
const TURRET_FIRST_SHOT_DELAY = 0.4

/** Laser dart projectile speed (units/s). Tuned slow enough that the
 * player can side-step a shot at typical engagement range (~5–7 m,
 * ~0.5 s travel time) given the station's reduced movement scale. */
const TURRET_DART_SPEED = 13
/** Damage per dart on player hit — 12 % of stock player HP (100). */
const TURRET_DART_DAMAGE = 12

/**
 * Y offset (world metres) from the turret's mount position down to the
 * approximate barrel muzzle, where bolts spawn. Lines the dart up with
 * the visible barrel rather than emanating from the ceiling block.
 */
const TURRET_MUZZLE_Y_OFFSET = -1.2

/**
 * Random RNG threshold: roll uniform [0, 1); a turret spawns at this
 * corner if the roll is below this value. 0.5 = 50% per corner.
 */
export const TURRET_CORNER_SPAWN_PROBABILITY = 0.5

/**
 * Internal FSM states.
 */
export type TurretState = 'stowed' | 'deploying' | 'armed' | 'firing' | 'retracting' | 'dead'

/**
 * Fully-wired turret instance — visual + enemy + AI tick. Spawn via
 * {@link StationTurretDirector.spawn} which positions the model, registers
 * the enemy with the projectile system, and adds it to the per-frame tick
 * loop.
 */
export class TurretController {
  /** GLB-backed visual + animation control. */
  readonly model: TurretModel
  /** Enemy entity registered with the player's `ProjectileSystem`. */
  readonly enemy: Enemy

  /** Fires once when the turret first transitions to a fire-ready state. */
  onArmed: (() => void) | null = null
  /** Fires when the turret stops being armed (retracted or destroyed). */
  onDisarmed: (() => void) | null = null
  /**
   * Fires exactly once after the death animation finishes folding the
   * turret back into the ceiling. The director listens to this to
   * spawn explosion VFX + dispose the turret. Position passed is the
   * mount position in world space.
   */
  onKilled: ((x: number, y: number, z: number) => void) | null = null

  private readonly projectiles: EnemyProjectileSystem
  /** Optional station collider used for line-of-sight checks. */
  private collider: StationCollider | null = null
  private state: TurretState = 'stowed'
  private secondsInState = 0
  private burstShotsRemaining = 0
  private burstCooldownRemaining = 0
  private interBurstRemaining = 0
  /** Reused scratch for player aim direction. */
  private readonly _aim = new THREE.Vector3()
  /** World-space muzzle position rebuilt each shot. */
  private readonly _muzzle = new THREE.Vector3()
  /** True once the controller fired `onArmed` for the current arm cycle. */
  private armedNotified = false

  /**
   * @param projectiles - Shared enemy-projectile system for laser dart spawns.
   */
  constructor(projectiles: EnemyProjectileSystem) {
    this.model = new TurretModel()
    this.enemy = new Enemy({ maxHp: TURRET_MAX_HP, hitRadius: TURRET_HIT_RADIUS })
    this.enemy.onDeath = () => this.die()
    this.projectiles = projectiles
    // Wrap takeDamage so every player-bolt hit triggers the magenta
    // hit-confirmation flash on the turret body. Bind the original
    // method first so the wrapper still drives the death pipeline.
    const originalTakeDamage = this.enemy.takeDamage.bind(this.enemy)
    this.enemy.takeDamage = (amount: number) => {
      if (!this.enemy.alive) return
      originalTakeDamage(amount)
      if (this.enemy.alive) this.model.flashHitTaken()
    }
  }

  /** Current FSM state. */
  getState(): TurretState {
    return this.state
  }

  /**
   * Hook the station collider so the turret only deploys / fires when
   * the player is in the same corridor segment (no wall between us).
   * Without this, turrets across the station start shooting through
   * walls the moment the player wanders within `TURRET_DETECT_RANGE`.
   *
   * @param collider - Built station collider, or `null` to disable LOS.
   */
  setCollider(collider: StationCollider | null): void {
    this.collider = collider
  }

  /**
   * Place the turret at a ceiling corner. The `Enemy` position is set to
   * the muzzle so player bolts intersect the body, not the ceiling.
   *
   * @param x - World X.
   * @param ceilingY - World Y of the ceiling mount.
   * @param z - World Z.
   * @param yaw - Initial yaw (radians). Turret will rotate to face the
   *   player when armed; this is just the default outward-into-corridor
   *   orientation while stowed.
   */
  placeAt(x: number, ceilingY: number, z: number, yaw: number): void {
    this.model.placeAt(x, ceilingY, z, yaw)
    this.enemy.position.set(x, ceilingY + TURRET_MUZZLE_Y_OFFSET, z)
  }

  /**
   * Per-frame update. Reads the player's world XZ + sim dt, updates the
   * FSM, advances burst timers, and ticks the animation model.
   *
   * @param dt - Frame delta in seconds.
   * @param playerX - Player world X position.
   * @param playerY - Player world Y position (used for aim only).
   * @param playerZ - Player world Z position.
   */
  tick(dt: number, playerX: number, playerY: number, playerZ: number): void {
    this.secondsInState += dt
    if (this.state === 'dead') {
      this.model.tick(dt)
      return
    }

    const dx = playerX - this.model.position.x
    const dz = playerZ - this.model.position.z
    const distance = Math.hypot(dx, dz)
    const hasLOS = this.hasLineOfSightTo(playerX, playerZ)

    switch (this.state) {
      case 'stowed':
        if (hasLOS && distance <= TURRET_DETECT_RANGE) this.enterDeploying()
        break
      case 'deploying':
        // Track the player even while deploying so the moment the visual
        // unfolds the barrel is already looking the right way.
        this.model.faceWorldXZ(playerX, playerZ)
        break
      case 'armed':
        this.model.faceWorldXZ(playerX, playerZ)
        if (!hasLOS || distance > TURRET_DETECT_RANGE_HYSTERESIS) {
          this.enterRetracting()
        } else if (distance <= TURRET_FIRE_RANGE) {
          this.enterFiring()
        }
        break
      case 'firing':
        this.model.faceWorldXZ(playerX, playerZ)
        if (!hasLOS || distance > TURRET_DETECT_RANGE_HYSTERESIS) {
          this.enterRetracting()
        } else if (distance > TURRET_FIRE_RANGE_HYSTERESIS) {
          this.enterArmed()
        } else {
          this.tickFiring(dt, playerX, playerY, playerZ)
        }
        break
      case 'retracting':
        // animation drives the transition (see `enterRetracting()`)
        break
    }

    this.model.tick(dt)
  }

  /** Whether the turret is currently armed or actively firing. */
  isArmedOrFiring(): boolean {
    return this.state === 'armed' || this.state === 'firing'
  }

  /** Release GPU + scene resources. */
  dispose(): void {
    this.model.dispose()
  }

  /**
   * Sample the segment from the turret to the player's XZ and return
   * `true` only if every intermediate point lies inside the station's
   * walkable union. Treats a missing collider as "always visible" so
   * unit tests + early init frames don't break. Skips the endpoints
   * themselves so we don't false-positive on a player whose footprint
   * is grazing a corridor wall.
   */
  private hasLineOfSightTo(playerX: number, playerZ: number): boolean {
    const collider = this.collider
    if (!collider) return true
    const dx = playerX - this.model.position.x
    const dz = playerZ - this.model.position.z
    const dist = Math.hypot(dx, dz)
    if (dist <= TURRET_LOS_NEAR_SKIP) return true
    // Walk the segment from the turret toward the player but skip the
    // first {@link TURRET_LOS_NEAR_SKIP} metres so we don't read the
    // wall the turret is mounted to as an occluder. Stops at the
    // player's last sample so we don't false-positive on a player
    // standing flush against an opposite wall.
    const startDist = TURRET_LOS_NEAR_SKIP
    const endDist = Math.max(startDist, dist - TURRET_LOS_SAMPLE_STEP)
    const samples = Math.max(1, Math.ceil((endDist - startDist) / TURRET_LOS_SAMPLE_STEP))
    const invLen = 1 / dist
    for (let i = 0; i <= samples; i++) {
      const d = startDist + (i * (endDist - startDist)) / samples
      const t = d * invLen
      const sx = this.model.position.x + dx * t
      const sz = this.model.position.z + dz * t
      if (collider.isPointBlocked(sx, sz)) return false
    }
    return true
  }

  // ── State transitions ────────────────────────────────────────────────

  private enterDeploying(): void {
    this.state = 'deploying'
    this.secondsInState = 0
    this.model.playDeploy(() => this.enterArmed())
  }

  private enterArmed(): void {
    this.state = 'armed'
    this.secondsInState = 0
    this.burstCooldownRemaining = TURRET_FIRST_SHOT_DELAY
    this.burstShotsRemaining = 0
    this.interBurstRemaining = 0
    this.model.holdArmed()
    if (!this.armedNotified) {
      this.armedNotified = true
      this.onArmed?.()
    }
  }

  private enterFiring(): void {
    this.state = 'firing'
    this.secondsInState = 0
    this.burstCooldownRemaining = Math.max(this.burstCooldownRemaining, 0)
    // Stay parked at the end-of-deploy pose and let the cannon-bone aim
    // override drive the visual. The 2→5 s fire animation in the GLB
    // pitches the cannon up/down and reads as "looking away" — we just
    // want a static deployed pose with the bone tracking the player.
    this.model.holdArmed()
  }

  private enterRetracting(): void {
    this.state = 'retracting'
    this.secondsInState = 0
    this.burstShotsRemaining = 0
    this.interBurstRemaining = 0
    this.model.playRetract(() => {
      if (this.state !== 'retracting') return
      this.state = 'stowed'
      this.model.snapStowed()
    })
    if (this.armedNotified) {
      this.armedNotified = false
      this.onDisarmed?.()
    }
  }

  private die(): void {
    this.state = 'dead'
    this.burstShotsRemaining = 0
    this.interBurstRemaining = 0
    if (this.armedNotified) {
      this.armedNotified = false
      this.onDisarmed?.()
    }
    // Play the authored animation forward from wherever we were
    // parked. The clip's tail (5–6 s) is the retract motion — the
    // turret tilts up and folds back into the ceiling.
    this.model.playDeathSequence(() => {
      this.onKilled?.(this.model.position.x, this.model.position.y, this.model.position.z)
    })
  }

  // ── Firing logic ─────────────────────────────────────────────────────

  private tickFiring(
    dt: number,
    playerX: number,
    playerY: number,
    playerZ: number,
  ): void {
    if (this.burstShotsRemaining > 0) {
      this.interBurstRemaining -= dt
      if (this.interBurstRemaining <= 0) {
        this.fireOneShot(playerX, playerY, playerZ)
        this.burstShotsRemaining--
        if (this.burstShotsRemaining > 0) {
          this.interBurstRemaining = TURRET_BURST_INTERVAL_SECONDS
        } else {
          this.burstCooldownRemaining = TURRET_BURST_REST_SECONDS
        }
      }
      return
    }
    this.burstCooldownRemaining -= dt
    if (this.burstCooldownRemaining <= 0) {
      this.burstShotsRemaining = TURRET_BURST_SHOT_COUNT
      this.interBurstRemaining = 0
    }
  }

  private fireOneShot(playerX: number, playerY: number, playerZ: number): void {
    this._muzzle.set(
      this.model.position.x,
      this.model.position.y + TURRET_MUZZLE_Y_OFFSET,
      this.model.position.z,
    )
    const dx = playerX - this._muzzle.x
    const dy = playerY - this._muzzle.y
    const dz = playerZ - this._muzzle.z
    const len = Math.hypot(dx, dy, dz)
    if (len === 0) return
    this._aim.set(dx / len, dy / len, dz / len)
    this.projectiles.spawn(
      this._muzzle.x,
      this._muzzle.y,
      this._muzzle.z,
      this._aim.x,
      this._aim.y,
      this._aim.z,
      TURRET_DART_SPEED,
      TURRET_DART_DAMAGE,
    )
    this.model.flashMuzzle()
  }
}
