/**
 * Patrol drone controller — wraps {@link DroneModel}, an {@link Enemy},
 * the {@link DroneFsm}, and the wander behaviour into a single tickable
 * agent. Mirrors the {@link TurretController} API surface so the
 * director layer can manage both enemy types with the same hooks
 * (`onArmed`, `onDisarmed`, `onDestroyed`, `onKilled`).
 *
 * Differences from the turret:
 *
 * - Drones own a {@link DronePatrolRect} (the room footprint) instead
 *   of a half-space — they never leave their assigned room.
 * - Death is a procedural tumble, not an animation clip.
 * - LOS uses a smaller near-skip; drones aren't mounted to a wall so
 *   the first sample doesn't false-positive on a ceiling block.
 *
 * @author guinetik
 * @date 2026-05-16
 * @spec docs/superpowers/specs/2026-05-16-station-drone-enemy-design.md
 */
import * as THREE from 'three'
import { useAudio } from '@/audio/useAudio'
import { Enemy } from '@/lib/fps/enemy'
import type { EnemyProjectileSystem } from '@/lib/fps/enemyProjectileSystem'
import type { StationCollider } from '@/lib/station/StationCollider'
import {
  DRONE_BURST_INTERVAL_SECONDS,
  DRONE_BURST_REST_SECONDS,
  DRONE_BURST_SHOT_COUNT,
  DRONE_DART_DAMAGE,
  DRONE_DART_SPEED,
  DRONE_FIRE_RANGE,
  DRONE_HIT_RADIUS,
  DRONE_MAX_HP,
} from '@/lib/fps/drone/droneConfig'
import { DroneFsm } from '@/lib/fps/drone/droneFsm'
import {
  makeInitialWanderState,
  tickWander,
  type DronePatrolRect,
  type DroneWanderState,
} from '@/lib/fps/drone/droneWanderBehavior'
import { DroneModel } from '@/three/DroneModel'

/**
 * Sample step (world metres) along the drone-to-player segment used for
 * line-of-sight checks. Same density as the turret's check — small
 * enough to catch a wall blocker without burning the CPU.
 */
const DRONE_LOS_SAMPLE_STEP = 0.4

/**
 * Skip every LOS sample within this radius (world metres) of the drone.
 * Smaller than the turret's value because drones hover in open rooms
 * rather than mounted to a wall — the first interior sample is rarely
 * a false-positive blocker.
 */
const DRONE_LOS_NEAR_SKIP = 0.3

/** Initial delay between transitioning into a burst and the first shot. */
const DRONE_FIRST_SHOT_DELAY = 0.35

/**
 * Beat (seconds) between HP hitting zero and the procedural fold
 * animation starting. Lets the destruction VFX + boom read on the
 * killing-shot frame before the model sags toward the floor.
 */
const DRONE_DEATH_FOLD_DELAY = 0.18

/**
 * Y offset (world metres) from the drone's hover anchor down to the
 * approximate muzzle, where bolts spawn. Lines the dart up with the
 * visible face panel rather than the drone's origin.
 */
const DRONE_MUZZLE_Y_OFFSET = -0.1

/**
 * Maximum horizontal distance (world metres) from the player a wander
 * target may sit. When the FSM yanks the drone into `firing` the
 * controller temporarily latches a wander target very close to the
 * current position so the drone stops drifting mid-burst.
 */
const DRONE_HOLD_TARGET_RADIUS = 0.05

/**
 * Internal FSM-equivalent label used by the controller to mirror the
 * turret's public {@link TurretController.getState}.  Pure inspection
 * surface — no logic depends on it.
 */
export type DroneControllerState = 'patrolling' | 'alerting' | 'firing' | 'cooling' | 'dead'

/**
 * Fully-wired drone instance — visual + enemy + AI tick + wander state.
 * Spawn via {@link StationDroneDirector.populateDronesInRooms}, which
 * positions the model, registers the enemy with the projectile system,
 * and adds it to the per-frame tick loop.
 */
export class DroneController {
  /** GLB-backed visual + animation control. */
  readonly model: DroneModel

  /** Enemy entity registered with the player's `ProjectileSystem`. */
  readonly enemy: Enemy

  /** Fires once when the drone first transitions to a fire-ready state. */
  onArmed: (() => void) | null = null

  /** Fires when the drone stops being armed (cooling or destroyed). */
  onDisarmed: (() => void) | null = null

