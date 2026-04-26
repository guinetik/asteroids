import * as THREE from 'three'
import type { WorldSphereCollider } from '@/lib/physics/worldCollision'
import type { Heightmap } from '@/lib/terrain/heightmap'
import type { SurfaceFeatures, MineralEntry } from '@/lib/asteroids/types'
import type { Tickable } from '@/lib/Tickable'
import {
  generateAsteroidRockDistribution,
  type AsteroidRockSpawn,
  type RockExclusionZone,
} from '@/lib/terrain/asteroidRockDistribution'
import { loadGLB, fixMaterials } from '@/three/loadGLB'
import { resolveCompositionItemId } from '@/lib/asteroids/mineralItemMap'

/**
 * Instanced surface rocks on asteroid terrain with mining hit feedback.
 *
 * @author guinetik
 * @date 2026-04-19
 * @spec docs/asteroid-lander-gdd.md
 */

/** Seconds for a hit flash to decay back to neutral. */
const FLASH_DURATION_SEC = 0.18
/** Peak brightness multiplier applied to the per-instance color on hit. */
const FLASH_PEAK_INTENSITY = 3.2
/**
 * Per-instance hit flash record. We keep the `mesh`/`localIndex` on
 * the record so the tick loop can write back without re-querying the
 * `instanceLocations` map on every frame.
 */
interface FlashRecord {
  mesh: THREE.InstancedMesh
  localIndex: number
  remaining: number
}
const _flashColor = new THREE.Color()
const _neutralColor = new THREE.Color(1, 1, 1)

const SURFACE_ROCK_GLB_URL = '/models/asteroids.glb'
const ROCK_TEXTURE_REPEAT = 1.35
const ROCK_TEXTURE_BASE_DIR = '/textures/rocks'
/** Rock-local reflection strength; keeps mineral highlights from mirror-glinting under PMREM. */
const ROCK_ENV_MAP_INTENSITY = 0.32
/** Upper metalness bound for mined rocks so metallic minerals stay mineral, not chrome. */
const ROCK_MAX_METALNESS = 0.06
/** Always sink rock bases slightly so instances read as embedded in regolith. */
const ROCK_BASE_SINK_FRACTION = 0.1
/** Fraction of spawn burial applied to vertical planting depth. */
const ROCK_BURIAL_SINK_MULTIPLIER = 0.92
/** How much burial reduces the exposed visual/collision height. */
const ROCK_EXPOSED_HEIGHT_BURIAL_MULTIPLIER = 0.68

/**
 * Per-mineral material definition. `folder` is the subdirectory under
 * {@link ROCK_TEXTURE_BASE_DIR} that holds `color.jpg`, `gl.jpg`, and
 * `roughness.jpg`. `metalness` is a scalar because the authored PBR
 * sets are all dielectric; metallic minerals (iron-nickel, troilite)
 * are tuned up via this value so the material reads correctly even
 * without a dedicated metalness map.
 */
interface MineralMaterialDef {
  /** Stable key matched against `composition[].name` strings. */
  key: string
  /** Folder under {@link ROCK_TEXTURE_BASE_DIR}. */
  folder: string
  /** Metalness scalar passed to {@link THREE.MeshStandardMaterial.metalness}. */
  metalness: number
}

/**
 * Catalog of every mineral texture set shipping under
 * `public/textures/rocks/`. Keys are lower-case canonical identifiers;
 * the {@link MINERAL_NAME_ALIASES} table maps display names from
 * asteroid JSON composition arrays onto these keys.
 */
