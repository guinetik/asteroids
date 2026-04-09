/**
 * Decorative asteroid mesh shown at the shuttle map mission waypoint.
 *
 * Loads a random shape from `asteroids.glb` (same asset as belt instances),
 * scaled up so the destination reads clearly as “flying to a rock.”
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/superpowers/specs/2026-04-05-map-shuttle-player-design.md
 */
import * as THREE from 'three'
import { loadGLB, fixMaterials } from '@/three/loadGLB'

/** Served path for the shared asteroid shape pack (see `AsteroidBeltController`). */
const MAP_MISSION_ASTEROID_GLB_URL = '/models/asteroids.glb'

/**
 * Uniform scale applied after centering geometry at the origin.
 * Chosen to sit well next to the orbit-map waypoint beam once the parent
 * group applies screen-size scaling (~5–10× typical belt instance size).
 */
const MAP_MISSION_ASTERO_PREVIEW_BASE_SCALE = 5.5

/** Warm emissive tint so the rock reads under map lighting (matches belt tuning). */
const MAP_MISSION_ASTERO_PREVIEW_EMISSIVE_RGB: readonly [number, number, number] = [
  0.07, 0.06, 0.05,
]

/** Emissive intensity for map preview meshes. */
const MAP_MISSION_ASTERO_PREVIEW_EMISSIVE_INTENSITY = 0.48

/** Minimum roughness for preview materials. */
const MAP_MISSION_ASTERO_PREVIEW_ROUGHNESS_MIN = 0.9

/** Maximum metalness for preview materials. */
const MAP_MISSION_ASTERO_PREVIEW_METALNESS_MAX = 0.1

/**
 * XOR salt so orientation keys differ from the shape index derived from the same
 * mission seed.
 */
const MAP_MISSION_ASTERO_ORIENTATION_SEED_SALT = 0xcbf29ce4

interface GeometryMaterialPair {
  /** Mesh vertex data (owned by the template cache; clone before use). */
  geometry: THREE.BufferGeometry
  /** Surface material (owned by the template cache; clone before use). */
  material: THREE.Material
}

let asteroidShapeTemplatesPromise: Promise<GeometryMaterialPair[]> | null = null

/**
 * Collect mesh geometry + material pairs from a loaded GLB scene.
 *
 * @param glbScene - Root group from `loadGLB`
 * @returns One entry per mesh found (geometry and material are cloned)
 */
function extractGeometryMaterialPairs(glbScene: THREE.Group): GeometryMaterialPair[] {
  const results: GeometryMaterialPair[] = []
  glbScene.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      results.push({
        geometry: child.geometry.clone(),
        material: (Array.isArray(child.material) ? child.material[0]! : child.material).clone(),
      })
    }
  })
  return results
}

/**
 * Load and cache asteroid shape templates from the shared GLB.
 *
 * @returns Non-empty array of reusable template pairs, or empty if the file has no meshes
 */
async function loadAsteroidShapeTemplates(): Promise<GeometryMaterialPair[]> {
  const scene = await loadGLB(MAP_MISSION_ASTEROID_GLB_URL)
  fixMaterials(scene)
  return extractGeometryMaterialPairs(scene)
}

/**
 * Cached templates for mission-map asteroid previews.
 */
function getAsteroidShapeTemplates(): Promise<GeometryMaterialPair[]> {
  if (!asteroidShapeTemplatesPromise) {
    asteroidShapeTemplatesPromise = loadAsteroidShapeTemplates()
  }
  return asteroidShapeTemplatesPromise
}

/**
 * Deterministic 32-bit seed from a mission instance id for stable shape selection.
 *
 * @param missionId - `GeneratedAsteroidMission.id`
 * @returns Signed 32-bit integer; use with modulo against template count
 */
