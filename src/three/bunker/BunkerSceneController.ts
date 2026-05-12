/**
 * Orchestrator for the bunker interior scene.
 *
 * Owns one root group containing walls, lights, hatch + door props, and the
 * bunker-side {@link EnemyDirector}. The {@link BunkerMinigame} drives wave
 * spawns through {@link BunkerSceneController.spawnWave}. The level view calls
 * {@link BunkerSceneController.activate} / {@link BunkerSceneController.deactivate}
 * when the player crosses the surface hatch.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */
import * as THREE from 'three'
import { EnemyDirector, type EnemyHandle } from '@/lib/fps/enemyDirector'
import {
  buildBunkerGeometry,
  type BunkerGeometry,
  type BunkerWalkableBounds,
} from './BunkerWallBuilder'
import {
  disposeBunkerTiledInteriorMaterialInstance,
  type BunkerInteriorMaterialSet,
} from './BunkerInteriorMaterials'
import { BunkerDoorController } from './BunkerDoorController'
import { BunkerVaultDoorController } from './BunkerVaultDoorController'
import type { BunkerEnemyType } from '@/lib/bunker/bunkerWaveSchedule'
import type { ProjectileSystem } from '@/lib/fps/projectileSystem'
import { EnemyProjectileSystem } from '@/lib/fps/enemyProjectileSystem'
import { spawnChimeraProjectileBurst } from '@/lib/fps/chimeraProjectileBurst'
import { getEnemyTypeConfig } from '@/lib/fps/enemyTypes'
import { BacteriophageController, PHAGE_HIT_CENTER_Y } from '@/three/BacteriophageController'
import { ChimeraWalkerController, CHIMERA_HIT_CENTER_Y } from '@/three/ChimeraWalkerController'
import { SpireController, SPIRE_HIT_CENTER_Y } from '@/three/SpireController'
import { EnemyProjectileMeshPool } from '@/three/EnemyProjectileMeshPool'
import type { EnemyVisualTier } from '@/three/enemyVisualPalette'
import { BunkerTableModel } from './BunkerTableModel'
import { BunkerChestModel } from './BunkerChestModel'
import { SuspensionCylinderModel } from '@/three/SuspensionCylinderModel'

/** Distance for the per-corner arena lights (world units). */
const CORNER_LIGHT_DISTANCE = 14
/**
 * Intensity when using two diagonal corner fills — each approximates two of the legacy
 * four-corner fills so total arena lift stays similar with fewer point lights in the PBR loop.
 */
const CORNER_LIGHT_INTENSITY_DIAGONAL = 3.4
/** Intensity for the door light (slightly brighter than corners). */
const DOOR_LIGHT_INTENSITY = 2.38
/** Distance for the door point light. Same value as corner lights today; named separately for tuning clarity. */
const DOOR_LIGHT_DISTANCE = 14
/** Intensity for the ambient light — modest fill so corridors read without washing PBR contrast. */
const AMBIENT_INTENSITY = 0.31
/** Y position of the four corner point lights. */
const CORNER_LIGHT_Y = 4
/** Y position of the door point light. */
const DOOR_LIGHT_Y = 3
/** Forward (-z toward antechamber) offset of the door light from the door anchor. */
const DOOR_LIGHT_Z_OFFSET = 1.5
/** Delay between one wave enemy leaving a staging room and the next door opening. */
const WAVE_STAGED_SPAWN_SECONDS = 1.25
/** Minimum aim distance before spawning an enemy projectile. */
const ENEMY_PROJECTILE_MIN_AIM_DISTANCE = 0.001
/** Lowest mission difficulty that keeps base bunker enemy HP unchanged. */
const BUNKER_MIN_DIFFICULTY = 1
/** Difficulty where bunker enemies reach the middle HP multiplier. */
const BUNKER_MID_DIFFICULTY = 5
/** Highest authored mission difficulty. */
const BUNKER_MAX_DIFFICULTY = 10
/** HP multiplier at {@link BUNKER_MIN_DIFFICULTY}. */
const BUNKER_MIN_HP_MULTIPLIER = 1
/** HP multiplier at {@link BUNKER_MID_DIFFICULTY}. */
const BUNKER_MID_HP_MULTIPLIER = 3
/** HP multiplier at {@link BUNKER_MAX_DIFFICULTY}. */
const BUNKER_MAX_HP_MULTIPLIER = 5