const MINERAL_CATALOG: readonly MineralMaterialDef[] = [
  { key: 'olivine', folder: 'olivine', metalness: 0.05 },
  { key: 'pyroxene', folder: 'pyroxene', metalness: 0.05 },
  { key: 'plagioclase', folder: 'plagioclase', metalness: 0.02 },
  { key: 'troilite', folder: 'troilite', metalness: 0.03 },
  { key: 'nickel', folder: 'nickel', metalness: 0.15 },
  { key: 'magnetite', folder: 'magnetite', metalness: 0.09 },
  { key: 'silicates', folder: 'silicates', metalness: 0.02 },
  { key: 'organic', folder: 'organic', metalness: 0.02 },
  { key: 'carbonates', folder: 'carbonates', metalness: 0.02 },
  { key: 'ice', folder: 'ice', metalness: 0.05 },
  { key: 'co2', folder: 'co2', metalness: 0.02 },
  { key: 'silicate', folder: 'silicate', metalness: 0.02 },
  { key: 'ammonia', folder: 'ammonia', metalness: 0.02 },
  { key: 'halite', folder: 'halite', metalness: 0.02 },
  { key: 'lava', folder: 'lava', metalness: 0.05 },
  { key: 'sulfur', folder: 'sulfur', metalness: 0.02 },
  { key: 'hematite', folder: 'hematite', metalness: 0.04 },
  { key: 'obsidian', folder: 'obsidian', metalness: 0.02 },
]

/**
 * Inventory item id → mineral catalog key. The yield system rolls an
 * {@link resolveCompositionItemId} item id per spawn; this table maps
 * that id onto the folder in {@link MINERAL_CATALOG}. Keeping the
 * mapping keyed by item id (instead of display name) is what keeps
 * the renderer and the mining system in perfect agreement — they
 * both resolve a composition entry to the same id first, then the
 * renderer looks up the folder from that id.
 */
const MINERAL_ITEM_ID_TO_KEY: ReadonlyMap<string, string> = new Map([
  ['olivine', 'olivine'],
  ['pyroxene', 'pyroxene'],
  ['enstatite', 'pyroxene'],
  ['plagioclase-feldspar', 'plagioclase'],
  ['iron-sulfides', 'troilite'],
  ['troilite', 'troilite'],
  ['iron-nickel-alloy', 'nickel'],
  ['magnetite', 'magnetite'],
  ['hydrated-silicates', 'silicates'],
  ['organic-compounds', 'organic'],
  ['carbonates', 'carbonates'],
  ['water-ice', 'ice'],
  ['carbon-dioxide-ice', 'co2'],
  ['silicate-dust', 'silicate'],
  ['ammonia-hydrate', 'ammonia'],
  ['sodium-chloride', 'halite'],
  ['basaltic-lava', 'lava'],
  ['sulfur-deposits', 'sulfur'],
  ['iron-oxide', 'hematite'],
  ['hematite', 'hematite'],
  ['volcanic-glass', 'obsidian'],
])

/** Fallback mineral used when a composition entry has no catalog match. */
const DEFAULT_MINERAL_KEY = 'olivine'

/** Resolved to an entry in {@link MINERAL_CATALOG} keyed by mineral identifier. */
const MINERAL_CATALOG_BY_KEY: ReadonlyMap<string, MineralMaterialDef> = new Map(
  MINERAL_CATALOG.map((def) => [def.key, def]),
)

/** Loaded PBR texture triple for one mineral. */
interface MineralTextureSet {
  map: THREE.Texture
  normalMap: THREE.Texture
  roughnessMap: THREE.Texture
}

/** Normalized rock mesh template extracted from the shared GLB. */
interface RockTemplate {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  bottomY: number
}

/** Construction inputs for {@link SurfaceRockController.create}. */
interface SurfaceRockControllerOptions {
  /** Terrain heightmap used to plant rocks on the ground. */
  heightmap: Heightmap
  /** Authored surface traits driving abundance / size distributions. */
  surface: SurfaceFeatures
  /** Mineral breakdown of the host asteroid — drives per-spawn texture selection. */
  composition: readonly MineralEntry[]
  /** Deterministic seed for procedural placement. */
  seed: number
  /** Optional exclusion zones (landing pad, mission POIs). */
  exclusions?: readonly RockExclusionZone[]
  /** Optional subtle biome tint blended into every mineral albedo. */
  baseColor?: readonly [number, number, number]
}

let templateCachePromise: Promise<RockTemplate[]> | null = null
const mineralTextureCache = new Map<string, Promise<MineralTextureSet>>()

