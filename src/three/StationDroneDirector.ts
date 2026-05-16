/**
 * Station-interior patrol drone director.
 *
 * Owns the list of {@link DroneController} instances spawned inside
 * rooms that opt in via `RoomSpec.drones === true`. Mirrors
 * {@link StationTurretDirector} for tick/dispose/hooks shape, with two
 * key differences:
 *
 * - The drone director does **not** own the {@link EnemyProjectileSystem}
 *   — it's injected by the view controller so turrets and drones share
 *   the same projectile sim. The turret director's `TurretLaserDartMeshPool`
 *   subscribes to that sim's per-projectile hooks, so drone darts get
 *   visual meshes for free. The turret director ticks the projectile
 *   sim; the drone director must not double-tick it.
 * - Drones do **not** trigger `sfx.station.alarm`. By spec the alarm
 *   is a turret-only cue; arming a drone is silent at the director
 *   level (the per-shot laser SFX is plenty).
 *
 * @author guinetik
 * @date 2026-05-16
 * @spec docs/superpowers/specs/2026-05-16-station-drone-enemy-design.md
 */
import * as THREE from 'three'
import { useAudio } from '@/audio/useAudio'
import {
  DRONE_KILL_DEBRIS_COUNT,
  DRONE_KILL_FLASH_COUNT,
  DRONE_KILL_SHOCKWAVE_COUNT,
  DRONE_KILL_SMOKE_COUNT,
  DRONE_KILL_SPARK_COUNT,
  DRONE_SLOT_SPAWN_PROBABILITY,
} from '@/lib/fps/drone/droneConfig'
import { maxDronesForRoom, rollDroneCount } from '@/lib/fps/drone/droneCountForRoom'
import type { DronePatrolRect } from '@/lib/fps/drone/droneWanderBehavior'
import type { Enemy } from '@/lib/fps/enemy'
import type { EnemyProjectileSystem } from '@/lib/fps/enemyProjectileSystem'
import type { StationCollider } from '@/lib/station/StationCollider'
import { ROOM_TILE_SIZE, type RoomSpec } from '@/lib/station/StationLayout'
import { ParticleEmitter } from '@/three/ParticleEmitter'
import { STATION_CEILING_Y, STATION_FLOOR_Y } from '@/three/StationBuilder'
import { DroneController } from '@/three/DroneController'

/**
 * Distance (world metres) the drone hovers below the ceiling. Sized so
 * the body sits comfortably under the roof beams without the muzzle
 * flash clipping into the ceiling mesh.
 */
const DRONE_CEILING_HANG = 0.55

/**
 * Inward margin (world metres) the patrol rectangle is shrunk from the
 * raw room footprint. Keeps the wander target far enough from the
 * walls that the drone's silhouette doesn't intersect props or wall
 * cladding while drifting.
 */
const DRONE_RECT_INSET = 0.35

/**
 * Default safe-zone radius (world metres) around the player's spawn
 * point inside which no drone is allowed to spawn. Matches the
 * turret's default so the early-game grace beat is consistent.
 */
const DRONE_SPAWN_SAFE_RADIUS = 7

/**
 * Reused emitter pool sizes — sized for the spec's per-room caps so
 * killing several drones in quick succession doesn't outpace the pool.
 */
const DRONE_KILL_FLASH_POOL_SIZE = 48
const DRONE_KILL_SPARK_POOL_SIZE = 192
const DRONE_KILL_SMOKE_POOL_SIZE = 128
const DRONE_KILL_DEBRIS_POOL_SIZE = 32
const DRONE_KILL_SHOCKWAVE_POOL_SIZE = 96

/**
 * Per-room population options for {@link StationDroneDirector.populateDronesInRooms}.
 */
export interface PopulateDronesInRoomsOptions {
  /** XZ position of the player's spawn point. */
  spawnXZ?: { x: number; z: number }
  /** Radius (world metres) around `spawnXZ` to keep clear of drones. */
  safeRadius?: number
  /** Random source. Defaults to `Math.random`. */
  rng?: () => number
  /** Per-slot spawn probability override. Defaults to
   * {@link DRONE_SLOT_SPAWN_PROBABILITY}. */
  spawnProbability?: number
  /** Floor Y baseline used by the patrol rect. Defaults to
   * {@link STATION_FLOOR_Y}. */
  floorY?: number
}

/**
 * Coordinates every patrol drone in the station. Tickable via {@link tick}.
 */
export class StationDroneDirector {
  /** Spawned drone instances. */
  readonly drones: DroneController[] = []

