import * as THREE from 'three'
import type { WorldSphereCollider } from '@/lib/physics/worldCollision'
import type { Heightmap } from '@/lib/terrain/heightmap'
import type { SurfaceFeatures } from '@/lib/asteroids/types'
import type { Tickable } from '@/lib/Tickable'
import {
  generateAsteroidRockDistribution,
  type AsteroidRockSpawn,
  type RockExclusionZone,
} from '@/lib/terrain/asteroidRockDistribution'
import { loadGLB, fixMaterials } from '@/three/loadGLB'

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

/** Named material preset mapped to a tiled albedo texture. */
interface RockLook {
  name: string
  textureUrl: string
  color: number
  roughness: number
  metalness: number
}

const ROCK_LOOKS: readonly RockLook[] = [
  {
    name: 'basalt',
    textureUrl: '/textures/rocks/basalt.jpg',
    color: 0x5b4c42,
    roughness: 0.94,
    metalness: 0.03,
  },
  {
    name: 'hematite',
    textureUrl: '/textures/rocks/hematite.jpg',
    color: 0x8a5a49,
    roughness: 0.7,
    metalness: 0.18,
  },
  {
    name: 'olivine',
    textureUrl: '/textures/rocks/olivine.jpg',
    color: 0x6a7350,
    roughness: 0.82,
    metalness: 0.08,
  },
]

/** Normalized rock mesh template extracted from the shared GLB. */
interface RockTemplate {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  bottomY: number
}

/** Construction inputs for {@link SurfaceRockController.create}. */
interface SurfaceRockControllerOptions {
  heightmap: Heightmap
  surface: SurfaceFeatures
  seed: number
  exclusions?: readonly RockExclusionZone[]
  baseColor?: readonly [number, number, number]
}

let templateCachePromise: Promise<RockTemplate[]> | null = null
let rockTextureCachePromise: Promise<readonly THREE.Texture[]> | null = null

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

/** Loads and caches repeating albedo textures for each {@link ROCK_LOOKS} entry. */
async function getRockTextures(): Promise<readonly THREE.Texture[]> {
  if (!rockTextureCachePromise) {
    const loader = new THREE.TextureLoader()
    rockTextureCachePromise = Promise.resolve(
      ROCK_LOOKS.map((look) => {
        const texture = loader.load(look.textureUrl)
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.repeat.set(ROCK_TEXTURE_REPEAT, ROCK_TEXTURE_REPEAT)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = 8
        return texture
      }),
    )
  }
  return rockTextureCachePromise
}

/** Clones a template material, assigns albedo + optional mineral tint. */
function tuneRockMaterial(
  source: THREE.Material,
  look: RockLook,
  map: THREE.Texture,
  baseColor?: readonly [number, number, number],
): THREE.Material {
  const material = source.clone()

  if (material instanceof THREE.MeshStandardMaterial) {
    material.map = map
    material.color.setHex(look.color)
    material.roughness = look.roughness
    material.metalness = look.metalness
    if (baseColor) {
      const tint = new THREE.Color(baseColor[0], baseColor[1], baseColor[2])
      material.color.lerp(tint, 0.08)
      material.emissive.setHex(0x000000)
      material.emissiveIntensity = 0
    }
  }

  material.needsUpdate = true
  return material
}

/** Stable rock palette index from spawn position and world seed. */
function selectRockLookIndex(spawn: AsteroidRockSpawn, seed: number): number {
  const mix = Math.sin(spawn.x * 0.0061 + spawn.z * 0.0047 + seed * 0.000013) * 43758.5453
  const normalized = mix - Math.floor(mix)
  return Math.min(ROCK_LOOKS.length - 1, Math.floor(normalized * ROCK_LOOKS.length))
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
    const rockTextures = await getRockTextures()
    const spawns = generateAsteroidRockDistribution({
      seed: options.seed,
      worldSize: options.heightmap.worldSize,
      surface: options.surface,
      exclusions: options.exclusions,
      slopeAt: (x, z) => options.heightmap.slopeAt(x, z),
    })

    const controller = new SurfaceRockController(spawns)
    if (templates.length === 0 || spawns.length === 0) return controller

    const groupedSpawns = Array.from(
      { length: templates.length * ROCK_LOOKS.length },
      () => [] as { spawn: AsteroidRockSpawn; spawnIndex: number }[],
    )

    for (let i = 0; i < spawns.length; i++) {
      const spawn = spawns[i]!
      const templateIndex = i % templates.length
      const lookIndex = selectRockLookIndex(spawn, options.seed)
      groupedSpawns[lookIndex * templates.length + templateIndex]!.push({ spawn, spawnIndex: i })
    }

    const reusablePos = new THREE.Vector3()
    const reusableScale = new THREE.Vector3()
    const reusableQuat = new THREE.Quaternion()
    const reusableEuler = new THREE.Euler()
    const reusableMatrix = new THREE.Matrix4()

    for (let lookIndex = 0; lookIndex < ROCK_LOOKS.length; lookIndex++) {
      const look = ROCK_LOOKS[lookIndex]!
      const texture = rockTextures[lookIndex]!

      for (let ti = 0; ti < templates.length; ti++) {
        const bucket = groupedSpawns[lookIndex * templates.length + ti]!
        if (bucket.length === 0) continue

        const template = templates[ti]!
        const material = tuneRockMaterial(template.material, look, texture, options.baseColor)
        const mesh = new THREE.InstancedMesh(template.geometry.clone(), material, bucket.length)
        mesh.name = `surfaceRock-${look.name}-${ti}`
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
            groundY - template.bottomY * scaleY - spawn.burial * scaleY * 0.45 - scaleY * 0.04,
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
      const exposedHeight = spawn.diameter * spawn.heightRatio * (1 - spawn.burial * 0.35)
      const centerY = heightmap.heightAt(spawn.x, spawn.z) + Math.max(radius * 0.7, exposedHeight * 0.45)
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
  getRockCenter(spawnIndex: number, heightmap: Heightmap, out: THREE.Vector3): THREE.Vector3 | null {
    const spawn = this.spawns[spawnIndex]
    if (!spawn) return null
    const radius = Math.max(1.2, spawn.diameter * 0.34)
    const exposedHeight = spawn.diameter * spawn.heightRatio * (1 - spawn.burial * 0.35)
    const centerY = heightmap.heightAt(spawn.x, spawn.z) + Math.max(radius * 0.7, exposedHeight * 0.45)
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
}

/**
 * Canonical collider id for a surface rock at `spawnIndex`.
 * Kept exported so the level controller can route hits/removals
 * without duplicating the format string.
 */
export function rockColliderId(spawnIndex: number): string {
  return `surface-rock-${spawnIndex}`
}