/**
 * Convert mission difficulty to bunker-only enemy HP multiplier.
 *
 * Tuning anchors:
 * difficulty 1 = 1x, difficulty 5 = 3x, difficulty 10 = 5x.
 *
 * @param difficulty - Mission difficulty, usually in the 1-10 range.
 */
function bunkerEnemyHealthMultiplier(difficulty: number): number {
  const clamped = Math.max(BUNKER_MIN_DIFFICULTY, Math.min(BUNKER_MAX_DIFFICULTY, difficulty))
  if (clamped <= BUNKER_MID_DIFFICULTY) {
    const t = (clamped - BUNKER_MIN_DIFFICULTY) / (BUNKER_MID_DIFFICULTY - BUNKER_MIN_DIFFICULTY)
    return BUNKER_MIN_HP_MULTIPLIER + t * (BUNKER_MID_HP_MULTIPLIER - BUNKER_MIN_HP_MULTIPLIER)
  }

  const t = (clamped - BUNKER_MID_DIFFICULTY) / (BUNKER_MAX_DIFFICULTY - BUNKER_MID_DIFFICULTY)
  return BUNKER_MID_HP_MULTIPLIER + t * (BUNKER_MAX_HP_MULTIPLIER - BUNKER_MID_HP_MULTIPLIER)
}

/**
 * Read an enemy's base config and apply the bunker HP multiplier.
 *
 * @param type - Enemy type key from `enemy-types.json`.
 * @param multiplier - Bunker mission HP multiplier.
 */
function scaledBunkerEnemyHp(type: BunkerEnemyType, multiplier: number): number {
  return Math.round(getEnemyTypeConfig(type).maxHp * multiplier)
}

/**
 * Convert mission difficulty to bunker enemy visual palette tier.
 *
 * @param difficulty - Mission difficulty, usually in the 1-10 range.
 */
function bunkerEnemyVisualTier(difficulty: number): EnemyVisualTier {
  if (difficulty <= 4) return 'default'
  if (difficulty <= 7) return 'medium'
  return 'hard'
}

/** Constructor opts for {@link BunkerSceneController}. */
export interface BunkerSceneControllerOptions {
  /** Faction tint hex (e.g. `0x66ccff`). Drives arena point lights + props. */
  tint: number
  /** Parent THREE scene the bunker root attaches to on `activate`. */
  scene: THREE.Scene
  /** Player projectile system used for bunker enemy hit registration. */
  projectileSystem?: ProjectileSystem
  /** Mission difficulty in the 1-10 range, used for bunker-only enemy HP scaling. */
  difficulty?: number
  /**
   * Packed PBR shell materials for procedural walls (see {@link loadBunkerInteriorMaterials}
   * or {@link createTestBunkerInteriorMaterialSet} for tests).
   */
  interiorMaterials: BunkerInteriorMaterialSet
  /**
   * Optional shared point-light pool spawned wave enemies borrow lights from.
   * The level scene's pool keeps `NUM_POINT_LIGHTS` pinned across the whole
   * level so a fresh wave does not recompile every lit material. When `null`
   * or omitted, controllers fall back to per-enemy lights (legacy behavior
   * — first wave will hitch on every spawn).
   */
  lightPool?: import('@/three/EnemyLightPool').EnemyLightPool | null
  /**
   * Optional enemy variant applied to all chimera spawns in this bunker.
   * When `'astronaut-chimera'`, each chimera carries a procedural T-pose
   * astronaut rider. Combat stats are unchanged. Defaults to `'standard'`.
   */
  enemyVariant?: import('@/lib/missions/types').BunkerEnemyVariant
  /**
   * Yamada mission archetype for this bunker, if any. When
   * `'bunker-protect'`, the extract terminal is replaced with a
   * {@link SuspensionCylinderModel}. Omit for standard bunker missions.
   */
  missionArchetype?: string
}

/** Interior scene wrapper — the level view treats this as a black box. */
export class BunkerSceneController {
  /** Bunker-side enemy director. Separate from any surface director. */
  readonly enemyDirector = new EnemyDirector()
  /** Enemy-fired projectiles used by bunker ranged enemies. */
  readonly enemyProjectileSystem = new EnemyProjectileSystem()
  /** Antechamber exit door (player extracts through this on completion). */
  readonly hatch: BunkerVaultDoorController
  /** Arena door (gates the player from entering combat). */
  readonly door: BunkerDoorController
  /** Enemy-room doors opened one at a time as waves begin. */
  readonly enemyDoors: readonly BunkerDoorController[]
  /** Door to the loot room, opens after waves clear. */
  readonly lootDoor: BunkerDoorController
  /** Extract terminal or suspension cylinder inside the loot room. */
  readonly table: BunkerTableModel | SuspensionCylinderModel
  /** Chests inside the loot room. */
  readonly chests: [BunkerChestModel, BunkerChestModel] = [
    new BunkerChestModel(),
    new BunkerChestModel(),
  ]

