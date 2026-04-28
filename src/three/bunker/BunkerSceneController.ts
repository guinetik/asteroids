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
import { buildBunkerGeometry, type BunkerGeometry } from './BunkerWallBuilder'
import { createBunkerGridMaterial } from './BunkerGridMaterial'
import { BunkerHatchModel } from './BunkerHatchModel'
import { BunkerDoorController } from './BunkerDoorController'
import type { BunkerEnemyType } from '@/lib/bunker/bunkerWaveSchedule'

/** Distance for the per-corner arena lights (world units). */
const CORNER_LIGHT_DISTANCE = 14
/** Intensity for the per-corner arena lights. */
const CORNER_LIGHT_INTENSITY = 1.6
/** Intensity for the door light (slightly brighter than corners). */
const DOOR_LIGHT_INTENSITY = 2.2
/** Distance for the door point light. Same value as corner lights today; named separately for tuning clarity. */
const DOOR_LIGHT_DISTANCE = 14
/** Intensity for the ambient light. */
const AMBIENT_INTENSITY = 0.25
/** Y position of the four corner point lights. */
const CORNER_LIGHT_Y = 4
/** Y position of the door point light. */
const DOOR_LIGHT_Y = 3
/** Forward (-z toward antechamber) offset of the door light from the door anchor. */
const DOOR_LIGHT_Z_OFFSET = 1.5

/** Constructor opts for {@link BunkerSceneController}. */
export interface BunkerSceneControllerOptions {
  /** Faction tint hex (e.g. `0x66ccff`). Drives grid material + light colors. */
  tint: number
  /** Parent THREE scene the bunker root attaches to on `activate`. */
  scene: THREE.Scene
}

/** Interior scene wrapper — the level view treats this as a black box. */
export class BunkerSceneController {
  /** Bunker-side enemy director. Separate from any surface director. */
  readonly enemyDirector = new EnemyDirector()
  /** Antechamber exit hatch (player extracts through this on completion). */
  readonly hatch: BunkerHatchModel
  /** Arena door (gates the player from entering combat). */
  readonly door: BunkerDoorController

  private readonly tint: number
  private readonly scene: THREE.Scene
  private readonly material: THREE.ShaderMaterial
  private readonly geometry: BunkerGeometry
  private spawnPadCursor = 0
  private active = false

  /**
   * @param opts - Faction tint + parent scene
   */
  constructor(opts: BunkerSceneControllerOptions) {
    this.tint = opts.tint
    this.scene = opts.scene
    this.material = createBunkerGridMaterial({ tint: opts.tint })
    this.geometry = buildBunkerGeometry(this.material)
    this.hatch = new BunkerHatchModel(opts.tint)
    this.door = new BunkerDoorController(opts.tint)

    this.hatch.group.position.set(
      this.geometry.antechamberHatch.x,
      0,
      this.geometry.antechamberHatch.z,
    )
    this.door.group.position.copy(this.geometry.arenaDoorAnchor.position)
    this.geometry.root.add(this.hatch.group, this.door.group)

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
      x: this.geometry.root.position.x + this.geometry.antechamberHatch.x,
      z: this.geometry.root.position.z + this.geometry.antechamberHatch.z,
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
    for (const type of roster) {
      const pads = this.geometry.spawnPadCenters
      // Modulo of array length always produces a valid index; safe to assert non-null.
      const pad = pads[this.spawnPadCursor % pads.length]!
      this.spawnPadCursor++
      this.enemyDirector.spawn(type, pad.x, 0, pad.z)
    }
  }

  /**
   * Per-frame update for material breathing, hatch animations, door.
   * Enemy director is ticked by the minigame so the simulation step order
   * matches Rescue.
   *
   * @param dt - Delta time in seconds
   */
  tick(dt: number): void {
    ;(this.material.userData.tick as ((dt: number) => void) | undefined)?.(dt)
    this.hatch.tick(dt)
    this.door.tick(dt)
  }

  /** Free all GPU resources. */
  dispose(): void {
    this.deactivate()
    this.hatch.dispose()
    this.door.dispose()
    this.material.dispose()
    for (const mesh of this.geometry.wallMeshes) {
      mesh.geometry.dispose()
    }
    this.enemyDirector.despawnAll()
  }

  /** Build the four corner lights + door light. Called once in the constructor. */
  private buildLights(): void {
    const ambient = new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY)
    this.geometry.root.add(ambient)

    const corners = this.geometry.spawnPadCenters
    for (const c of corners) {
      const l = new THREE.PointLight(this.tint, CORNER_LIGHT_INTENSITY, CORNER_LIGHT_DISTANCE)
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
}
