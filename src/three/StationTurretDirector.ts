/**
 * Station-interior turret director.
 *
 * Owns:
 * - The list of {@link TurretController} instances spawned at door corners.
 * - The shared {@link EnemyProjectileSystem} that turret darts fly through.
 * - The {@link TurretLaserDartMeshPool} that renders those darts.
 * - The alarm coordination flag: the global `sfx.station.alarm` SFX fires
 *   exactly once per "wave" — that is, when the *first* turret transitions
 *   into an armed state with no others already armed. If a second turret
 *   arms while the first is still active, no extra alarm fires. The flag
 *   resets when every turret has disarmed (retracted or destroyed), so the
 *   next fresh trip into a corridor plays the alarm again.
 *
 * Spawning: {@link populateFromEntrances} iterates a list of station
 * entrances, rolls
 * {@link TURRET_CORNER_SPAWN_PROBABILITY} per corner (L and R), and
 * places a turret at each lucky corner. The corner positions come from
 * the entrance's world anchor + its lateral axis ±
 * {@link TURRET_CORNER_LATERAL_OFFSET} along the wall, at ceiling Y.
 *
 * @author guinetik
 * @date 2026-05-15
 * @spec docs/space-station-update-gdd.md
 */
import * as THREE from 'three'
import { useAudio } from '@/audio/useAudio'
import { EnemyProjectileSystem } from '@/lib/fps/enemyProjectileSystem'
import type { StationCollider } from '@/lib/station/StationCollider'
import { ParticleEmitter } from '@/three/ParticleEmitter'
import type { StationEntrance } from '@/three/StationEntrance'
import { TurretController, TURRET_CORNER_SPAWN_PROBABILITY } from '@/three/TurretController'
import { TurretLaserDartMeshPool } from '@/three/TurretLaserDartMeshPool'

/**
 * Distance along the wall (entrance local X) from the doorway center to
 * each ceiling corner. The doorway is ~2 m wide (DOOR_BLOCKER_HALF_WIDTH
 * = 1 in StationEntrance), so 1.4 m places the turret just past the
 * door frame, flush with the inside wall.
 */
const TURRET_CORNER_LATERAL_OFFSET = 1.4
/**
 * Ceiling-mount Y offset *below* the configured ceiling height. The
 * model already has its mount block at its local +Y origin; a small
 * negative offset tucks the visible block flush against the ceiling
 * geometry so it doesn't z-fight the roof mesh.
 */
const TURRET_CEILING_INSET = 0.02
/** Number of laser-dart visual meshes pre-warmed on the pool. */
const TURRET_DART_POOL_SIZE = 24

/** Number of orange spark particles spawned per turret kill. */
const TURRET_KILL_SPARK_COUNT = 48
/** Number of bright white-hot flash particles spawned at the centre. */
const TURRET_KILL_FLASH_COUNT = 12
/** Number of grey smoke particles spawned per turret kill. */
const TURRET_KILL_SMOKE_COUNT = 28


/**
 * Default safe-zone radius (world metres) around the player's spawn
 * point inside which no turret is allowed to spawn. The first corridor
 * out of the hub sits squarely inside this radius so the player gets a
 * fair grace-period before any security trip happens — without this,
 * turrets at the spawn-side doors deploy and start firing the moment
 * the level loads, before the player has even pulled their gun.
 */
const TURRET_SPAWN_SAFE_RADIUS = 7

/**
 * Coordinates every ceiling turret in the station. Tickable via
 * {@link tick}.
 */
export class StationTurretDirector {
  /** Visual mesh pool for laser darts. */
  readonly dartPool: TurretLaserDartMeshPool
  /** Domain system computing dart trajectories + player hit detection. */
  readonly projectiles: EnemyProjectileSystem
  /** Spawned turret instances. */
  readonly turrets: TurretController[] = []