  private readonly tint: number
  private readonly scene: THREE.Scene
  private readonly projectileSystem: ProjectileSystem | null
  private readonly enemyHealthMultiplier: number
  private readonly enemyVisualTier: EnemyVisualTier
  private readonly enemyProjectileMeshPool: EnemyProjectileMeshPool
  /** Shared point-light pool for spawned wave enemies, or `null` to self-allocate. */
  private readonly lightPool: import('@/three/EnemyLightPool').EnemyLightPool | null
  /**
   * Enemy visual variant applied to all chimera spawns in this bunker scene.
   * `'standard'` (default) produces the normal chimera. `'astronaut-chimera'`
   * parents a procedural T-pose astronaut figure on each chimera's body.
   */
  private readonly enemyVariant: import('@/lib/missions/types').BunkerEnemyVariant
  private readonly interiorMaterials: BunkerInteriorMaterialSet
  private readonly geometry: BunkerGeometry
  private readonly phageControllers = new Map<number, BacteriophageController>()
  private readonly chimeraControllers = new Map<number, ChimeraWalkerController>()
  private readonly spireControllers = new Map<number, SpireController>()
  private pendingWaveRoster: BunkerEnemyType[] = []
  private pendingWaveRoomCursor: number | null = null
  private pendingWaveSpawnTimer = 0
  private spawnPadCursor = 0
  private activeWaveRoomIndex: number | null = null
  private active = false

  /**
   * @param opts - Faction tint + parent scene
   */
  constructor(opts: BunkerSceneControllerOptions) {
    this.tint = opts.tint
    this.scene = opts.scene
    this.projectileSystem = opts.projectileSystem ?? null
    this.enemyHealthMultiplier = bunkerEnemyHealthMultiplier(
      opts.difficulty ?? BUNKER_MIN_DIFFICULTY,
    )
    this.enemyVisualTier = bunkerEnemyVisualTier(opts.difficulty ?? BUNKER_MIN_DIFFICULTY)
    this.lightPool = opts.lightPool ?? null
    this.enemyVariant = opts.enemyVariant ?? 'standard'
    this.enemyProjectileMeshPool = new EnemyProjectileMeshPool(opts.scene)
    this.enemyProjectileMeshPool.prewarm()
    this.interiorMaterials = opts.interiorMaterials
    this.geometry = buildBunkerGeometry(this.interiorMaterials)
    this.hatch = new BunkerVaultDoorController(opts.tint)
    this.door = new BunkerDoorController(opts.tint)
    this.lootDoor = new BunkerDoorController(opts.tint)
    this.lootDoor.group.position.copy(this.geometry.lootRoom.doorAnchor.position)
    this.lootDoor.group.rotation.copy(this.geometry.lootRoom.doorAnchor.rotation)

    // Conditionally swap the central interactable for Yamada bunker-protect missions
    this.table =
      opts.missionArchetype === 'bunker-protect'
        ? new SuspensionCylinderModel()
        : new BunkerTableModel()

    // Position table at the far end of the loot room
    const doorZ = this.geometry.lootRoom.doorAnchor.position.z
    const lootDepth = 43 // ARENA.depth / 2
    const lootWidth = 41 // ARENA.width / 2

    // Tucked at the end of the room
    this.table.group.position.set(0, 0, doorZ + lootDepth - 4)
    // Rotate table so it faces the player (assuming it was facing away)
    this.table.group.rotation.y = Math.PI

    // Chests against the left and right walls
    this.chests[0].group.position.set(-lootWidth / 2 + 4, 0, doorZ + lootDepth - 4)
    this.chests[1].group.position.set(lootWidth / 2 - 4, 0, doorZ + lootDepth - 4)

    // Rotate chests to be parallel to the walls (facing inward)
    this.chests[0].group.rotation.y = Math.PI / 2
    this.chests[1].group.rotation.y = -Math.PI / 2

    this.enemyDoors = this.geometry.enemyRooms.map((room) => {
      const door = new BunkerDoorController(opts.tint)
      door.group.position.copy(room.doorAnchor.position)
      door.group.rotation.copy(room.doorAnchor.rotation)
      return door
    })

    this.hatch.group.position.copy(this.geometry.entranceDoorAnchor.position)
    this.hatch.group.rotation.copy(this.geometry.entranceDoorAnchor.rotation)
    this.door.group.position.copy(this.geometry.arenaDoorAnchor.position)
    this.geometry.root.add(
      this.hatch.group,
      this.door.group,
      this.lootDoor.group,
      this.table.group,
      this.chests[0].group,
      this.chests[1].group,
    )
    for (const door of this.enemyDoors) {
      this.geometry.root.add(door.group)
    }
    this.enemyProjectileSystem.onProjectileMove = this.enemyProjectileMeshPool.acquire
    this.enemyProjectileSystem.onProjectileRemoved = this.enemyProjectileMeshPool.release

    this.buildLights()
  }