/** Pulls normalized rock templates from every mesh in the asteroids GLB. */
function extractTemplates(glbScene: THREE.Group): RockTemplate[] {
  const results: RockTemplate[] = []

  glbScene.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return

    const geometry = child.geometry.clone()
    geometry.computeBoundingBox()
    const box = geometry.boundingBox
    if (!box) return

    const size = new THREE.Vector3()
    box.getSize(size)
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const center = new THREE.Vector3()
    box.getCenter(center)
    geometry.translate(-center.x, -center.y, -center.z)
    geometry.scale(1 / maxDim, 1 / maxDim, 1 / maxDim)
    geometry.computeBoundingBox()

    const normalizedBox = geometry.boundingBox
    if (!normalizedBox) return

    results.push({
      geometry,
      material: (Array.isArray(child.material) ? child.material[0]! : child.material).clone(),
      bottomY: normalizedBox.min.y,
    })
  })

  return results
}

/** Loads and caches normalized templates from `asteroids.glb`. */
async function getRockTemplates(): Promise<RockTemplate[]> {
  if (!templateCachePromise) {
    templateCachePromise = loadGLB(SURFACE_ROCK_GLB_URL).then((scene) => {
      fixMaterials(scene)
      return extractTemplates(scene)
    })
  }
  return templateCachePromise
}

/**
 * Configure a freshly loaded tile on a rock surface — wraps, tiles, anisotropy.
 * `isColor` flips the color-space so only albedos go through sRGB decoding.
 *
 * @param texture - Texture to configure in-place.
 * @param isColor - Whether the texture is an sRGB albedo (`true`) or linear data (`false`).
 */
function configureRockTexture(texture: THREE.Texture, isColor: boolean): void {
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(ROCK_TEXTURE_REPEAT, ROCK_TEXTURE_REPEAT)
  texture.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace
  texture.anisotropy = 8
}

/**
 * Load (and cache) the color / normal / roughness triple for a single
 * mineral folder. Cached globally so repeated asteroid enters do not
 * re-decode the same files.
 *
 * @param def - Catalog entry for the mineral.
 * @returns Promise resolving to a ready-to-assign texture set.
 */
function getMineralTextureSet(def: MineralMaterialDef): Promise<MineralTextureSet> {
  const cached = mineralTextureCache.get(def.key)
  if (cached) return cached

  const loader = new THREE.TextureLoader()
  const base = `${ROCK_TEXTURE_BASE_DIR}/${def.folder}`
  const map = loader.load(`${base}/color.jpg`)
  const normalMap = loader.load(`${base}/gl.jpg`)
  const roughnessMap = loader.load(`${base}/roughness.jpg`)
  configureRockTexture(map, true)
  configureRockTexture(normalMap, false)
  configureRockTexture(roughnessMap, false)

  const promise = Promise.resolve({ map, normalMap, roughnessMap })
  mineralTextureCache.set(def.key, promise)
  return promise
}

/**
 * Clones a template material and wires the mineral PBR set (albedo +
 * normal + roughness). Per-look scalars are gone — the authored maps
 * drive surface response; metalness comes from {@link MineralMaterialDef}.
 *
 * @param source - Base material cloned from the GLB template.
 * @param def - Mineral catalog entry (supplies metalness scalar).
 * @param textures - Loaded color / normal / roughness triple.
 * @param baseColor - Optional biome tint gently mixed into albedo.
 */
function tuneRockMaterial(
  source: THREE.Material,
  def: MineralMaterialDef,
  textures: MineralTextureSet,
  baseColor?: readonly [number, number, number],
): THREE.Material {
  const material = source.clone()

  if (material instanceof THREE.MeshStandardMaterial) {
    material.map = textures.map
    material.normalMap = textures.normalMap
    material.roughnessMap = textures.roughnessMap
    material.color.setRGB(1, 1, 1)
    material.roughness = 1
    material.metalness = Math.min(def.metalness, ROCK_MAX_METALNESS)
    material.envMapIntensity = ROCK_ENV_MAP_INTENSITY
    material.emissive.setHex(0x000000)
    material.emissiveIntensity = 0
    if (baseColor) {
      const tint = new THREE.Color(baseColor[0], baseColor[1], baseColor[2])
      material.color.lerp(tint, 0.08)
    }
  }

  material.needsUpdate = true
  return material
}