  private readonly scene: THREE.Scene
  private readonly audio = useAudio()
  private readonly playerProjectileAddEnemy: (enemy: import('@/lib/fps/enemy').Enemy) => void
  private readonly playerProjectileRemoveEnemy:
    | ((enemy: import('@/lib/fps/enemy').Enemy) => void)
    | null
  /** Shared station collider; turrets use it for line-of-sight checks. */
  private collider: StationCollider | null = null
  /** Hot white-yellow core flash spawned on turret death. */
  private readonly flashEmitter: ParticleEmitter
  /** Orange spark burst spawned on turret death. */
  private readonly sparkEmitter: ParticleEmitter
  /** Grey smoke drift spawned on turret death. */
  private readonly smokeEmitter: ParticleEmitter
  /** Reused scratch for particle velocity on emit. */
  private readonly _vfxVelScratch = new THREE.Vector3()
  /** Reused scratch for particle position on emit. */
  private readonly _vfxPosScratch = new THREE.Vector3()
  /** Count of turrets currently armed-or-firing. Drives the alarm SFX. */
  private armedCount = 0

  /**
   * @param scene - Three.js scene the turrets + darts attach to.
   * @param playerProjectileAddEnemy - Bound `ProjectileSystem.addEnemy` so
   *   the player's bolts can shoot the turret down.
   * @param playerProjectileRemoveEnemy - Optional companion bound
   *   `ProjectileSystem.removeEnemy` so dead turrets stop accepting hits
   *   from the player's bolt sim.
   */
  constructor(
    scene: THREE.Scene,
    playerProjectileAddEnemy: (enemy: import('@/lib/fps/enemy').Enemy) => void,
    playerProjectileRemoveEnemy?: (enemy: import('@/lib/fps/enemy').Enemy) => void,
  ) {
    this.scene = scene
    this.playerProjectileAddEnemy = playerProjectileAddEnemy
    this.playerProjectileRemoveEnemy = playerProjectileRemoveEnemy ?? null
    this.projectiles = new EnemyProjectileSystem()
    this.dartPool = new TurretLaserDartMeshPool(scene)
    this.dartPool.prewarm(TURRET_DART_POOL_SIZE)
    this.projectiles.onProjectileMove = this.dartPool.acquire
    this.projectiles.onProjectileRemoved = this.dartPool.release
    // Death VFX: a hot white core flash + a wide orange spark burst +
    // a slower grey smoke drift, all pool-based so killing several
    // turrets back-to-back doesn't allocate per shot.
    this.flashEmitter = new ParticleEmitter({
      poolSize: 32,
      color: new THREE.Color(0xfff4c2),
      size: 22,
      lifetime: 0.35,
      spread: 12,
      opacity: 1,
      soft: true,
      sizeGrowth: 2.2,
    })
    this.sparkEmitter = new ParticleEmitter({
      poolSize: 128,
      color: new THREE.Color(0xffaa44),
      size: 10,
      lifetime: 1.1,
      spread: 14,
      opacity: 1,
      soft: true,
      sizeGrowth: 1.6,
    })
    this.smokeEmitter = new ParticleEmitter({
      poolSize: 96,
      color: new THREE.Color(0x4a4a4a),
      size: 22,
      lifetime: 2.4,
      spread: 4,
      opacity: 0.7,
      soft: true,
      sizeGrowth: 3.0,
    })
    scene.add(this.flashEmitter.points)
    scene.add(this.sparkEmitter.points)
    scene.add(this.smokeEmitter.points)
  }

  /**
   * Wire the per-frame "player got hit" feedback. The host view passes a
   * function that flashes the damage HUD + applies HP loss to the
   * `FpsPlayerController`.
   *
   * @param handler - Called every time a turret dart connects with the
   *   player. Args: `damage`, `sourceX`, `sourceZ`.
   */
  setOnPlayerHit(handler: (damage: number, sourceX: number, sourceZ: number) => void): void {
    this.projectiles.onPlayerHit = handler
  }

  /**
   * Hand the station collider to every existing turret + cache it for
   * future spawns. Without this, turrets fire on the player through
   * walls — line-of-sight gating uses
   * {@link StationCollider.isPointBlocked} sampled along the
   * turret-to-player segment.
   *
   * @param collider - The built station collider.
   */
  setCollider(collider: StationCollider): void {
    this.collider = collider
    for (const turret of this.turrets) turret.setCollider(collider)
  }