  /** XZ position the player should spawn at on entry. */
  get playerSpawn(): THREE.Vector3 {
    return this.geometry.playerSpawn
  }

  /**
   * World-space Y of the antechamber floor's top surface. The floor mesh is
   * centered at `-WALL_THICKNESS / 2` with a thickness of `WALL_THICKNESS`,
   * so the walkable surface sits at `root.y + 0`. Used by the level view to
   * clamp the player's foot position while inside `bunker-interior` (the
   * asteroid heightmap doesn't model the bunker floor).
   */
  get floorY(): number {
    return this.geometry.root.position.y
  }

  /**
   * World-space XZ center of the antechamber's exit hatch (for interaction
   * range checks). The geometry stores the hatch in bunker-local coords; we
   * add the root's world XZ so the prompt logic can compare against the
   * player's world-space position directly.
   */
  get hatchPosition(): { x: number; z: number } {
    return {
      x: this.geometry.root.position.x + this.geometry.entranceDoorAnchor.position.x,
      z: this.geometry.root.position.z + this.geometry.entranceDoorAnchor.position.z,
    }
  }

  /**
   * World-space XZ center of the arena door (for interaction range checks).
   * Mirrors {@link hatchPosition}: the door anchor lives in bunker-local
   * space, so we lift it into world coords for parity with the player's
   * world position.
   */
  get doorPosition(): { x: number; z: number } {
    return {
      x: this.geometry.root.position.x + this.geometry.arenaDoorAnchor.position.x,
      z: this.geometry.root.position.z + this.geometry.arenaDoorAnchor.position.z,
    }
  }

  /**
   * World-space position of the bunker root group. Used by the level view
   * to compute the world-space AABB clamp that keeps the player inside the
   * bunker walls (slice-1 cheap collision).
   */
  get rootWorldPosition(): { x: number; y: number; z: number } {
    return {
      x: this.geometry.root.position.x,
      y: this.geometry.root.position.y,
      z: this.geometry.root.position.z,
    }
  }

  /**
   * World-space walkable rectangles for bunker wall collision. The controller
   * keeps these as separate room/corridor rectangles so narrow connector
   * spaces do not inherit the arena's width.
   */
  get walkableBounds(): readonly BunkerWalkableBounds[] {
    const root = this.geometry.root.position
    return this.geometry.walkableBounds.map((bounds) => ({
      minX: root.x + bounds.minX,
      maxX: root.x + bounds.maxX,
      minZ: root.z + bounds.minZ,
      maxZ: root.z + bounds.maxZ,
    }))
  }

  /**
   * World-space walkable bounds for the loot room.
   */
  get lootRoomBounds(): BunkerWalkableBounds {
    const root = this.geometry.root.position
    const bounds = this.geometry.lootRoom.walkableBounds
    return {
      minX: root.x + bounds.minX,
      maxX: root.x + bounds.maxX,
      minZ: root.z + bounds.minZ,
      maxZ: root.z + bounds.maxZ,
    }
  }

  /**
   * World-space walkable bounds for the currently opened enemy staging room.
   * Returns `null` while no wave-room door is open.
   */
  get activeEnemyRoomBounds(): BunkerWalkableBounds | null {
    if (this.activeWaveRoomIndex === null) return null
    const room = this.geometry.enemyRooms[this.activeWaveRoomIndex]
    if (!room) return null
    const root = this.geometry.root.position
    return {
      minX: root.x + room.walkableBounds.minX,
      maxX: root.x + room.walkableBounds.maxX,
      minZ: root.z + room.walkableBounds.minZ,
      maxZ: root.z + room.walkableBounds.maxZ,
    }
  }

  /** Whether the scene still has delayed wave enemies waiting behind doors. */
  get hasPendingWaveSpawns(): boolean {
    return this.pendingWaveRoster.length > 0
  }