  /**
   * Fires the instant HP hits zero, before the death tumble starts.
   * Position passed is the wrapper position in world space.
   */
  onDestroyed: ((x: number, y: number, z: number) => void) | null = null

  /**
   * Fires exactly once after the death tumble finishes. The director
   * listens to this to dispose the drone.
   */
  onKilled: ((x: number, y: number, z: number) => void) | null = null

  private readonly projectiles: EnemyProjectileSystem
  private readonly fsm = new DroneFsm()
  private readonly rng: () => number

  /** Patrol rectangle the drone never leaves. `null` until populated. */
  private rect: DronePatrolRect | null = null

  /** Wander state — re-rolled each frame by {@link tickWander}. */
  private wanderState: DroneWanderState | null = null

  /** Optional station collider used for line-of-sight checks. */
  private collider: StationCollider | null = null

  /** True once the controller fired `onArmed` for the current arm cycle. */
  private armedNotified = false

  /** Shots remaining in the current burst. */
  private burstShotsRemaining = 0

  /** Seconds until the next inter-burst shot. */
  private interBurstRemaining = 0

  /** Seconds until the next burst is allowed to start. */
  private burstCooldownRemaining = 0

  /**
   * Seconds remaining before the death tumble starts. `> 0` means
   * we're in the brief stunned beat after HP hit zero.
   */
  private deathFoldDelay = 0

  /** Whether {@link DroneModel.playDeathSequence} has been kicked off. */
  private foldStarted = false

  /** Reused scratch for muzzle position rebuilt each shot. */
  private readonly _muzzle = new THREE.Vector3()

  /** Reused scratch for aim direction per shot. */
  private readonly _aim = new THREE.Vector3()

  private readonly audio = useAudio()

  /**
   * @param projectiles - Shared enemy-projectile system for laser dart spawns.
   * @param rng - Random source for wander targets / death axis. Defaults
   *   to `Math.random` so production behavior is non-deterministic; tests
   *   inject a seeded source.
   */
  constructor(projectiles: EnemyProjectileSystem, rng: () => number = Math.random) {
    this.model = new DroneModel()
    this.enemy = new Enemy({ maxHp: DRONE_MAX_HP, hitRadius: DRONE_HIT_RADIUS })
    this.enemy.onDeath = () => this.die()
    this.projectiles = projectiles
    this.rng = rng
    // Wrap takeDamage so every player-bolt hit triggers the magenta
    // hit-confirmation flash on the drone body. Binding the original
    // first keeps the standard death pipeline intact.
    const originalTakeDamage = this.enemy.takeDamage.bind(this.enemy)
    this.enemy.takeDamage = (amount: number) => {
      if (!this.enemy.alive) return
      originalTakeDamage(amount)
      if (this.enemy.alive) this.model.flashHitTaken()
    }
  }

  /** Current high-level controller state. */
  getState(): DroneControllerState {
    return this.fsm.state
  }

  /**
   * Hand the station collider to this drone for line-of-sight checks.
   *
   * @param collider - Built station collider, or `null` to disable LOS.
   */
  setCollider(collider: StationCollider | null): void {
    this.collider = collider
  }

  /**
   * Bind this drone to its patrol rectangle. Wander targets clamp to
   * the rectangle's interior so the drone never leaves the room.
   *
   * @param rect - Patrol rectangle in world XZ + floor Y baseline.
   */
  setPatrolRect(rect: DronePatrolRect): void {
    this.rect = rect
    this.wanderState = makeInitialWanderState(rect, this.rng)
  }

  /**
   * Place the drone at its hover baseline + initial yaw. The `Enemy`
   * position is mirrored to the wrapper so player bolts intersect the
   * body, not the model origin.
   *
   * @param x - World X.
   * @param y - World Y (hover baseline).
   * @param z - World Z.
   * @param yaw - Initial yaw (radians).
   */
  placeAt(x: number, y: number, z: number, yaw: number): void {
    this.model.placeAt(x, y, z, yaw)
    this.enemy.position.set(x, y, z)
  }