export function missionAsteroidShapeSeed(missionId: string): number {
  let h = 2166136261
  for (let i = 0; i < missionId.length; i++) {
    h ^= missionId.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h | 0
}

/**
 * Three deterministic samples in [0, 1) from a 32-bit seed (Euler angles).
 *
 * @param seed - Mixed mission shape seed
 */
function tripleUnitFromSeed(seed: number): readonly [number, number, number] {
  const mix = (salt: number): number => {
    let x = (Math.imul(seed ^ salt, 2654435761) | 0) >>> 0
    x ^= x >>> 16
    x = Math.imul(x, 2246822519)
    x ^= x >>> 13
    return (x >>> 0) / 0x1_0000_0000
  }
  return [mix(0x9e3779b1), mix(0x85ebca6b), mix(0xc2b2ae35)] as const
}

/**
 * Apply a fixed orientation from the shape seed.
 *
 * The map preview does not tumble: an irregular mesh rotating about the origin
 * shifts its silhouette and reads as the waypoint marker drifting.
 *
 * @param mesh - Preview mesh (local origin at geometry center)
 * @param shapeSeed - Same seed passed to {@link createMapMissionAsteroidPreviewMesh}
 */
function applyPreviewOrientationFromSeed(mesh: THREE.Object3D, shapeSeed: number): void {
  const mixed = shapeSeed ^ MAP_MISSION_ASTERO_ORIENTATION_SEED_SALT
  const [rx, ry, rz] = tripleUnitFromSeed(mixed)
  mesh.rotation.set(rx * Math.PI * 2, ry * Math.PI * 2, rz * Math.PI * 2)
}

/**
 * Tune a cloned standard material for map readability (belt-style soft PBR).
 *
 * @param material - Mesh material after clone
 */
function tunePreviewStandardMaterial(material: THREE.MeshStandardMaterial): void {
  material.roughness = Math.max(material.roughness, MAP_MISSION_ASTERO_PREVIEW_ROUGHNESS_MIN)
  material.metalness = Math.min(material.metalness, MAP_MISSION_ASTERO_PREVIEW_METALNESS_MAX)
  const [r, g, b] = MAP_MISSION_ASTERO_PREVIEW_EMISSIVE_RGB
  material.emissive = new THREE.Color(r, g, b)
  material.emissiveIntensity = MAP_MISSION_ASTERO_PREVIEW_EMISSIVE_INTENSITY
}

/**
 * Build a single large asteroid mesh for the map waypoint.
 *
 * @param shapeSeed - From {@link missionAsteroidShapeSeed}; picks variant and fixed orientation
 * @returns A mesh parented at local origin, geometry centered, ready to scale with the waypoint group
 */
export async function createMapMissionAsteroidPreviewMesh(shapeSeed: number): Promise<THREE.Mesh> {
  const templates = await getAsteroidShapeTemplates()
  if (templates.length === 0) {
    throw new Error(`No meshes in ${MAP_MISSION_ASTEROID_GLB_URL}`)
  }
  const idx = Math.abs(shapeSeed) % templates.length
  const { geometry, material } = templates[idx]!
  const mesh = new THREE.Mesh(geometry.clone(), material.clone())
  if (mesh.material instanceof THREE.MeshStandardMaterial) {
    tunePreviewStandardMaterial(mesh.material)
  }
  mesh.geometry.computeBoundingBox()
  const box = mesh.geometry.boundingBox
  if (box) {
    const center = new THREE.Vector3()
    box.getCenter(center)
    mesh.geometry.translate(-center.x, -center.y, -center.z)
  }
  mesh.scale.setScalar(MAP_MISSION_ASTERO_PREVIEW_BASE_SCALE)
  applyPreviewOrientationFromSeed(mesh, shapeSeed)
  mesh.frustumCulled = false
  mesh.name = 'mapMissionAsteroidPreview'
  return mesh
}

/**
 * Dispose geometry and materials for a preview mesh and detach it from the scene graph.
 *
 * @param mesh - Mesh returned from {@link createMapMissionAsteroidPreviewMesh}
 */
export function disposeMapMissionAsteroidPreviewMesh(mesh: THREE.Mesh): void {
  mesh.removeFromParent()
  mesh.geometry.dispose()
  const mats = mesh.material
  if (Array.isArray(mats)) {
    for (const m of mats) m.dispose()
  } else {
    mats.dispose()
  }
}
