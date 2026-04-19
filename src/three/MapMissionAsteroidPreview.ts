/**
 * Small decorative asteroid mesh at the shuttle map mission waypoint.
 *
 * Uses a random shape from `asteroids.glb` (same pack as the belts). Sized so the rock reads
 * clearly on the solar map beside the cyan beam; **no rotation** so it
 * does not drift against the cyan marker under camera orbit.
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
 * Uniform scale after centering geometry at the origin (tripled from the first readable baseline).
 */
const MAP_MISSION_ASTERO_PREVIEW_SCALE_BASELINE = 60

/** Prior preview scale multiplier before {@link MAP_MISSION_ASTERO_PREVIEW_MAP_SIZE_RECENT_BUMP}. */
const MAP_MISSION_ASTERO_PREVIEW_MAP_SIZE_FACTOR_BASE = 0.92

/** Recent visual-only resize applied on top of {@link MAP_MISSION_ASTERO_PREVIEW_MAP_SIZE_FACTOR_BASE}. */
const MAP_MISSION_ASTERO_PREVIEW_MAP_SIZE_RECENT_BUMP = 1.12

const MAP_MISSION_ASTERO_PREVIEW_MAP_SIZE_FACTOR =
  MAP_MISSION_ASTERO_PREVIEW_MAP_SIZE_FACTOR_BASE * MAP_MISSION_ASTERO_PREVIEW_MAP_SIZE_RECENT_BUMP

const MAP_MISSION_ASTERO_PREVIEW_BASE_SCALE =
  MAP_MISSION_ASTERO_PREVIEW_SCALE_BASELINE * MAP_MISSION_ASTERO_PREVIEW_MAP_SIZE_FACTOR

/** Local X offset (parent applies screen scaling) so the mesh clears the cyan beam column. */
const MAP_MISSION_ASTERO_PREVIEW_LOCAL_OFFSET_X = 14

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

/** Cached GLB mesh template before cloning for mission previews. */
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
 * Build a single asteroid mesh for the map waypoint. No local rotation — avoids apparent drift
 * next to the waypoint under zoom and parallax.
 *
 * @param shapeSeed - From {@link missionAsteroidShapeSeed}; picks variant deterministically
 * @returns Mesh at local origin, geometry centered
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
  mesh.position.set(MAP_MISSION_ASTERO_PREVIEW_LOCAL_OFFSET_X, 0, 0)
  mesh.rotation.set(0, 0, 0)
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