  /**
   * Per-frame update. Reads the player's world XYZ + sim dt, updates
   * the FSM, runs the wander step, applies the bob, and runs burst
   * logic when the FSM says fire.
   *
   * @param dt - Frame delta in seconds.
   * @param playerX - Player world X position.
   * @param playerY - Player world Y position.
   * @param playerZ - Player world Z position.
   */
  tick(dt: number, playerX: number, playerY: number, playerZ: number): void {
    if (this.fsm.state === 'dead' || !this.enemy.alive) {
      this.tickDying(dt)
      return
    }

    const dx = playerX - this.model.position.x
    const dy = playerY - this.model.position.y
    const dz = playerZ - this.model.position.z
    const distance = Math.hypot(dx, dy, dz)
    const hasLineOfSight = this.hasLineOfSightTo(playerX, playerZ)

    const wasArmed = this.fsm.state === 'firing' || this.fsm.state === 'alerting'
    const intent = this.fsm.tick({
      dt,
      distanceToPlayer: distance,
      hasLineOfSight,
      isAlive: this.enemy.alive,
    })
    const nowArmed = this.fsm.state === 'firing' || this.fsm.state === 'alerting'
    this.syncArmedNotifications(wasArmed, nowArmed)

    this.model.setAlertColor(intent.shouldAlertColor)
    if (intent.shouldFacePlayer) {
      this.model.faceWorldXZ(playerX, playerZ)
    } else if (this.wanderState) {
      this.model.faceWorldXZ(this.wanderState.targetX, this.wanderState.targetZ)
    }

    // Wander step — runs in every non-dead state. While the FSM is in
    // `firing` we hold position via a tight wander target so the drone
    // doesn't drift mid-burst.
    if (this.rect && this.wanderState) {
      if (this.fsm.state === 'firing') this.holdPosition()
      const result = tickWander(
        this.wanderState,
        { x: this.model.position.x, z: this.model.position.z, dt, rng: this.rng },
        this.rect,
      )
      // Integrate XZ movement into the wrapper position; clamp to rect.
      const nextX = THREE.MathUtils.clamp(
        this.model.position.x + result.moveX * dt,
        this.rect.minX,
        this.rect.maxX,
      )
      const nextZ = THREE.MathUtils.clamp(
        this.model.position.z + result.moveZ * dt,
        this.rect.minZ,
        this.rect.maxZ,
      )
      this.model.position.x = nextX
      this.model.position.z = nextZ
      this.enemy.position.set(nextX, this.model.position.y, nextZ)
      this.model.setHoverBobOffset(result.bobY)
    }

    if (intent.wantsToFire) {
      this.tickFiring(dt, playerX, playerY, playerZ)
    } else {
      // Reset burst pacing so the next entry into firing starts fresh.
      this.burstShotsRemaining = 0
      this.interBurstRemaining = 0
      this.burstCooldownRemaining = DRONE_FIRST_SHOT_DELAY
    }

    this.model.tick(dt)
  }

  /** Whether the drone is currently armed (alerting) or actively firing. */
  isArmedOrFiring(): boolean {
    return this.fsm.state === 'alerting' || this.fsm.state === 'firing'
  }

  /** Release GPU + scene resources. */
  dispose(): void {
    this.model.dispose()
  }