  /**
   * Whether a world-space player XZ point has crossed into the arena room.
   *
   * Used by {@link BunkerMinigame} to delay the first enemy wave until the
   * player has walked through the opened corridor door instead of spawning
   * hostiles while the player is still in the choke point.
   *
   * @param x - Player world X coordinate.
   * @param z - Player world Z coordinate.
   */
  isPlayerInArena(x: number, z: number): boolean {
    const arenaBounds = this.walkableBounds[2]
    if (!arenaBounds) return false
    return (
      x >= arenaBounds.minX &&
      x <= arenaBounds.maxX &&
      z >= arenaBounds.minZ &&
      z <= arenaBounds.maxZ
    )
  }

  /**
   * Register an observer for every enemy spawned by the bunker director.
   * Used by the loot drop pipeline.
   *
   * @param listener - Fired per spawn
   * @returns Unsubscribe
   */
  installEnemySpawnObserver(listener: (handle: EnemyHandle) => void): () => void {
    return this.enemyDirector.addSpawnListener(listener)
  }

  /**
   * Open the enemy staging room assigned to a wave.
   *
   * @param waveIndex - Zero-based wave index.
   */
  openWaveRoom(waveIndex: number): void {
    if (this.geometry.enemyRooms.length === 0) return
    this.closeWaveRoom()
    this.activeWaveRoomIndex = waveIndex % this.geometry.enemyRooms.length
    this.enemyDoors[this.activeWaveRoomIndex]?.setOpen(true)
  }

  /** Close the currently open enemy staging room door. */
  closeWaveRoom(): void {
    if (this.activeWaveRoomIndex !== null) {
      this.enemyDoors[this.activeWaveRoomIndex]?.setOpen(false)
    }
    this.activeWaveRoomIndex = null
  }

  /**
   * Move the bunker scene root to a specific world position. Called by the
   * level controller before {@link activate} so the bunker materializes around
   * the player's descent point on the asteroid surface — the scene's local
   * `playerSpawn` then resolves to a world position close to where the player
   * was standing, instead of teleporting them to world origin.
   *
   * @param x - World X
   * @param y - World Y (set to the player's foot Y so `bunkerFloorY` matches the surface)
   * @param z - World Z
   */
  setRootWorldPosition(x: number, y: number, z: number): void {
    this.geometry.root.position.set(x, y, z)
  }

  /** Add the bunker root to the scene. */
  activate(): void {
    if (this.active) return
    this.scene.add(this.geometry.root)
    this.active = true
  }

  /** Remove the bunker root from the scene; geometry and materials remain alive. */
  deactivate(): void {
    if (!this.active) return
    this.scene.remove(this.geometry.root)
    this.active = false
  }

  /**
   * Spawn one wave's roster, distributing units round-robin across the four
   * corner pads. Uses the bunker {@link BunkerSceneController.enemyDirector}.
   *
   * @param roster - Flat list of enemy types
   */
  spawnWave(roster: readonly BunkerEnemyType[]): void {
    this.pendingWaveRoster = [...roster]
    this.pendingWaveRoomCursor = this.activeWaveRoomIndex
    this.pendingWaveSpawnTimer = 0
    this.releaseNextWaveSpawn()
  }

  /**
   * Per-frame update for material breathing, hatch animations, door.
   * Enemy director is ticked by the minigame so the simulation step order
   * matches Rescue.
   *
   * @param dt - Delta time in seconds
   */
  tick(dt: number): void {
    this.hatch.tick(dt)
    this.door.tick(dt)
    this.lootDoor.tick(dt)
    for (const door of this.enemyDoors) {
      door.tick(dt)
    }
    if (this.pendingWaveRoster.length > 0) {
      this.pendingWaveSpawnTimer = Math.max(0, this.pendingWaveSpawnTimer - dt)
      if (this.pendingWaveSpawnTimer <= 0) {
        this.releaseNextWaveSpawn()
      }
    }
    this.syncEnemyControllers(dt)
  }

  /**
   * Flash the matching visual controller after a projectile hit.
   *
   * @param enemy - Enemy domain object that was hit.
   */
  notifyEnemyHit(enemy: EnemyHandle['enemy']): void {
    for (const ctrl of this.phageControllers.values()) {
      if (ctrl.enemy === enemy) {
        ctrl.flash()
        return
      }
    }
    for (const ctrl of this.chimeraControllers.values()) {
      if (ctrl.enemy === enemy) {
        ctrl.flash()
        return
      }
    }
    for (const ctrl of this.spireControllers.values()) {
      if (ctrl.enemy === enemy) {
        ctrl.flash()
        return
      }
    }
  }