  private readonly scene: THREE.Scene
  private readonly projectiles: EnemyProjectileSystem
  private readonly playerProjectileAddEnemy: (enemy: Enemy) => void
  private readonly playerProjectileRemoveEnemy: ((enemy: Enemy) => void) | null
  private readonly defaultRng: () => number
  private readonly audio = useAudio()
  /** Shared station collider; drones use it for line-of-sight checks. */
  private collider: StationCollider | null = null
  /** Hot white-yellow core flash spawned on drone death. */
  private readonly flashEmitter: ParticleEmitter
  /** Orange spark burst spawned on drone death. */
  private readonly sparkEmitter: ParticleEmitter
  /** Grey smoke drift spawned on drone death. */
  private readonly smokeEmitter: ParticleEmitter
  /** Chunky red-orange debris fragments spawned on drone death. */
  private readonly debrisEmitter: ParticleEmitter
  /** Thin radial shockwave ejected horizontally on drone death. */
  private readonly shockwaveEmitter: ParticleEmitter
  /** Reused scratch for particle velocity on emit. */
  private readonly _vfxVelScratch = new THREE.Vector3()
  /** Reused scratch for particle position on emit. */
  private readonly _vfxPosScratch = new THREE.Vector3()
  /** Count of drones currently armed-or-firing. Inspection only. */
  private armedCount = 0

  /**
   * @param scene - Three.js scene the drones attach to.
   * @param sharedProjectiles - Enemy projectile system shared with the
   *   turret director. The drone director never ticks this — the turret
   *   director already does.
   * @param playerProjectileAddEnemy - Bound `ProjectileSystem.addEnemy`
   *   so the player's bolts can shoot the drone down.
   * @param playerProjectileRemoveEnemy - Optional companion bound
   *   `ProjectileSystem.removeEnemy` so dead drones stop accepting
   *   hits from the player's bolt sim.
   * @param rng - Default random source for population rolls + wander.
   *   Defaults to `Math.random`.
   */
  constructor(
    scene: THREE.Scene,
    sharedProjectiles: EnemyProjectileSystem,
    playerProjectileAddEnemy: (enemy: Enemy) => void,
    playerProjectileRemoveEnemy?: (enemy: Enemy) => void,
    rng: () => number = Math.random,
  ) {
    this.scene = scene
    this.projectiles = sharedProjectiles
    this.playerProjectileAddEnemy = playerProjectileAddEnemy
    this.playerProjectileRemoveEnemy = playerProjectileRemoveEnemy ?? null
    this.defaultRng = rng

    // Death VFX — smaller particle counts than the turret because the
    // drone silhouette is smaller. Pool sizes still leave headroom for
    // several back-to-back kills.
    this.flashEmitter = new ParticleEmitter({
      poolSize: DRONE_KILL_FLASH_POOL_SIZE,
      color: new THREE.Color(0xffffe0),
      size: 36,
      lifetime: 0.4,
      spread: 16,
      opacity: 1,
      soft: true,
      sizeGrowth: 3,
    })
    this.sparkEmitter = new ParticleEmitter({
      poolSize: DRONE_KILL_SPARK_POOL_SIZE,
      color: new THREE.Color(0xffb050),
      size: 10,
      lifetime: 1.4,
      spread: 20,
      opacity: 1,
      soft: true,
      sizeGrowth: 1.2,
    })
    this.smokeEmitter = new ParticleEmitter({
      poolSize: DRONE_KILL_SMOKE_POOL_SIZE,
      color: new THREE.Color(0x2a2a2a),
      size: 22,
      lifetime: 2.8,
      spread: 5,
      opacity: 0.8,
      soft: true,
      sizeGrowth: 3.6,
    })
    this.debrisEmitter = new ParticleEmitter({
      poolSize: DRONE_KILL_DEBRIS_POOL_SIZE,
      color: new THREE.Color(0xc04020),
      size: 14,
      lifetime: 1.8,
      spread: 4,
      opacity: 1,
      soft: false,
      sizeGrowth: 0.5,
    })
    this.shockwaveEmitter = new ParticleEmitter({
      poolSize: DRONE_KILL_SHOCKWAVE_POOL_SIZE,
      color: new THREE.Color(0xfff0c8),
      size: 6,
      lifetime: 0.55,
      spread: 22,
      opacity: 1,
      soft: true,
      sizeGrowth: 0.35,
    })
    scene.add(this.flashEmitter.points)
    scene.add(this.sparkEmitter.points)
    scene.add(this.smokeEmitter.points)
    scene.add(this.debrisEmitter.points)
    scene.add(this.shockwaveEmitter.points)
  }

  /**
   * Hand the station collider to every existing drone + cache it for
   * future spawns. Drones use the collider for line-of-sight checks so
   * they don't fire on the player through walls.
   *
   * @param collider - The built station collider.
   */
  setCollider(collider: StationCollider): void {
    this.collider = collider
    for (const drone of this.drones) drone.setCollider(collider)
  }