/**
 * Cumulative weight table built from asteroid composition percentages,
 * filtered to entries that resolve to a registered inventory item id.
 * Matches the exact filter {@link RockYieldSystem} applies, so when
 * both systems use the same seed + spawn index they pick the same
 * mineral for every rock.
 */
interface WeightedMineralTable {
  /** Mineral folder keys in selection order. */
  keys: readonly string[]
  /** Cumulative weights — last entry is the total usable probability mass. */
  cumulative: readonly number[]
}

/**
 * Build the weighted mineral table from an asteroid's composition using
 * the same filter the yield system applies: `resolveCompositionItemId`
 * must return a registered inventory id, and the item id must map to
 * a texture folder via {@link MINERAL_ITEM_ID_TO_KEY}. Empty results
 * collapse onto {@link DEFAULT_MINERAL_KEY}.
 *
 * @param composition - Mineral breakdown from asteroid JSON.
 * @returns Cumulative weight table aligned with the yield system's picker.
 */
function buildWeightedMineralTable(composition: readonly MineralEntry[]): WeightedMineralTable {
  const keys: string[] = []
  const cumulative: number[] = []
  let total = 0

  for (const entry of composition) {
    if (entry.percentage <= 0) continue
    const itemId = resolveCompositionItemId(entry.name)
    if (itemId === null) continue
    const folderKey = MINERAL_ITEM_ID_TO_KEY.get(itemId)
    if (!folderKey || !MINERAL_CATALOG_BY_KEY.has(folderKey)) continue
    total += entry.percentage
    keys.push(folderKey)
    cumulative.push(total)
  }

  if (keys.length === 0) {
    return { keys: [DEFAULT_MINERAL_KEY], cumulative: [1] }
  }

  return { keys, cumulative }
}

/**
 * Deterministic float in [0, 1) from a seed and a salt integer.
 * Mirrors {@link RockYieldSystem}'s internal `pseudoRandom` so the
 * renderer and mining system produce identical mineral picks for
 * the same `(seed, spawnIndex)` pair.
 *
 * @param seed - World/mission seed (integer).
 * @param salt - Per-spawn integer (typically the spawn index).
 * @returns Deterministic float in [0, 1).
 */