  /**
   * Walk the station's entrance list, roll spawn probability per corner,
   * and instantiate one {@link TurretController} per accepted corner.
   *
   * @param entrances - Runtime entrance instances.
   * @param ceilingY - World Y where the ceiling mount block sits.
   * @param rng - Random source (uniform [0, 1)). Defaults to `Math.random`
   *   so production rolls are non-deterministic; tests inject a seeded
   *   source.
   */
  populateFromEntrances(
    entrances: readonly StationEntrance[],
    ceilingY: number,
    options?: {
      /** XZ position of the player's spawn point. */
      spawnXZ?: { x: number; z: number }
      /** Radius (world metres) around `spawnXZ` to keep clear of turrets. */
      safeRadius?: number
      /** Random source. Defaults to `Math.random`. */
      rng?: () => number
      /** Per-corner spawn probability override (0–1). Defaults to
       * {@link TURRET_CORNER_SPAWN_PROBABILITY}. */
      spawnProbability?: number
    },
  ): void {
    const mountY = ceilingY - TURRET_CEILING_INSET
    const rng = options?.rng ?? Math.random
    const spawnX = options?.spawnXZ?.x ?? 0
    const spawnZ = options?.spawnXZ?.z ?? 0
    const safeRadius = options?.safeRadius ?? TURRET_SPAWN_SAFE_RADIUS
    const spawnProbability = options?.spawnProbability ?? TURRET_CORNER_SPAWN_PROBABILITY
    const safeRadiusSq = safeRadius * safeRadius
    const anchorScratch = new THREE.Vector3()
    const lateralScratch = new THREE.Vector3()
    const forwardScratch = new THREE.Vector3()
    const quatScratch = new THREE.Quaternion()
    const cornerScratch = new THREE.Vector3()

    for (const entrance of entrances) {
      // Read the door slot's world position + its two horizontal axes.
      // Local X runs along the wall; local Z is the door's outward
      // (perpendicular-to-wall) direction. We extract both through the
      // group's world quaternion.
      anchorScratch.copy(entrance.anchor)
      entrance.group.getWorldQuaternion(quatScratch)
      lateralScratch.set(1, 0, 0).applyQuaternion(quatScratch).setY(0).normalize()
      forwardScratch.set(0, 0, 1).applyQuaternion(quatScratch).setY(0).normalize()

      // Skip the entire entrance if its door anchor lies inside the
      // spawn safe-zone. Both corners get filtered together so the
      // player never approaches a doorway with one turret on the safe
      // side and another on the danger side — reads as random gore.
      const adx = anchorScratch.x - spawnX
      const adz = anchorScratch.z - spawnZ
      if (adx * adx + adz * adz < safeRadiusSq) continue

      // Both turrets at this entrance face the same direction —
      // perpendicular to the wall, into the corridor. The +π flip
      // matches the GLB convention where the cannon rests along the
      // model's local -Z.
      const yaw = Math.atan2(forwardScratch.x, forwardScratch.z) + Math.PI

      // Half-space side: the entrance's forward axis points OUT of the
      // owning room into its target (corridor / next-room). Hub rooms
      // author every door connecting them to corridors, so +forward
      // consistently means "into the corridor". Pick the patrol side
      // as +forward and every doorway turret engages only when the
      // player is on the corridor side — the hub stays safe.
      //
      // Spawn position is intentionally unused here: the spawn point
      // can live inside any room (including the spawn corridor, not
      // the hub), and a spawn-vs-anchor sign flip would pick the
      // wrong side whenever the layout authored the entrance from a
      // non-hub room.
      void spawnX
      void spawnZ
      const patrolSide = 1

      for (const side of [-1, 1] as const) {
        if (rng() >= spawnProbability) continue
        cornerScratch
          .copy(lateralScratch)
          .multiplyScalar(side * TURRET_CORNER_LATERAL_OFFSET)
          .add(anchorScratch)
        const turret = this.spawnAt(cornerScratch.x, mountY, cornerScratch.z, yaw)
        turret.setPatrolHalfSpace(
          anchorScratch.x,
          anchorScratch.z,
          forwardScratch.x,
          forwardScratch.z,
          patrolSide,
        )
        this.turrets.push(turret)
      }
    }
  }