  /** Free all GPU resources. */
  dispose(): void {
    this.deactivate()
    this.hatch.dispose()
    this.door.dispose()
    this.lootDoor.dispose()
    this.table.dispose()
    this.chests[0].dispose()
    this.chests[1].dispose()
    for (const door of this.enemyDoors) {
      door.dispose()
    }
    this.enemyProjectileSystem.dispose()
    this.enemyProjectileMeshPool.disposeAll()
    for (const mat of this.geometry.interiorMeshMaterials) {
      disposeBunkerTiledInteriorMaterialInstance(mat)
    }
    this.geometry.arenaCombatSolidMaterial?.dispose()
    this.interiorMaterials.dispose()
    for (const mesh of this.geometry.wallMeshes) {
      mesh.geometry.dispose()
    }
    this.disposeEnemyControllers()
    this.enemyDirector.despawnAll()
  }

  /** Build the four corner lights + door light. Called once in the constructor. */
  private buildLights(): void {
    const ambient = new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY)
    this.geometry.root.add(ambient)

    // Two diagonals (indices 0 and 3) — halves arena point-light count vs four corners.
    const cornerPads = this.geometry.spawnPadCenters
    const diagonalPairs: [number, number] = [0, 3]
    for (const idx of diagonalPairs) {
      const c = cornerPads[idx]!
      const l = new THREE.PointLight(
        this.tint,
        CORNER_LIGHT_INTENSITY_DIAGONAL,
        CORNER_LIGHT_DISTANCE,
      )
      l.position.set(c.x, CORNER_LIGHT_Y, c.z)
      this.geometry.root.add(l)
    }