  /**
   * Walk the room list, skip rooms whose `drones !== true`, roll a
   * drone count per room, and instantiate one {@link DroneController}
   * per accepted slot.
   *
   * @param rooms - Room specs from the loaded station layout.
   * @param options - Spawn options (safe zone, RNG, probability,
   *   floor Y baseline).
   */
  populateDronesInRooms(
    rooms: readonly RoomSpec[],
    options?: PopulateDronesInRoomsOptions,
  ): void {
    const rng = options?.rng ?? this.defaultRng
    const spawnX = options?.spawnXZ?.x ?? 0
    const spawnZ = options?.spawnXZ?.z ?? 0
    const safeRadius = options?.safeRadius ?? DRONE_SPAWN_SAFE_RADIUS
    const spawnProbability = options?.spawnProbability ?? DRONE_SLOT_SPAWN_PROBABILITY
    const floorY = options?.floorY ?? STATION_FLOOR_Y
    const safeRadiusSq = safeRadius * safeRadius
    const hoverY = STATION_CEILING_Y - DRONE_CEILING_HANG

    for (const room of rooms) {
      if (room.drones !== true) continue

      // Spawn-safe gate: skip the whole room if its centre lies inside
      // the spawn safe-zone so the player isn't gunned down on load.
      const dx = room.anchor.x - spawnX
      const dz = room.anchor.z - spawnZ
      if (dx * dx + dz * dz < safeRadiusSq) continue

      const rect = this.buildPatrolRect(room, floorY)
      const max = maxDronesForRoom(room.width, room.depth)
      const count = rollDroneCount(max, rng, spawnProbability)
      for (let i = 0; i < count; i++) {
        const x = rect.minX + (rect.maxX - rect.minX) * rng()
        const z = rect.minZ + (rect.maxZ - rect.minZ) * rng()
        const yaw = rng() * Math.PI * 2
        const drone = this.spawnAt(x, hoverY, z, yaw, rect, rng)
        this.drones.push(drone)
      }
    }
  }

  /**
   * Update player position on the (shared) projectile system + tick
   * every drone + advance the drone-owned VFX emitters. Does **not**
   * tick the projectile sim — the turret director owns that.
   *
   * @param dt - Frame delta in seconds.
   * @param playerX - Player world X.
   * @param playerY - Player world Y.
   * @param playerZ - Player world Z.
   */
  tick(dt: number, playerX: number, playerY: number, playerZ: number): void {
    // The projectile sim already has player position from the turret
    // director. Calling setPlayerPosition twice per frame is harmless
    // (idempotent) but unnecessary; skip it.
    void this.projectiles
    const snapshot = this.drones.slice()
    for (const drone of snapshot) drone.tick(dt, playerX, playerY, playerZ)
    this.flashEmitter.tick(dt)
    this.sparkEmitter.tick(dt)
    this.smokeEmitter.tick(dt)
    this.debrisEmitter.tick(dt)
    this.shockwaveEmitter.tick(dt)
  }

  /**
   * Hard teardown — disposes every drone + the drone-owned VFX
   * emitters. Does **not** dispose the shared projectile sim / dart
   * pool (owned by the turret director).
   */
  dispose(): void {
    for (const drone of this.drones) drone.dispose()
    this.drones.length = 0
    this.flashEmitter.dispose()
    this.sparkEmitter.dispose()
    this.smokeEmitter.dispose()
    this.debrisEmitter.dispose()
    this.shockwaveEmitter.dispose()
  }

  /**
   * Compute the patrol rectangle for a room. Mirrors the room builder
   * convention: yaw 0/2 keeps the X/Z axes; yaw 1/3 swaps them. The
   * rectangle is shrunk inward by {@link DRONE_RECT_INSET} so wander
   * targets don't graze the walls.
   *
   * @param room - Room spec from the layout.
   * @param floorY - Floor Y baseline for the rect.
   * @returns Patrol rectangle in world XZ + floor baseline.
   */
  private buildPatrolRect(room: RoomSpec, floorY: number): DronePatrolRect {
    const yaw = room.yaw ?? 0
    const swapped = yaw === 1 || yaw === 3
    const halfX = ((swapped ? room.depth : room.width) * ROOM_TILE_SIZE) / 2
    const halfZ = ((swapped ? room.width : room.depth) * ROOM_TILE_SIZE) / 2
    const inset = DRONE_RECT_INSET
    return {
      minX: room.anchor.x - halfX + inset,
      maxX: room.anchor.x + halfX - inset,
      minZ: room.anchor.z - halfZ + inset,
      maxZ: room.anchor.z + halfZ - inset,
      floorY,
    }
  }