  /**
   * Update player position on the projectile system + tick every turret +
   * advance the enemy projectile sim.
   *
   * @param dt - Frame delta in seconds.
   * @param playerX - Player world X.
   * @param playerY - Player world Y.
   * @param playerZ - Player world Z.
   */
  tick(dt: number, playerX: number, playerY: number, playerZ: number): void {
    this.projectiles.setPlayerPosition(playerX, playerY, playerZ)
    // Iterate over a snapshot — `disposeTurret` may splice the list
    // mid-tick when a turret finishes its death animation.
    const snapshot = this.turrets.slice()
    for (const turret of snapshot) turret.tick(dt, playerX, playerY, playerZ)
    this.projectiles.tick(dt)
    this.flashEmitter.tick(dt)
    this.sparkEmitter.tick(dt)
    this.smokeEmitter.tick(dt)
  }

  /** Hard teardown — disposes every turret + the dart pool + the projectile sim. */
  dispose(): void {
    for (const turret of this.turrets) turret.dispose()
    this.turrets.length = 0
    this.projectiles.dispose()
    this.dartPool.disposeAll()
    this.flashEmitter.dispose()
    this.sparkEmitter.dispose()
    this.smokeEmitter.dispose()
  }

  private spawnAt(x: number, y: number, z: number, yaw: number): TurretController {
    const turret = new TurretController(this.projectiles)
    turret.placeAt(x, y, z, yaw)
    this.scene.add(turret.model.group)
    this.playerProjectileAddEnemy(turret.enemy)
    if (this.collider) turret.setCollider(this.collider)
    turret.onArmed = () => this.notifyArmed()
    turret.onDisarmed = () => this.notifyDisarmed()
    turret.onKilled = (kx, ky, kz) => this.disposeTurret(turret, kx, ky, kz)
    return turret
  }

  /**
   * Spawn the death VFX and tear down a single turret. Called after
   * the turret's death animation finishes folding back into the
   * ceiling. Removes the turret from the scene + the live ticker list
   * + the player's bolt-system enemy list. The turret stays gone for
   * the rest of the level.
   */
  private disposeTurret(turret: TurretController, x: number, y: number, z: number): void {
    this._vfxPosScratch.set(x, y - 0.6, z)
    // White-hot core flash — short-lived, expands fast.
    for (let i = 0; i < TURRET_KILL_FLASH_COUNT; i++) {
      this._vfxVelScratch.set(
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 4,
      )
      this.flashEmitter.emit(this._vfxPosScratch, this._vfxVelScratch)
    }
    // Orange sparks — radial-omni burst, slight upward bias so the
    // crown reads against the ceiling.
    for (let i = 0; i < TURRET_KILL_SPARK_COUNT; i++) {
      this._vfxVelScratch.set(
        (Math.random() - 0.5) * 24,
        Math.random() * 14 + 4,
        (Math.random() - 0.5) * 24,
      )
      this.sparkEmitter.emit(this._vfxPosScratch, this._vfxVelScratch)
    }
    // Smoke — slower, drifts up, lingers.
    for (let i = 0; i < TURRET_KILL_SMOKE_COUNT; i++) {
      this._vfxVelScratch.set(
        (Math.random() - 0.5) * 3,
        Math.random() * 2.2 + 0.6,
        (Math.random() - 0.5) * 3,
      )
      this.smokeEmitter.emit(this._vfxPosScratch, this._vfxVelScratch)
    }
    this.playerProjectileRemoveEnemy?.(turret.enemy)
    this.scene.remove(turret.model.group)
    turret.dispose()
    const idx = this.turrets.indexOf(turret)
    if (idx >= 0) this.turrets.splice(idx, 1)
  }

  private notifyArmed(): void {
    const wasZero = this.armedCount === 0
    this.armedCount++
    if (wasZero) {
      this.audio.play('sfx.station.alarm')
    }
  }

  private notifyDisarmed(): void {
    this.armedCount = Math.max(0, this.armedCount - 1)
  }
}