  /**
   * Sample the segment from the drone to the player's XZ and return
   * `true` only if every intermediate point lies inside the station's
   * walkable union. Mirrors the turret's check but with a smaller
   * near-skip — the drone isn't mounted to a wall.
   *
   * @param playerX - Player world X.
   * @param playerZ - Player world Z.
   * @returns `true` when the line of sight is clear.
   */
  private hasLineOfSightTo(playerX: number, playerZ: number): boolean {
    const collider = this.collider
    if (!collider) return true
    const dx = playerX - this.model.position.x
    const dz = playerZ - this.model.position.z
    const dist = Math.hypot(dx, dz)
    if (dist <= DRONE_LOS_NEAR_SKIP) return true
    const startDist = DRONE_LOS_NEAR_SKIP
    const endDist = Math.max(startDist, dist - DRONE_LOS_SAMPLE_STEP)
    const samples = Math.max(1, Math.ceil((endDist - startDist) / DRONE_LOS_SAMPLE_STEP))
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

  /**
   * Fire `onArmed` / `onDisarmed` exactly once per arm cycle, mirroring
   * the turret pattern so the director's armed-count book-keeping is
   * symmetric across enemy types.
   *
   * @param wasArmed - Whether the FSM was armed last tick.
   * @param nowArmed - Whether the FSM is armed this tick.
   */
  private syncArmedNotifications(wasArmed: boolean, nowArmed: boolean): void {
    if (nowArmed && !this.armedNotified) {
      this.armedNotified = true
      this.onArmed?.()
    } else if (!nowArmed && wasArmed && this.armedNotified) {
      this.armedNotified = false
      this.onDisarmed?.()
    }
  }

  /**
   * Burst-pause cycle inside the `firing` state. Mirrors the turret's
   * tickFiring exactly — first-shot delay, inter-shot interval, burst
   * count, rest between bursts — but driven by drone-tuned constants.
   *
   * @param dt - Frame delta in seconds.
   * @param playerX - Player world X position.
   * @param playerY - Player world Y position.
   * @param playerZ - Player world Z position.
   */
  private tickFiring(
    dt: number,
    playerX: number,
    playerY: number,
    playerZ: number,
  ): void {
    // Drones only pull the trigger inside the fire range. Outside that,
    // they still hold the alert pose but don't waste ammo.
    const dx = playerX - this.model.position.x
    const dz = playerZ - this.model.position.z
    if (Math.hypot(dx, dz) > DRONE_FIRE_RANGE) return

    if (this.burstShotsRemaining > 0) {
      this.interBurstRemaining -= dt
      if (this.interBurstRemaining <= 0) {
        this.fireOneShot(playerX, playerY, playerZ)
        this.burstShotsRemaining--
        if (this.burstShotsRemaining > 0) {
          this.interBurstRemaining = DRONE_BURST_INTERVAL_SECONDS
        } else {
          this.burstCooldownRemaining = DRONE_BURST_REST_SECONDS
        }
      }
      return
    }
    this.burstCooldownRemaining -= dt
    if (this.burstCooldownRemaining <= 0) {
      this.burstShotsRemaining = DRONE_BURST_SHOT_COUNT
      this.interBurstRemaining = 0
    }
  }

  /**
   * Spawn a single laser dart aimed at the player and play the muzzle
   * flash + audio cue. Mirrors the turret pattern with drone constants.
   *
   * @param playerX - Player world X position.
   * @param playerY - Player world Y position.
   * @param playerZ - Player world Z position.
   */
  private fireOneShot(playerX: number, playerY: number, playerZ: number): void {
    this._muzzle.set(
      this.model.position.x,
      this.model.position.y + DRONE_MUZZLE_Y_OFFSET,
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
      DRONE_DART_SPEED,
      DRONE_DART_DAMAGE,
    )
    this.model.flashMuzzle()
    this.audio.play('sfx.drone.laser')
  }

  /**
   * Clamp the wander target to a tiny radius around the current
   * position so the drone effectively hovers in place while firing.
   */
  private holdPosition(): void {
    if (!this.wanderState) return
    this.wanderState.targetX = this.model.position.x + (this.rng() - 0.5) * DRONE_HOLD_TARGET_RADIUS
    this.wanderState.targetZ = this.model.position.z + (this.rng() - 0.5) * DRONE_HOLD_TARGET_RADIUS
    this.wanderState.secondsSinceReroll = 0
  }

  /**
   * Death pipeline — mirrors the turret pattern. Fires `onDestroyed`
   * immediately (so the director can spawn VFX on the killing-shot
   * frame), then defers the procedural tumble by
   * {@link DRONE_DEATH_FOLD_DELAY}, then calls `onKilled` once the
   * tumble finishes.
   */
  private die(): void {
    this.burstShotsRemaining = 0
    this.interBurstRemaining = 0
    this.deathFoldDelay = DRONE_DEATH_FOLD_DELAY
    this.foldStarted = false
    if (this.armedNotified) {
      this.armedNotified = false
      this.onDisarmed?.()
    }
    this.model.flashDestruction()
    this.onDestroyed?.(this.model.position.x, this.model.position.y, this.model.position.z)
  }

  /**
   * Per-frame update once the drone is dead — runs the fold-delay
   * timer, kicks off the procedural tumble, and fires `onKilled` when
   * the tumble resolves.
   *
   * @param dt - Frame delta in seconds.
   */
  private tickDying(dt: number): void {
    if (!this.foldStarted) {
      this.deathFoldDelay -= dt
      if (this.deathFoldDelay <= 0) {
        this.foldStarted = true
        this.model.playDeathSequence(() => {
          this.onKilled?.(this.model.position.x, this.model.position.y, this.model.position.z)
        })
      }
    }
    this.model.tick(dt)
  }
}
