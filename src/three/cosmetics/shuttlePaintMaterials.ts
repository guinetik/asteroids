/**
 * Runtime shuttle paint channel mapping for the Pimp My Shuttle cosmetic shop.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-30-cosmetic-shader-model-mapping.md
 */

import { findCosmeticOptionById } from '@/lib/cosmetics/catalog'
import { getPlayerCosmetics } from '@/lib/cosmetics/profileCosmetics'
import type { PlayerProfile } from '@/lib/player/types'
import * as THREE from 'three'
import {
  applyPaintRampShader,
  buildPaintRampTexture,
  computeMeshToVehicleLocal,
  computePaintRampBounds,
  updatePaintRampTexture,
  type PaintRampBounds,
} from './paintRampShader'

/** Shuttle paint channel inferred from GLB material names. */
export type ShuttlePaintChannel = 'primary' | 'secondary' | 'trim' | 'accent'

/**
 * A cloned shuttle material and its original color, bound to one paint channel.
 */
export interface ShuttlePaintMaterialTarget {
  /** Material instance assigned to a visible shuttle mesh. */
  readonly material: THREE.Material
  /** Color captured before the cosmetic paint mix was applied. */
  readonly baseColor: THREE.Color
  /** Shader channel selected from the source material name. */
  readonly channel: ShuttlePaintChannel
  /** Mesh geometry — used to compute ramp axis bounds. */
  readonly geometry: THREE.BufferGeometry
  /** Mesh-local → vehicle-local transform captured at collection time. */
  readonly meshToVehicleLocal: THREE.Matrix4
}

const SHUTTLE_PAINT_PRIMARY_MATERIALS = new Set([
  'wingtop',
  'wing flap top',
  'nose top',
  'side stb',
  'side prt',
  'OMS pod stb',
  'OMS pod prt',
  'tail',
  'shut-doors-top',
  'shut-doors-side',
])
const SHUTTLE_PAINT_SECONDARY_MATERIALS = new Set([
  'belly',
  'belly flap',
  'fusolage aft eng',
  'OMS pod prt back',
  'OMS pod stb back',
  'RCS aft stb',
  'RCS aft prt',
])
const SHUTTLE_PAINT_TRIM_MATERIALS = new Set([
  'nose tip',
  'bay prt wedges',
  'bay stb wedges',
  'bay prt edges',
  'bay stb edges',
  'doors edge',
  'cockpit side',
])
const SHUTTLE_PAINT_ACCENT_MATERIALS = new Set([
  'shut-handrails',
  'arrows top',
  'shut-cam-cargo',
  'bay prt evarail',
  'bay stb evarail',
  'bay prt doorlatc',
  'bay stb doorlatc',
])
const SHUTTLE_PAINT_COLOR_STRENGTH = 0.88
const SHUTTLE_HULL_COLOR_SCALE = 0.7
/** Shuttle gradient ramp flows nose→tail along the raw GLB X axis. */
const SHUTTLE_PAINT_RAMP_AXIS = 'x' as const
/** Tint mix strength for the shuttle ramp on top of the per-channel paint. */
const SHUTTLE_PAINT_RAMP_STRENGTH = 0.2
/** Cached ramp bounds per shuttle target list. */
const shuttleRampBoundsCache = new WeakMap<
  ReadonlyArray<ShuttlePaintMaterialTarget>,
  PaintRampBounds
>()

/**
 * Clone each paintable material on a shuttle scene and collect paint targets.
 *
 * @param root - Loaded shuttle scene or subtree.
 */
export function cloneAndCollectShuttlePaintMaterials(
  root: THREE.Object3D,
): ShuttlePaintMaterialTarget[] {
  root.updateMatrixWorld(true)
  const targets: ShuttlePaintMaterialTarget[] = []
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.material) return

    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) =>
        cloneAndCollectShuttlePaintMaterial(material, child, root, targets),
      )
      return
    }

    child.material = cloneAndCollectShuttlePaintMaterial(child.material, child, root, targets)
  })
  return targets
}

/**
 * Apply a shuttle paint catalog option directly to prepared material targets.
 *
 * @param targets - Prepared shuttle paint material targets.
 * @param optionId - `shuttle-paintjob` catalog row id.
 */
export function applyShuttlePaintMaterials(
  targets: readonly ShuttlePaintMaterialTarget[],
  optionId: string,
): void {
  const option = findCosmeticOptionById(optionId)
  if (!option || option.category !== 'shuttle-paintjob') return
  const primary = new THREE.Color(option.gradientStops[0] ?? '#ffffff')
  const secondary = new THREE.Color(option.gradientStops[1] ?? option.gradientStops[0] ?? '#ffffff')
  const trim = new THREE.Color(
    option.gradientStops[2] ?? option.gradientStops[1] ?? option.gradientStops[0] ?? '#ffffff',
  )
  const accent = new THREE.Color(
    option.gradientStops[2] ?? option.gradientStops[1] ?? option.gradientStops[0] ?? '#ffffff',
  )

  for (const target of targets) {
    applyMaterialPaintColor(
      target.material,
      target.baseColor,
      {
        primary,
        secondary,
        trim,
        accent,
      }[target.channel],
    )
  }

  applyShuttlePaintRamp(targets, option.gradientStops)
}

