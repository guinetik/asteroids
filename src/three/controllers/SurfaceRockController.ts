import * as THREE from 'three'
import type { WorldSphereCollider } from '@/lib/physics/worldCollision'
import type { Heightmap } from '@/lib/terrain/heightmap'
import type { SurfaceFeatures } from '@/lib/asteroids/types'
import {
  generateAsteroidRockDistribution,
  type AsteroidRockSpawn,
  type RockExclusionZone,
} from '@/lib/terrain/asteroidRockDistribution'
import { loadGLB, fixMaterials } from '@/three/loadGLB'

const SURFACE_ROCK_GLB_URL = '/models/asteroids.glb'
const ROCK_TEXTURE_REPEAT = 1.35

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

interface RockTemplate {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  bottomY: number
}

interface SurfaceRockControllerOptions {
  heightmap: Heightmap
  surface: SurfaceFeatures
  seed: number
  exclusions?: readonly RockExclusionZone[]
  baseColor?: readonly [number, number, number]
}

let templateCachePromise: Promise<RockTemplate[]> | null = null
let rockTextureCachePromise: Promise<readonly THREE.Texture[]> | null = null

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

async function getRockTemplates(): Promise<RockTemplate[]> {
  if (!templateCachePromise) {
    templateCachePromise = loadGLB(SURFACE_ROCK_GLB_URL).then((scene) => {
      fixMaterials(scene)
      return extractTemplates(scene)
    })
  }
  return templateCachePromise
}

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

function selectRockLookIndex(spawn: AsteroidRockSpawn, seed: number): number {
  const mix = Math.sin(spawn.x * 0.0061 + spawn.z * 0.0047 + seed * 0.000013) * 43758.5453
  const normalized = mix - Math.floor(mix)
  return Math.min(ROCK_LOOKS.length - 1, Math.floor(normalized * ROCK_LOOKS.length))
}

export class SurfaceRockController {
  readonly group = new THREE.Group()
  readonly spawns: readonly AsteroidRockSpawn[]
  private readonly meshes: THREE.InstancedMesh[] = []

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
      () => [] as AsteroidRockSpawn[],
    )

    for (let i = 0; i < spawns.length; i++) {
      const spawn = spawns[i]!
      const templateIndex = i % templates.length
      const lookIndex = selectRockLookIndex(spawn, options.seed)
      groupedSpawns[lookIndex * templates.length + templateIndex]!.push(spawn)
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
          const spawn = bucket[localIndex]!
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
        id: `surface-rock-${index}`,
        kind: 'sphere',
        center: { x: spawn.x, y: centerY, z: spawn.z },
        radius,
        minY: heightmap.heightAt(spawn.x, spawn.z) - spawn.diameter * 0.1,
        maxY: centerY + radius,
      }
    })
  }
}