  /**
   * Build a single drone, wire its hooks, and add it to the scene.
   * The caller pushes it into {@link drones} once the function returns
   * so iteration order matches the layout's room declaration order.
   *
   * @param x - World X spawn position.
   * @param y - World Y hover baseline.
   * @param z - World Z spawn position.
   * @param yaw - Initial yaw in radians.
   * @param rect - Patrol rect this drone is bound to.
   * @param rng - Random source for wander targets.
   * @returns The wired drone controller.
   */
  private spawnAt(
    x: number,
    y: number,
    z: number,
    yaw: number,
    rect: DronePatrolRect,
    rng: () => number,
  ): DroneController {
    const drone = new DroneController(this.projectiles, rng)
    drone.placeAt(x, y, z, yaw)
    drone.setPatrolRect(rect)
    this.scene.add(drone.model.group)
    this.playerProjectileAddEnemy(drone.enemy)
    if (this.collider) drone.setCollider(this.collider)
    drone.onArmed = () => this.notifyArmed()
    drone.onDisarmed = () => this.notifyDisarmed()
    drone.onDestroyed = (kx, ky, kz) => this.spawnDestructionVfx(kx, ky, kz)
    drone.onKilled = () => this.disposeDrone(drone)
    return drone
  }

  /**
   * Spawn the killing-shot VFX + explosion SFX. Fired by
   * {@link DroneController.onDestroyed} the instant HP hits zero.
   *
   * @param x - World X of the kill site.
   * @param y - World Y of the kill site.
   * @param z - World Z of the kill site.
   */
  private spawnDestructionVfx(x: number, y: number, z: number): void {
    this.audio.play('sfx.drone.destroyed')
    this._vfxPosScratch.set(x, y - 0.2, z)
    // White-hot core flash — short-lived, expands fast.
    for (let i = 0; i < DRONE_KILL_FLASH_COUNT; i++) {
      this._vfxVelScratch.set(
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6,
      )
      this.flashEmitter.emit(this._vfxPosScratch, this._vfxVelScratch)
    }
    // Horizontal shockwave — thin bright ring.
    for (let i = 0; i < DRONE_KILL_SHOCKWAVE_COUNT; i++) {
      const angle = (i / DRONE_KILL_SHOCKWAVE_COUNT) * Math.PI * 2 + Math.random() * 0.1
      const speed = 14 + Math.random() * 10
      this._vfxVelScratch.set(
        Math.cos(angle) * speed,
        (Math.random() - 0.5) * 3,
        Math.sin(angle) * speed,
      )
      this.shockwaveEmitter.emit(this._vfxPosScratch, this._vfxVelScratch)
    }
    // Orange sparks — radial-omni burst, slight upward bias.
    for (let i = 0; i < DRONE_KILL_SPARK_COUNT; i++) {
      this._vfxVelScratch.set(
        (Math.random() - 0.5) * 26,
        Math.random() * 16 + 3,
        (Math.random() - 0.5) * 26,
      )
      this.sparkEmitter.emit(this._vfxPosScratch, this._vfxVelScratch)
    }
    // Chunky red-orange debris.
    for (let i = 0; i < DRONE_KILL_DEBRIS_COUNT; i++) {
      this._vfxVelScratch.set(
        (Math.random() - 0.5) * 10,
        Math.random() * 7 + 2,
        (Math.random() - 0.5) * 10,
      )
      this.debrisEmitter.emit(this._vfxPosScratch, this._vfxVelScratch)
    }
    // Smoke — slower, drifts up.
    for (let i = 0; i < DRONE_KILL_SMOKE_COUNT; i++) {
      this._vfxVelScratch.set(
        (Math.random() - 0.5) * 3,
        Math.random() * 2.4 + 0.6,
        (Math.random() - 0.5) * 3,
      )
      this.smokeEmitter.emit(this._vfxPosScratch, this._vfxVelScratch)
    }
  }

  /**
   * Final silent teardown — runs after the death tumble finishes.
   * VFX + SFX already fired from {@link spawnDestructionVfx}.
   *
   * @param drone - The drone to tear down.
   */
  private disposeDrone(drone: DroneController): void {
    this.playerProjectileRemoveEnemy?.(drone.enemy)
    this.scene.remove(drone.model.group)
    drone.dispose()
    const idx = this.drones.indexOf(drone)
    if (idx >= 0) this.drones.splice(idx, 1)
  }

  /**
   * Increment the armed-count book-keeping. Spec deliberately omits a
   * drone alarm SFX — only the per-shot laser cue plays — so this
   * stays a silent counter.
   */
  private notifyArmed(): void {
    this.armedCount++
  }

  /** Decrement the armed-count book-keeping. */
  private notifyDisarmed(): void {
    this.armedCount = Math.max(0, this.armedCount - 1)
  }
}