/**
 * Wire (or refresh) the gradient ramp shader on every shuttle paint target.
 *
 * @param targets - Shuttle paint targets.
 * @param gradientStops - Hex stops from the active cosmetic option.
 */
function applyShuttlePaintRamp(
  targets: readonly ShuttlePaintMaterialTarget[],
  gradientStops: readonly string[],
): void {
  if (targets.length === 0) return
  const rampTexture = buildPaintRampTexture(gradientStops)
  const bounds = getOrComputeShuttleRampBounds(targets)
  for (const target of targets) {
    const userData = target.material.userData as { paintRampUniforms?: unknown }
    if (userData.paintRampUniforms) {
      updatePaintRampTexture(target.material, rampTexture)
      continue
    }
    applyPaintRampShader(target.material, {
      rampTexture,
      axis: SHUTTLE_PAINT_RAMP_AXIS,
      axisBounds: bounds,
      strength: SHUTTLE_PAINT_RAMP_STRENGTH,
      meshToVehicleLocal: target.meshToVehicleLocal,
    })
  }
}

/**
 * Lazily compute and cache the shuttle's vehicle-local X bounds.
 *
 * @param targets - Shuttle paint targets.
 */
function getOrComputeShuttleRampBounds(
  targets: readonly ShuttlePaintMaterialTarget[],
): PaintRampBounds {
  const cached = shuttleRampBoundsCache.get(targets)
  if (cached) return cached
  const bounds = computePaintRampBounds(
    targets.map((target) => ({
      geometry: target.geometry,
      meshToVehicleLocal: target.meshToVehicleLocal,
    })),
    SHUTTLE_PAINT_RAMP_AXIS,
  )
  shuttleRampBoundsCache.set(targets, bounds)
  return bounds
}

/**
 * Apply the active shuttle paint row from a profile snapshot.
 *
 * @param targets - Prepared shuttle paint material targets.
 * @param profile - Player profile carrying active cosmetics.
 */
export function applyShuttlePaintMaterialsFromProfile(
  targets: readonly ShuttlePaintMaterialTarget[],
  profile: PlayerProfile,
): void {
  applyShuttlePaintMaterials(targets, getPlayerCosmetics(profile).shuttlePaintjobId)
}

/**
 * Return the paint channel for a shuttle material name.
 *
 * @param materialName - Material name from `public/models/shuttle.glb`.
 */
export function getShuttlePaintChannelForMaterialName(
  materialName: string,
): ShuttlePaintChannel | null {
  if (SHUTTLE_PAINT_PRIMARY_MATERIALS.has(materialName)) return 'primary'
  if (SHUTTLE_PAINT_SECONDARY_MATERIALS.has(materialName)) return 'secondary'
  if (SHUTTLE_PAINT_TRIM_MATERIALS.has(materialName)) return 'trim'
  if (SHUTTLE_PAINT_ACCENT_MATERIALS.has(materialName)) return 'accent'
  return null
}

/**
 * Read a material albedo color when the Three material type exposes one.
 *
 * @param material - Three.js material candidate.
 */
export function getShuttleMaterialColor(material: THREE.Material): THREE.Color | null {
  if (
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhysicalMaterial ||
    material instanceof THREE.MeshPhongMaterial ||
    material instanceof THREE.MeshLambertMaterial ||
    material instanceof THREE.MeshBasicMaterial
  ) {
    return material.color
  }
  return null
}

/**
 * Clone one shuttle material and append it to the paint target list when paintable.
 *
 * @param material - Source GLB material.
 * @param mesh - Mesh that owns the material (used for ramp transform + geometry).
 * @param vehicleRoot - Loaded shuttle scene root used as the ramp reference frame.
 * @param targets - Mutable target list owned by the caller.
 */
function cloneAndCollectShuttlePaintMaterial(
  material: THREE.Material,
  mesh: THREE.Mesh,
  vehicleRoot: THREE.Object3D,
  targets: ShuttlePaintMaterialTarget[],
): THREE.Material {
  const channel = getShuttlePaintChannelForMaterialName(material.name)
  if (!channel) return material
  const cloned = material.clone()
  const baseColor = getShuttleMaterialColor(cloned)
  if (baseColor) {
    targets.push({
      material: cloned,
      baseColor: baseColor.clone(),
      channel,
      geometry: mesh.geometry,
      meshToVehicleLocal: computeMeshToVehicleLocal(mesh, vehicleRoot),
    })
  }
  return cloned
}

/**
 * Mix one paint color into a material while preserving some authored albedo.
 *
 * @param material - Material to mutate.
 * @param baseColor - Captured pre-paint color.
 * @param paintColor - Cosmetic shader color for the material's channel.
 */
function applyMaterialPaintColor(
  material: THREE.Material,
  baseColor: THREE.Color,
  paintColor: THREE.Color,
): void {
  const materialColor = getShuttleMaterialColor(material)
  if (!materialColor) return
  materialColor.copy(baseColor).lerp(
    baseColor
      .clone()
      .multiply(paintColor)
      .multiplyScalar(1 / SHUTTLE_HULL_COLOR_SCALE),
    SHUTTLE_PAINT_COLOR_STRENGTH,
  )
  material.needsUpdate = true
}