function mineralPseudoRandom(seed: number, salt: number): number {
  let s = ((seed | 0) * 0x9e3779b1) ^ ((salt | 0) * 0x85ebca77)
  s = (s + 0x6d2b79f5) | 0
  let t = Math.imul(s ^ (s >>> 15), 1 | s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * Deterministic weighted mineral pick for a given rock spawn. Uses the
 * same hash and weight basis as the yield system so the picked folder
 * always matches the mineral the drill extracts from that rock.
 *
 * @param spawnIndex - Stable index of the spawn in the distribution.
 * @param seed - World/mission seed (same value the yield system gets).
 * @param table - Weighted selection table from the composition.
 * @returns Canonical mineral folder key picked for this rock.
 */
function selectMineralKeyForSpawn(
  spawnIndex: number,
  seed: number,
  table: WeightedMineralTable,
): string {
  const total = table.cumulative[table.cumulative.length - 1] ?? 1
  const target = mineralPseudoRandom(seed, spawnIndex) * total
  for (let i = 0; i < table.keys.length; i++) {
    if (target < table.cumulative[i]!) {
      return table.keys[i]!
    }
  }
  return table.keys[table.keys.length - 1]!
}

/** Maps a logical spawn index to its instanced mesh + instance id. */
interface RockInstanceLocation {
  mesh: THREE.InstancedMesh
  localIndex: number
}

/** Places instanced rocks, handles mining hits, and hides collected spawns. */
export class SurfaceRockController implements Tickable {
  readonly group = new THREE.Group()
  readonly spawns: readonly AsteroidRockSpawn[]
  private readonly meshes: THREE.InstancedMesh[] = []
  private readonly instanceLocations = new Map<number, RockInstanceLocation>()
  private readonly hiddenSpawns = new Set<number>()
  private readonly activeFlashes = new Map<number, FlashRecord>()
  private static readonly _zeroMatrix = new THREE.Matrix4().scale(new THREE.Vector3(0, 0, 0))

  private constructor(spawns: AsteroidRockSpawn[]) {
    this.spawns = spawns
    this.group.name = 'surfaceRocks'
  }

  static async create(options: SurfaceRockControllerOptions): Promise<SurfaceRockController> {
    const templates = await getRockTemplates()
    const spawns = generateAsteroidRockDistribution({
      seed: options.seed,
      worldSize: options.heightmap.worldSize,
      surface: options.surface,
      exclusions: options.exclusions,
      slopeAt: (x, z) => options.heightmap.slopeAt(x, z),
      isValidGround: (x, z) => options.heightmap.isValidAt(x, z),
    })

    const controller = new SurfaceRockController(spawns)
    if (templates.length === 0 || spawns.length === 0) return controller

    const weightedMinerals = buildWeightedMineralTable(options.composition)
    const mineralKeys = weightedMinerals.keys
    const mineralIndexByKey = new Map<string, number>(mineralKeys.map((key, i) => [key, i]))

    const mineralDefs: MineralMaterialDef[] = mineralKeys.map(
      (key) => MINERAL_CATALOG_BY_KEY.get(key)!,
    )
    const mineralTextures = await Promise.all(mineralDefs.map((def) => getMineralTextureSet(def)))

    const groupedSpawns = Array.from(
      { length: templates.length * mineralKeys.length },
      () => [] as { spawn: AsteroidRockSpawn; spawnIndex: number }[],
    )

    for (let i = 0; i < spawns.length; i++) {
      const spawn = spawns[i]!
      const templateIndex = i % templates.length
      const mineralKey = selectMineralKeyForSpawn(i, options.seed, weightedMinerals)
      const mineralIndex = mineralIndexByKey.get(mineralKey) ?? 0
      groupedSpawns[mineralIndex * templates.length + templateIndex]!.push({
        spawn,
        spawnIndex: i,
      })
    }

    const reusablePos = new THREE.Vector3()
    const reusableScale = new THREE.Vector3()
    const reusableQuat = new THREE.Quaternion()
    const reusableEuler = new THREE.Euler()
    const reusableMatrix = new THREE.Matrix4()

    for (let mineralIndex = 0; mineralIndex < mineralKeys.length; mineralIndex++) {
      const def = mineralDefs[mineralIndex]!
      const textures = mineralTextures[mineralIndex]!

      for (let ti = 0; ti < templates.length; ti++) {
        const bucket = groupedSpawns[mineralIndex * templates.length + ti]!
        if (bucket.length === 0) continue

        const template = templates[ti]!
        const material = tuneRockMaterial(template.material, def, textures, options.baseColor)
        const mesh = new THREE.InstancedMesh(template.geometry.clone(), material, bucket.length)
        mesh.name = `surfaceRock-${def.key}-${ti}`
        // Rocks no longer cast shadows. With 250–1000 instances across many
        // batches, the shadow pass was rendering each rock a second time
        // every frame; disabling halves the rock workload at the cost of
        // missing self-shadows on terrain. Receive-shadow is kept so the
        // sun/lander shadows from larger geometry still land on rocks.
        //
        // @spec docs/superpowers/specs/2026-04-18-fps-perf-fixes-design.md (v4)
        mesh.castShadow = false
        mesh.receiveShadow = true
        // Frustum culling is enabled per-batch — the bounding sphere is
        // recomputed below after every instance matrix is written so the
        // sphere actually encloses the placed rocks (not just the geometry
        // around its origin). Without this, hundreds of rock batches would
        // submit draw calls every frame regardless of camera direction,
        // which is exactly the camera-rotation lag we are chasing.
        mesh.frustumCulled = true
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)

        for (let localIndex = 0; localIndex < bucket.length; localIndex++) {
          const entry = bucket[localIndex]!
          const spawn = entry.spawn
          const groundY = options.heightmap.heightAt(spawn.x, spawn.z)
          const scaleX = spawn.diameter
          const scaleY = spawn.diameter * spawn.heightRatio
          const scaleZ = spawn.diameter

          reusablePos.set(
            spawn.x,
            groundY -
              template.bottomY * scaleY -
              scaleY * ROCK_BASE_SINK_FRACTION -
              spawn.burial * scaleY * ROCK_BURIAL_SINK_MULTIPLIER,
            spawn.z,
          )
          reusableScale.set(scaleX, scaleY, scaleZ)
          reusableEuler.set(spawn.tiltX, spawn.rotationY, spawn.tiltZ)
          reusableQuat.setFromEuler(reusableEuler)
          reusableMatrix.compose(reusablePos, reusableQuat, reusableScale)
          mesh.setMatrixAt(localIndex, reusableMatrix)
          controller.instanceLocations.set(entry.spawnIndex, { mesh, localIndex })
        }

        mesh.instanceMatrix.needsUpdate = true
        mesh.computeBoundingSphere()
        controller.meshes.push(mesh)
        controller.group.add(mesh)
      }
    }

    return controller
  }

  dispose(): void {
    this.group.removeFromParent()
    for (const mesh of this.meshes) {
      mesh.geometry.dispose()
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of mats) material.dispose()
    }
    this.meshes.length = 0
  }

  buildColliders(heightmap: Heightmap): WorldSphereCollider[] {
    return this.spawns.map((spawn, index) => {
      const radius = Math.max(1.2, spawn.diameter * 0.34)
      const exposedHeight =
        spawn.diameter *
        spawn.heightRatio *
        (1 - spawn.burial * ROCK_EXPOSED_HEIGHT_BURIAL_MULTIPLIER)
      const centerY =
        heightmap.heightAt(spawn.x, spawn.z) + Math.max(radius * 0.7, exposedHeight * 0.45)
      return {
        id: rockColliderId(index),
        kind: 'sphere',
        center: { x: spawn.x, y: centerY, z: spawn.z },
        radius,
        minY: heightmap.heightAt(spawn.x, spawn.z) - spawn.diameter * 0.1,
        maxY: centerY + radius,
      }
    })
  }

  /**
   * Hide the visual instance for `spawnIndex` by zero-scaling its
   * matrix. Idempotent — repeated calls are no-ops. Caller is
   * responsible for removing the matching collider via the level's
   * collider registry.
   */
  hideRock(spawnIndex: number): void {
    if (this.hiddenSpawns.has(spawnIndex)) return
    const location = this.instanceLocations.get(spawnIndex)
    if (!location) return
    location.mesh.setMatrixAt(location.localIndex, SurfaceRockController._zeroMatrix)
    location.mesh.instanceMatrix.needsUpdate = true
    this.hiddenSpawns.add(spawnIndex)
  }

  /** True when a given spawn has been hidden (mined out). */
  isHidden(spawnIndex: number): boolean {
    return this.hiddenSpawns.has(spawnIndex)
  }

  /**
   * Lazily allocate a per-instance color buffer on `mesh` so individual
   * rocks can be tinted without affecting their batch siblings. The
   * buffer is initialised to neutral white (1,1,1) so the standard
   * material behaves identically until {@link flashRock} is called.
   *
   * Idempotent — repeated calls reuse the existing attribute.
   */
  private ensureInstanceColors(mesh: THREE.InstancedMesh): void {
    if (mesh.instanceColor) return
    const count = mesh.count
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      colors[i * 3] = 1
      colors[i * 3 + 1] = 1
      colors[i * 3 + 2] = 1
    }
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3)
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
    mesh.instanceColor.needsUpdate = true
  }

  /**
   * Briefly tint a single rock white-hot to acknowledge a projectile
   * hit. Subsequent calls on the same `spawnIndex` retrigger the flash,
   * matching the visual feedback that enemies use via their per-controller
   * `flash()` method. Mined-out (hidden) rocks are ignored so we don't
   * resurrect zero-scaled instances.
   */
  flashRock(spawnIndex: number): void {
    if (this.hiddenSpawns.has(spawnIndex)) return
    const location = this.instanceLocations.get(spawnIndex)
    if (!location) return
    this.ensureInstanceColors(location.mesh)
    const existing = this.activeFlashes.get(spawnIndex)
    if (existing) {
      existing.remaining = FLASH_DURATION_SEC
    } else {
      this.activeFlashes.set(spawnIndex, {
        mesh: location.mesh,
        localIndex: location.localIndex,
        remaining: FLASH_DURATION_SEC,
      })
    }
    _flashColor.setRGB(FLASH_PEAK_INTENSITY, FLASH_PEAK_INTENSITY, FLASH_PEAK_INTENSITY)
    location.mesh.setColorAt(location.localIndex, _flashColor)
    if (location.mesh.instanceColor) location.mesh.instanceColor.needsUpdate = true
  }

  /**
   * Decay every active hit-flash toward neutral white and finalise any
   * that have expired. Cheap when nothing is flashing — only iterates
   * the active set, never the full instance pool.
   */
  tick(dt: number): void {
    if (this.activeFlashes.size === 0) return
    const finished: number[] = []
    for (const [spawnIndex, record] of this.activeFlashes) {
      record.remaining -= dt
      if (record.remaining <= 0) {
        record.mesh.setColorAt(record.localIndex, _neutralColor)
        if (record.mesh.instanceColor) record.mesh.instanceColor.needsUpdate = true
        finished.push(spawnIndex)
        continue
      }
      const t = record.remaining / FLASH_DURATION_SEC
      const intensity = 1 + (FLASH_PEAK_INTENSITY - 1) * t
      _flashColor.setRGB(intensity, intensity, intensity)
      record.mesh.setColorAt(record.localIndex, _flashColor)
      if (record.mesh.instanceColor) record.mesh.instanceColor.needsUpdate = true
    }
    for (const spawnIndex of finished) this.activeFlashes.delete(spawnIndex)
  }

  /**
   * World-space center of the rock's collision sphere. Used by the
   * level controller to spawn tractor particles that home toward the
   * player's gun. Returns `null` when the spawn is unknown.
   */
  getRockCenter(
    spawnIndex: number,
    heightmap: Heightmap,
    out: THREE.Vector3,
  ): THREE.Vector3 | null {
    const spawn = this.spawns[spawnIndex]
    if (!spawn) return null
    const radius = Math.max(1.2, spawn.diameter * 0.34)
    const exposedHeight =
      spawn.diameter *
      spawn.heightRatio *
      (1 - spawn.burial * ROCK_EXPOSED_HEIGHT_BURIAL_MULTIPLIER)
    const centerY =
      heightmap.heightAt(spawn.x, spawn.z) + Math.max(radius * 0.7, exposedHeight * 0.45)
    return out.set(spawn.x, centerY, spawn.z)
  }

  /**
   * Effective collision-sphere radius for a registered spawn, in
   * world units. Mirrors the radius used by {@link getRockCenter} so
   * UI elements (e.g. the targeting HP bar) can clear the visible
   * surface of the rock instead of intersecting it on big spawns.
   */
  getRockRadius(spawnIndex: number): number | null {
    const spawn = this.spawns[spawnIndex]
    if (!spawn) return null
    return Math.max(1.2, spawn.diameter * 0.34)
  }

  /**
   * Per-instance world-space transform and geometry reference for the
   * rock at `spawnIndex`. Used by overlay controllers (e.g. prospect
   * wireframe) that need to mirror the exact silhouette, position,
   * rotation, and scale of the visible rock instance instead of
   * approximating with a sphere.
   *
   * The returned `matrix` is a fresh copy — safe for the caller to
   * decompose. The `geometry` reference is shared (do not dispose it).
   *
   * @param spawnIndex Logical spawn id.
   * @returns `{ geometry, matrix }` or `null` when the spawn is unknown.
   */
  getRockInstanceTransform(
    spawnIndex: number,
  ): { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 } | null {
    const location = this.instanceLocations.get(spawnIndex)
    if (!location) return null
    const matrix = new THREE.Matrix4()
    location.mesh.getMatrixAt(location.localIndex, matrix)
    return { geometry: location.mesh.geometry, matrix }
  }
}

/**
 * Canonical collider id for a surface rock at `spawnIndex`.
 * Kept exported so the level controller can route hits/removals
 * without duplicating the format string.
 */
export function rockColliderId(spawnIndex: number): string {
  return `surface-rock-${spawnIndex}`
}
