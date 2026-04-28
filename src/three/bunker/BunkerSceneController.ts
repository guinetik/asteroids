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
  private readonly enemySpawnObservers = new Set<(handle: EnemyHandle) => void>()
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

  /** XZ center of the antechamber's exit hatch (for interaction range checks). */
  get hatchPosition(): { x: number; z: number } {
    return this.geometry.antechamberHatch
  }

  /** XZ center of the arena door (for interaction range checks). */
  get doorPosition(): { x: number; z: number } {
    return {
      x: this.geometry.arenaDoorAnchor.position.x,
      z: this.geometry.arenaDoorAnchor.position.z,
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
    this.enemySpawnObservers.add(listener)
    return () => this.enemySpawnObservers.delete(listener)
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
    const pads = this.geometry.spawnPadCenters
    for (const type of roster) {
      // Modulo of array length always produces a valid index; safe to assert non-null.
      const pad = pads[this.spawnPadCursor % pads.length]!
      this.spawnPadCursor++
      const handle = this.enemyDirector.spawn(type, pad.x, 0, pad.z)
      for (const obs of this.enemySpawnObservers) {
        try {
          obs(handle)
        } catch {
          // observer-side errors must not break spawning
        }
      }
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
    this.geometry.root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh
        m.geometry.dispose()
      }
    })
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

    const doorLight = new THREE.PointLight(this.tint, DOOR_LIGHT_INTENSITY, CORNER_LIGHT_DISTANCE)
    doorLight.position.set(
      this.geometry.arenaDoorAnchor.position.x,
      DOOR_LIGHT_Y,
      this.geometry.arenaDoorAnchor.position.z + DOOR_LIGHT_Z_OFFSET,
    )
    this.geometry.root.add(doorLight)
  }
}