    const doorLight = new THREE.PointLight(this.tint, DOOR_LIGHT_INTENSITY, DOOR_LIGHT_DISTANCE)
    doorLight.position.set(
      this.geometry.arenaDoorAnchor.position.x,
      DOOR_LIGHT_Y,
      this.geometry.arenaDoorAnchor.position.z + DOOR_LIGHT_Z_OFFSET,
    )
    this.geometry.root.add(doorLight)
  }

  /**
   * Create and parent the visual controller matching an enemy handle.
   *
   * @param handle - Newly spawned enemy handle.
   */
  private createEnemyController(handle: EnemyHandle): void {
    if (handle.type === 'bacteriophage') {
      const ctrl = new BacteriophageController(handle.enemy, {
        visualTier: this.enemyVisualTier,
        lightPool: this.lightPool,
      })
      this.geometry.root.add(ctrl.group)
      this.phageControllers.set(handle.id, ctrl)
    } else if (handle.type === 'chimera') {
      const ctrl = new ChimeraWalkerController(handle.enemy, {
        visualTier: this.enemyVisualTier,
        lightPool: this.lightPool,
        variant: this.enemyVariant,
      })
      this.geometry.root.add(ctrl.group)
      this.chimeraControllers.set(handle.id, ctrl)
    } else {
      const ctrl = new SpireController(handle.enemy, {
        visualTier: this.enemyVisualTier,
        lightPool: this.lightPool,
      })
      this.geometry.root.add(ctrl.group)
      this.spireControllers.set(handle.id, ctrl)
    }
  }

  /** Release one queued wave enemy through the next staging-room door. */
  private releaseNextWaveSpawn(): void {
    const type = this.pendingWaveRoster.shift()
    if (!type) return

    const root = this.geometry.root.position
    let pad: { x: number; z: number }
    if (this.pendingWaveRoomCursor === null || this.geometry.enemyRooms.length === 0) {
      pad =
        this.geometry.spawnPadCenters[this.spawnPadCursor % this.geometry.spawnPadCenters.length]!
      this.spawnPadCursor++
    } else {
      const roomIndex = this.pendingWaveRoomCursor % this.geometry.enemyRooms.length
      this.openWaveRoom(roomIndex)
      pad = this.geometry.enemyRooms[roomIndex]!.spawnPadCenter
      this.pendingWaveRoomCursor = roomIndex + 1
    }

    const handle = this.enemyDirector.spawn(type, root.x + pad.x, root.y, root.z + pad.z, {
      maxHp: scaledBunkerEnemyHp(type, this.enemyHealthMultiplier),
    })
    this.setInitialEnemyHitCenter(handle)
    this.projectileSystem?.addEnemy(handle.enemy)
    this.createEnemyController(handle)
    this.pendingWaveSpawnTimer = WAVE_STAGED_SPAWN_SECONDS
  }

  /**
   * Put the collision sphere at the visible body center immediately on spawn,
   * before the first controller sync tick runs.
   *
   * @param handle - Newly spawned enemy handle.
   */
  private setInitialEnemyHitCenter(handle: EnemyHandle): void {
    const rootY = this.geometry.root.position.y
    if (handle.type === 'bacteriophage') {
      handle.enemy.position.y = rootY + PHAGE_HIT_CENTER_Y
    } else if (handle.type === 'chimera') {
      handle.enemy.position.y = rootY + CHIMERA_HIT_CENTER_Y
    } else {
      handle.enemy.position.y = rootY + handle.config.floatHeight + SPIRE_HIT_CENTER_Y
    }
  }

  /**
   * Sync all bunker enemy visual controllers from their world-space domain positions.
   *
   * @param dt - Delta time in seconds.
   */
  private syncEnemyControllers(dt: number): void {
    for (const handle of Array.from(this.enemyDirector.enemies)) {
      this.syncGroundController(
        this.phageControllers.get(handle.id),
        handle,
        PHAGE_HIT_CENTER_Y,
        dt,
      )
      this.syncGroundController(
        this.chimeraControllers.get(handle.id),
        handle,
        CHIMERA_HIT_CENTER_Y,
        dt,
      )
      this.syncSpireController(this.spireControllers.get(handle.id), handle, dt)
    }
  }

  /**
   * Sync a ground enemy controller, or clean it up after death animation.
   *
   * @param ctrl - Matching visual controller, if this handle uses one.
   * @param handle - Enemy handle from the director.
   * @param hitCenterY - Vertical hit-center offset for the enemy model.
   * @param dt - Delta time in seconds.
   */
  private syncGroundController(
    ctrl: BacteriophageController | ChimeraWalkerController | undefined,
    handle: EnemyHandle,
    hitCenterY: number,
    dt: number,
  ): void {
    if (!ctrl) return
    if (ctrl.deathComplete) {
      this.removeEnemyController(handle)
      return
    }
    if (handle.enemy.alive) {
      const local = this.toLocalXZ(handle.enemy.position.x, handle.enemy.position.z)
      ctrl.isMoving = handle.lastOutput.isMoving
      ctrl.isAgitated = handle.lastOutput.isAgitated
      ctrl.group.position.set(local.x, 0, local.z)
      handle.enemy.position.y = this.geometry.root.position.y + hitCenterY
      if (handle.lastOutput.isMoving) {
        const dir = handle.lastOutput.moveDir
        ctrl.group.rotation.y = Math.atan2(dir.x, dir.z)
      }
      this.fireChimeraProjectileIfReady(ctrl, handle)
    }
    ctrl.tick(dt)
    if (ctrl.deathComplete) {
      this.removeEnemyController(handle)
    }
  }

  /**
   * Sync a ranged spire controller, or clean it up after death animation.
   *
   * @param ctrl - Matching visual controller, if this handle uses one.
   * @param handle - Enemy handle from the director.
   * @param dt - Delta time in seconds.
   */
  private syncSpireController(
    ctrl: SpireController | undefined,
    handle: EnemyHandle,
    dt: number,
  ): void {
    if (!ctrl) return
    if (ctrl.deathComplete) {
      this.removeEnemyController(handle)
      return
    }
    if (handle.enemy.alive) {
      const local = this.toLocalXZ(handle.enemy.position.x, handle.enemy.position.z)
      ctrl.isMoving = handle.lastOutput.isMoving
      ctrl.isAgitated = handle.lastOutput.isAgitated
      ctrl.targetPosition.set(local.x, handle.config.floatHeight, local.z)
      handle.enemy.position.y =
        this.geometry.root.position.y + handle.config.floatHeight + SPIRE_HIT_CENTER_Y
      if (handle.lastOutput.isChasing) {
        const dx = handle.lastOutput.aimTargetX - handle.enemy.position.x
        const dz = handle.lastOutput.aimTargetZ - handle.enemy.position.z
        ctrl.group.rotation.y = Math.atan2(dx, dz)
      }
      this.fireSpireProjectileIfReady(ctrl, handle)
    }
    ctrl.tick(dt)
    if (ctrl.deathComplete) {
      this.removeEnemyController(handle)
    }
  }

  /**
   * Convert a world XZ point into bunker-root local XZ coordinates.
   *
   * @param x - World X.
   * @param z - World Z.
   */
  private toLocalXZ(x: number, z: number): { x: number; z: number } {
    const root = this.geometry.root.position
    return { x: x - root.x, z: z - root.z }
  }

  /**
   * Fire a chimera eye projectile when its behavior requests a shot.
   *
   * @param ctrl - Chimera visual controller.
   * @param handle - Enemy handle whose behavior produced fire intent.
   */
  private fireChimeraProjectileIfReady(
    ctrl: BacteriophageController | ChimeraWalkerController,
    handle: EnemyHandle,
  ): void {
    if (handle.type !== 'chimera' || !handle.lastOutput.wantsToFire) return
    if (!(ctrl instanceof ChimeraWalkerController)) return
    ctrl.group.updateMatrixWorld(true)
    const muzzle = new THREE.Vector3()
    ctrl.getEyeLaserMuzzle(muzzle)
    const spawnedCount = spawnChimeraProjectileBurst({
      originX: muzzle.x,
      originY: muzzle.y,
      originZ: muzzle.z,
      targetX: handle.lastOutput.aimTargetX,
      targetY: handle.lastOutput.aimTargetY,
      targetZ: handle.lastOutput.aimTargetZ,
      projectileSpeed: handle.config.projectileSpeed,
      projectileDamage: handle.config.projectileDamage,
      spawnBurst: this.enemyProjectileSystem.spawnBurst.bind(this.enemyProjectileSystem),
    })
    if (spawnedCount > 0) {
      ctrl.pulseEyeLaser()
    }
  }

  /**
   * Fire a spire projectile when its ranged behavior requests a shot.
   *
   * @param ctrl - Spire visual controller.
   * @param handle - Enemy handle whose behavior produced fire intent.
   */
  private fireSpireProjectileIfReady(ctrl: SpireController, handle: EnemyHandle): void {
    if (handle.type !== 'spire' || !handle.lastOutput.wantsToFire) return
    const origin = handle.enemy.position
    this.fireEnemyProjectileFrom(
      origin.x,
      origin.y,
      origin.z,
      handle.lastOutput.aimTargetX,
      handle.lastOutput.aimTargetY,
      handle.lastOutput.aimTargetZ,
      handle,
    )
    ctrl.fireFlash(handle.lastOutput.aimTargetX, handle.lastOutput.aimTargetZ)
  }

  /**
   * Spawn a damaging enemy projectile toward a behavior aim target.
   *
   * @param originX - Projectile origin X.
   * @param originY - Projectile origin Y.
   * @param originZ - Projectile origin Z.
   * @param targetX - Aim target X.
   * @param targetY - Aim target Y.
   * @param targetZ - Aim target Z.
   * @param handle - Enemy handle supplying projectile stats.
   */
  private fireEnemyProjectileFrom(
    originX: number,
    originY: number,
    originZ: number,
    targetX: number,
    targetY: number,
    targetZ: number,
    handle: EnemyHandle,
  ): void {
    const dx = targetX - originX
    const dy = targetY - originY
    const dz = targetZ - originZ
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (dist <= ENEMY_PROJECTILE_MIN_AIM_DISTANCE) return
    this.enemyProjectileSystem.spawn(
      originX,
      originY,
      originZ,
      dx / dist,
      dy / dist,
      dz / dist,
      handle.config.projectileSpeed,
      handle.config.projectileDamage,
    )
  }

  /**
   * Remove an enemy's visual controller and projectile collision registration.
   *
   * @param handle - Enemy handle being removed.
   */
  private removeEnemyController(handle: EnemyHandle): void {
    const ctrl =
      this.phageControllers.get(handle.id) ??
      this.chimeraControllers.get(handle.id) ??
      this.spireControllers.get(handle.id)
    ctrl?.group.removeFromParent()
    ctrl?.dispose()
    this.projectileSystem?.removeEnemy(handle.enemy)
    this.phageControllers.delete(handle.id)
    this.chimeraControllers.delete(handle.id)
    this.spireControllers.delete(handle.id)
    this.enemyDirector.despawn(handle)
  }

  /** Dispose every visual enemy controller still owned by the bunker scene. */
  private disposeEnemyControllers(): void {
    for (const handle of Array.from(this.enemyDirector.enemies)) {
      this.projectileSystem?.removeEnemy(handle.enemy)
    }
    for (const ctrl of this.phageControllers.values()) ctrl.dispose()
    for (const ctrl of this.chimeraControllers.values()) ctrl.dispose()
    for (const ctrl of this.spireControllers.values()) ctrl.dispose()
    this.phageControllers.clear()
    this.chimeraControllers.clear()
    this.spireControllers.clear()
  }
}
